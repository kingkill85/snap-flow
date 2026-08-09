#!/usr/bin/env python3
"""Locked, transactional single-slot SnapFlow preview operations."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import time
import urllib.error
import urllib.request
import uuid

from neo_dev_webhook.manual_preview import (
    FIXED_ROUTE, FIXED_STACK, FULL_SHA, PreviewError, preflight_fixed_route,
    validate_compose, resolve_image_provenance, validate_image_provenance,
)

AUTH_VALUE = "OWNER_AUTHORIZED_MANUAL_PREVIEW"
MARKER = ".snapflow-preview-only"
COMPOSE = "compose.yaml"
BACKUPS = ".preview-backups"
LOCK = ".preview-slot.lock"
IMAGE = "ghcr.io/kingkill85/snap-flow"
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fixed SnapFlow manual-preview slot")
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("preflight", "verify", "deploy", "reset-seed"):
        command = actions.add_parser(action)
        command.add_argument("sha")
        if action != "preflight":
            command.add_argument("image_run", type=int)
    rollback_parser = actions.add_parser("rollback")
    rollback_parser.add_argument("backup_id")
    return parser


def _lstat_kind(path: pathlib.Path) -> int | None:
    try:
        return path.lstat().st_mode
    except FileNotFoundError:
        return None


def assert_preview_scope(path: pathlib.Path = FIXED_STACK) -> pathlib.Path:
    try:
        resolved = path.resolve(strict=True)
        expected = FIXED_STACK.resolve(strict=True)
    except OSError as error:
        raise PreviewError("fixed preview stack does not exist") from error
    if resolved != expected:
        raise PreviewError("target is not the fixed preview-only stack")
    current = pathlib.Path(resolved.anchor)
    for part in resolved.parts[1:]:
        current /= part
        if current.is_symlink():
            raise PreviewError("fixed preview path components must not be symlinks")
    marker_mode = _lstat_kind(resolved / MARKER)
    if marker_mode is None or not stat.S_ISREG(marker_mode):
        raise PreviewError("preview marker must be an ordinary no-follow file")
    for name in (COMPOSE, ".env", LOCK):
        mode = _lstat_kind(resolved / name)
        if mode is not None and not stat.S_ISREG(mode):
            raise PreviewError(f"{name} must be an ordinary no-follow file")
    backup_mode = _lstat_kind(resolved / BACKUPS)
    if backup_mode is not None and not stat.S_ISDIR(backup_mode):
        raise PreviewError("preview backup path must be an ordinary no-follow directory")
    for child in ("state", "uploads"):
        raw = resolved / child
        mode = _lstat_kind(raw)
        if mode is not None and not stat.S_ISDIR(mode):
            raise PreviewError("preview state path must be an ordinary no-follow directory")
        if mode is not None and any(item.is_symlink() for item in raw.rglob("*")):
            raise PreviewError("preview state contains a forbidden symlink")
    return resolved


@contextlib.contextmanager
def _slot_lock(path: pathlib.Path | None = None, *, timeout: float = 5.0):
    lock_path = path or (FIXED_STACK / LOCK)
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(lock_path, flags, 0o600)
    except OSError as error:
        raise PreviewError("preview slot lock is not a safe ordinary file") from error
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise PreviewError("preview slot lock is not an ordinary file")
        deadline = time.monotonic() + max(timeout, 0)
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError as error:
                if time.monotonic() >= deadline:
                    raise PreviewError("preview slot lock contention") from error
                time.sleep(min(0.05, max(deadline - time.monotonic(), 0)))
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _require_mutation_authority() -> None:
    if os.environ.get("SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED") != AUTH_VALUE:
        raise PreviewError("explicit preview mutation authorization is required")
    email = os.environ.get("PREVIEW_ADMIN_EMAIL", "")
    password = os.environ.get("PREVIEW_ADMIN_PASSWORD", "")
    secret = os.environ.get("PREVIEW_JWT_SECRET", "")
    if ("@" not in email or len(password) < 16
            or password.lower() in {"admin", "admin123", "password", "changeme"}
            or len(secret) < 32):
        raise PreviewError("non-default preview-only credentials are required")


def _run_compose(stack: pathlib.Path, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", "compose", "--project-directory", str(stack),
                           "-f", str(stack / COMPOSE), *arguments], check=True,
                          capture_output=True, text=True, timeout=180)


def _remove_container() -> None:
    result = subprocess.run(["docker", "rm", "-f", "snapflow-test"],
                            capture_output=True, text=True, timeout=30)
    if result.returncode != 0 and "No such container" not in result.stderr:
        raise PreviewError("could not prove attempted preview container absent")
    inspection = subprocess.run(["docker", "inspect", "snapflow-test"],
                                capture_output=True, text=True, timeout=30)
    if inspection.returncode == 0 or "No such object" not in inspection.stderr:
        raise PreviewError("could not prove attempted preview container absent")


def _atomic_write(path: pathlib.Path, content: str, mode: int = 0o600) -> None:
    parent_mode = _lstat_kind(path.parent)
    if parent_mode is None or not stat.S_ISDIR(parent_mode):
        raise PreviewError("atomic write parent is not an ordinary directory")
    target_mode = _lstat_kind(path)
    if target_mode is not None and not stat.S_ISREG(target_mode):
        raise PreviewError("atomic write target is not an ordinary file")
    temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                 | getattr(os, "O_NOFOLLOW", 0), mode)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


def _read_regular(path: pathlib.Path) -> bytes:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as error:
        raise PreviewError(f"{path.name} is not a safe ordinary file") from error
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise PreviewError(f"{path.name} is not a safe ordinary file")
        with os.fdopen(fd, "rb", closefd=False) as source:
            return source.read()
    finally:
        os.close(fd)


def _write_compose(stack: pathlib.Path, sha: str, digest: str) -> None:
    _atomic_write(stack / COMPOSE, render_compose(sha, digest))


def _backup(stack: pathlib.Path) -> pathlib.Path:
    backup_root = stack / BACKUPS
    mode = _lstat_kind(backup_root)
    if mode is None:
        os.mkdir(backup_root, 0o700)
        _fsync_directory(stack)
    elif not stat.S_ISDIR(mode):
        raise PreviewError("preview backup path is unsafe")
    backup_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{time.time_ns()}"
    target = backup_root / backup_id
    temporary = backup_root / f".incomplete-{uuid.uuid4().hex}"
    os.mkdir(temporary, 0o700)
    published = False
    try:
        names = (COMPOSE, ".env", "state", "uploads")
        presence = {name: _lstat_kind(stack / name) is not None for name in names}
        identity = _compose_identity(stack / COMPOSE) if presence[COMPOSE] else None
        state = {"presence": presence, "identity": identity}
        _atomic_write(temporary / "BACKUP_STATE.json",
                      json.dumps(state, sort_keys=True) + "\n")
        for name in (COMPOSE, ".env"):
            if presence[name]:
                _atomic_write(temporary / name, _read_regular(stack / name).decode())
        for name in ("state", "uploads"):
            if presence[name]:
                shutil.copytree(stack / name, temporary / name, symlinks=True)
        manifest = {
            str(item.relative_to(temporary)): hashlib.sha256(_read_regular(item)).hexdigest()
            for item in temporary.rglob("*") if item.is_file() and not item.is_symlink()
        }
        _atomic_write(temporary / "SHA256.json", json.dumps(manifest, sort_keys=True) + "\n")
        _fsync_tree(temporary)
        _verify_backup(temporary)
        os.replace(temporary, target)
        published = True
        _fsync_directory(backup_root)
        _verify_backup(target)
        return target
    except BaseException:
        if _lstat_kind(temporary) is not None:
            shutil.rmtree(temporary)
        if published and _lstat_kind(target) is not None:
            shutil.rmtree(target)
        raise


def _fsync_directory(path: pathlib.Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
                 | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _fsync_tree(path: pathlib.Path) -> None:
    for item in path.rglob("*"):
        if item.is_file() and not item.is_symlink():
            fd = os.open(item, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    directories = sorted((item for item in path.rglob("*") if item.is_dir()),
                         key=lambda value: len(value.parts), reverse=True)
    for directory in directories:
        _fsync_directory(directory)
    _fsync_directory(path)


def _verify_backup(target: pathlib.Path) -> None:
    if _lstat_kind(target) is None or not stat.S_ISDIR(target.lstat().st_mode):
        raise PreviewError("sealed backup verification failed")
    paths = list(target.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise PreviewError("sealed backup verification failed")
    try:
        manifest = json.loads((target / "SHA256.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("sealed backup verification failed") from error
    actual = {str(path.relative_to(target)) for path in paths
              if path.is_file() and path.name != "SHA256.json"}
    if (not isinstance(manifest, dict) or not manifest
            or any(not isinstance(name, str)
                   or re.fullmatch(r"[0-9a-f]{64}", str(digest)) is None
                   for name, digest in manifest.items())
            or set(manifest) != actual or any(
            ".." in pathlib.PurePosixPath(name).parts
            or hashlib.sha256((target / name).read_bytes()).hexdigest() != digest
            for name, digest in manifest.items())):
        raise PreviewError("sealed backup verification failed")
    try:
        state = json.loads(_read_regular(target / "BACKUP_STATE.json"))
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("sealed backup verification failed") from error
    names = {COMPOSE, ".env", "state", "uploads"}
    if (not isinstance(state, dict) or set(state) != {"presence", "identity"}
            or not isinstance(state["presence"], dict)
            or set(state["presence"]) != names
            or any(type(value) is not bool for value in state["presence"].values())
            or state["presence"][COMPOSE] != isinstance(state["identity"], dict)):
        raise PreviewError("sealed backup verification failed")
    if isinstance(state["identity"], dict) and (
            set(state["identity"]) != {"sha", "digest"}
            or FULL_SHA.fullmatch(str(state["identity"].get("sha", ""))) is None
            or DIGEST.fullmatch(str(state["identity"].get("digest", ""))) is None):
        raise PreviewError("sealed backup verification failed")
    for name in names:
        if (_lstat_kind(target / name) is not None) != state["presence"][name]:
            raise PreviewError("sealed backup verification failed")


def _restore_backup(stack: pathlib.Path, backup: pathlib.Path) -> dict:
    _verify_backup(backup)
    state = json.loads(_read_regular(backup / "BACKUP_STATE.json"))
    if not isinstance(state, dict) or set(state) != {"presence", "identity"}:
        raise PreviewError("sealed backup state is invalid")
    presence = state["presence"]
    names = {COMPOSE, ".env", "state", "uploads"}
    if set(presence) != names or any(type(value) is not bool for value in presence.values()):
        raise PreviewError("sealed backup state is invalid")
    if presence[COMPOSE] != isinstance(state["identity"], dict):
        raise PreviewError("sealed backup identity is invalid")
    for name in (COMPOSE, ".env"):
        target, source = stack / name, backup / name
        mode = _lstat_kind(target)
        if mode is not None and not stat.S_ISREG(mode):
            raise PreviewError("restore target is unsafe")
        if presence[name]: _atomic_write(target, _read_regular(source).decode())
        elif mode is not None: target.unlink()
    for name in ("state", "uploads"):
        target, source = stack / name, backup / name
        mode = _lstat_kind(target)
        if mode is not None and not stat.S_ISDIR(mode):
            raise PreviewError("restore target is unsafe")
        if mode is not None: shutil.rmtree(target)
        if presence[name]: shutil.copytree(source, target)
    return state


def _compose_identity(path: pathlib.Path) -> dict:
    text = _read_regular(path).decode()
    sha = re.search(r"BUILD_SHA=([0-9a-f]{40})", text)
    digest = re.search(rf"{re.escape(IMAGE)}@(sha256:[0-9a-f]{{64}})", text)
    if not sha or not digest:
        raise PreviewError("previous compose identity is not immutable")
    return {"sha": sha.group(1), "digest": digest.group(1)}


def render_compose(sha: str, digest: str) -> str:
    if not FULL_SHA.fullmatch(sha) or not DIGEST.fullmatch(digest):
        raise PreviewError("full SHA and sha256 image digest are required")
    template = pathlib.Path(__file__).parent / "deploy/manual-preview-compose.yaml"
    text = template.read_text().replace("__FULL_SHA__", sha).replace("__DIGEST__", digest)
    validate_compose(text, sha, digest)
    return text


def _wait_healthy(stack: pathlib.Path, timeout: float = 120) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            rows = json.loads(_run_compose(stack, "ps", "--format", "json").stdout)
            if rows and all(row.get("Health") == "healthy" for row in rows): return
        except (subprocess.SubprocessError, json.JSONDecodeError):
            pass
        time.sleep(1)
    raise PreviewError("preview stack did not become healthy")


def _provision_preview_admin(stack: pathlib.Path) -> None:
    program = (
        "import {userRepository} from './src/repositories/user.ts';"
        "import {hashPassword} from './src/services/password.ts';"
        "const email=Deno.env.get('ADMIN_EMAIL'),password=Deno.env.get('ADMIN_PASSWORD');"
        "if(!email||!password)throw Error('preview credentials missing');"
        "const user=await userRepository.findByEmail(email),password_hash=hashPassword(password);"
        "if(user)await userRepository.update(user.id,{password_hash,role:'admin'});"
        "else await userRepository.create({email,password_hash,full_name:'Preview Administrator',role:'admin'});"
        "console.log('preview account provisioned');"
    )
    _run_compose(stack, "exec", "-T", "snapflow-test", "deno", "eval",
                 "--allow-env", "--allow-read", "--allow-write", program)


def _baseline_fingerprint(stack: pathlib.Path) -> dict:
    program = (
        "import {getDb} from './src/config/database.ts';"
        "const email=Deno.env.get('ADMIN_EMAIL');if(!email)throw Error('email missing');"
        "const db=getDb();const admin=db.queryEntries('SELECT count(*) count FROM users WHERE email=?',[email])[0].count;"
        "const projects=db.queryEntries(\"SELECT count(*) count FROM projects p JOIN project_groups g ON g.id=p.project_group_id WHERE g.customer_name LIKE 'PREVIEW-SMOKE-%'\")[0].count;"
        "const groups=db.queryEntries(\"SELECT count(*) count FROM project_groups WHERE customer_name LIKE 'PREVIEW-SMOKE-%'\")[0].count;"
        "const orphans=db.queryEntries(\"SELECT count(*) count FROM project_groups g LEFT JOIN projects p ON p.project_group_id=g.id WHERE g.customer_name LIKE 'PREVIEW-SMOKE-%' AND p.id IS NULL\")[0].count;"
        "console.log(JSON.stringify({preview_admin_count:admin,smoke_projects:projects,smoke_groups:groups,orphan_smoke_groups:orphans}));"
    )
    result = _run_compose(stack, "exec", "-T", "snapflow-test", "deno", "eval",
                          "--allow-env", "--allow-read", "--allow-write", program)
    try:
        value = json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError) as error:
        raise PreviewError("preview baseline evidence was invalid") from error
    if value != {"preview_admin_count": 1, "smoke_projects": 0,
                 "smoke_groups": 0, "orphan_smoke_groups": 0}:
        raise PreviewError("preview reset baseline was not isolated and clean")
    return value


def _inspect_container() -> dict:
    container = json.loads(subprocess.run(
        ["docker", "inspect", "snapflow-test"], check=True, capture_output=True,
        text=True, timeout=30).stdout)[0]
    image = json.loads(subprocess.run(
        ["docker", "image", "inspect", container["Image"]], check=True,
        capture_output=True, text=True, timeout=30).stdout)[0]
    return {
        "repo_digests": image.get("RepoDigests", []),
        "revision": image.get("Config", {}).get("Labels", {}).get(
            "org.opencontainers.image.revision"),
        "run_id": int(image.get("Config", {}).get("Labels", {}).get(
            "org.snapflow.preview.run-id", "0")),
        "image": container.get("Config", {}).get("Image", ""),
        "mounts": {mount.get("Destination"): mount.get("Source")
                   for mount in container.get("Mounts", [])},
    }


def _run_smoke(sha: str, phase: str, created_id: str | None = None,
               project_group_id: str | None = None) -> dict:
    environment = {**os.environ, "EXPECTED_SHA": sha, "PREVIEW_SMOKE_PHASE": phase}
    if created_id: environment["PREVIEW_SMOKE_ID"] = created_id
    if project_group_id: environment["PREVIEW_SMOKE_GROUP_ID"] = project_group_id
    result = subprocess.run(["npm", "run", "e2e:preview-smoke"], check=True,
                            capture_output=True, text=True, timeout=120,
                            cwd=pathlib.Path(__file__).parents[2], env=environment)
    try:
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError) as error:
        raise PreviewError("preview browser smoke returned invalid evidence") from error


_SMOKE_KEYS = {
    "create": {"phase", "sha", "route", "created_id", "project_group_id", "reload_proven",
               "mobile_viewport"},
    "verify-cleanup": {"phase", "sha", "route", "created_id", "project_group_id",
                       "restart_proven", "cleanup_proven", "mobile_viewport"},
    "cleanup": {"phase", "sha", "route", "created_id", "project_group_id", "cleanup_proven",
                "mobile_viewport"},
}


def _validate_smoke_output(value: object, phase: str, requested_sha: str,
                           expected_id: str | None = None,
                           expected_group_id: str | None = None) -> dict:
    expected_keys = _SMOKE_KEYS.get(phase)
    if expected_keys is None or not isinstance(value, dict) or set(value) != expected_keys:
        raise PreviewError("preview browser smoke evidence has an invalid phase schema")
    if (value["phase"] != phase or value["sha"] != requested_sha
            or not isinstance(value["sha"], str)
            or not FULL_SHA.fullmatch(value["sha"])
            or value["route"] != FIXED_ROUTE
            or type(value["route"]) is not str
            or value["mobile_viewport"] != {"width": 390, "height": 844}
            or not isinstance(value["mobile_viewport"], dict)
            or set(value["mobile_viewport"]) != {"width", "height"}
            or type(value["mobile_viewport"]["width"]) is not int
            or type(value["mobile_viewport"]["height"]) is not int
            or not isinstance(value["created_id"], str)
            or not re.fullmatch(r"[1-9][0-9]*", value["created_id"])
            or not isinstance(value["project_group_id"], str)
            or not re.fullmatch(r"[1-9][0-9]*", value["project_group_id"])):
        raise PreviewError("preview browser smoke evidence identity is invalid")
    if expected_id is not None and value["created_id"] != expected_id:
        raise PreviewError("preview browser smoke project identity changed between phases")
    if (expected_group_id is not None
            and value["project_group_id"] != expected_group_id):
        raise PreviewError("preview browser smoke group identity changed between phases")
    for key in expected_keys & {"reload_proven", "restart_proven", "cleanup_proven"}:
        if type(value[key]) is not bool or value[key] is not True:
            raise PreviewError("preview browser smoke proof is incomplete")
    return value


def _verify_route_auth_boundary() -> None:
    try:
        with urllib.request.urlopen(FIXED_ROUTE + "/login", timeout=5) as response:
            if response.status != 200:
                raise PreviewError("fixed preview login route is unavailable")
    except (urllib.error.URLError, urllib.error.HTTPError) as error:
        raise PreviewError("fixed preview login route is unavailable") from error
    try:
        urllib.request.urlopen(FIXED_ROUTE + "/api/projects", timeout=5)
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            return
        raise PreviewError("fixed preview authentication boundary is invalid") from error
    except urllib.error.URLError as error:
        raise PreviewError("fixed preview authentication boundary is unreachable") from error
    raise PreviewError("fixed preview route exposed protected data without authentication")


def _validate_deployment_evidence(provenance: dict, observations: dict) -> dict:
    validate_image_provenance(provenance)
    if (not isinstance(observations, dict)
            or set(observations) != {"sha", "digest", "run_id"}
            or observations.get("sha") != provenance["sha"]
            or observations.get("digest") != provenance["digest"]
            or observations.get("run_id") != provenance["run_id"]):
        raise PreviewError("running deployment evidence does not match image provenance")
    return observations


def _verify_prior_identity(sha: str, digest: str) -> None:
    inspected = _inspect_container()
    if (inspected.get("revision") != sha
            or f"{IMAGE}@{digest}" not in inspected.get("repo_digests", [])):
        raise PreviewError("restored prior image identity does not match sealed backup")


def verify(provenance: dict, *, scope: pathlib.Path | None = None,
           run_external: bool = True) -> dict:
    validate_image_provenance(provenance)
    sha, digest = provenance["sha"], provenance["digest"]
    if not FULL_SHA.fullmatch(sha) or not DIGEST.fullmatch(digest):
        raise PreviewError("full SHA and sha256 image digest are required")
    stack = scope or assert_preview_scope()
    if scope is None:
        validate_compose((stack / COMPOSE).read_text(), sha, digest)
    inspected = _inspect_container()
    expected_repo_digest = f"{IMAGE}@{digest}"
    observed_repo_digest = next((value for value in inspected["repo_digests"]
                                 if value == expected_repo_digest), None)
    if observed_repo_digest is None:
        raise PreviewError("running image RepoDigest does not match deployment digest")
    if inspected["revision"] != sha:
        raise PreviewError("running OCI revision does not match requested SHA")
    observations = {"sha": inspected["revision"],
                    "digest": observed_repo_digest.removeprefix(f"{IMAGE}@"),
                    "run_id": inspected.get("run_id")}
    _validate_deployment_evidence(provenance, observations)
    if scope is not None and not run_external:
        return {"provenance": provenance, "deployment_evidence": observations}
    expected_mounts = {"/app/backend/data": str((stack / "state").resolve()),
                       "/app/backend/uploads": str((stack / "uploads").resolve())}
    if inspected["mounts"] != expected_mounts:
        raise PreviewError("running mounts are not isolated preview mounts")
    _wait_healthy(stack)
    version = json.loads(subprocess.run(
        ["docker", "exec", "snapflow-test", "deno", "eval",
         "console.log(await (await fetch('http://localhost:8000/version')).text())"],
        check=True, capture_output=True, text=True, timeout=30).stdout)
    if version.get("sha") != sha: raise PreviewError("running /version SHA does not match")
    preflight_fixed_route(); _verify_route_auth_boundary()
    return {"stack": str(FIXED_STACK), "route": FIXED_ROUTE,
            "provenance": provenance, "deployment_evidence": observations,
            "health": "healthy"}


def _cleanup_smoke_project(sha: str, created_id: str, project_group_id: str) -> None:
    _validate_smoke_output(
        _run_smoke(sha, "cleanup", created_id, project_group_id),
        "cleanup", sha, created_id, project_group_id)


def _exercise_persistence(stack: pathlib.Path, provenance: dict,
                          deployment_evidence: dict,
                          *, reset_repeatable: bool = False) -> dict:
    _validate_deployment_evidence(provenance, deployment_evidence)
    sha = provenance["sha"]
    created_id = None
    project_group_id = None
    try:
        raw_created = _run_smoke(sha, "create")
        if (isinstance(raw_created, dict)
                and isinstance(raw_created.get("created_id"), str)
                and re.fullmatch(r"[1-9][0-9]*", raw_created["created_id"])):
            created_id = raw_created["created_id"]
        if (isinstance(raw_created, dict)
                and isinstance(raw_created.get("project_group_id"), str)
                and re.fullmatch(r"[1-9][0-9]*", raw_created["project_group_id"])):
            project_group_id = raw_created["project_group_id"]
        created = _validate_smoke_output(raw_created, "create", sha)
        _run_compose(stack, "restart")
        _wait_healthy(stack)
        persisted = _validate_smoke_output(
            _run_smoke(sha, "verify-cleanup", created_id, project_group_id),
            "verify-cleanup", sha, created_id, project_group_id)
        evidence = {"sha": persisted["sha"], "route": persisted["route"],
                    "digest": deployment_evidence["digest"],
                    "run_id": deployment_evidence["run_id"],
                    "created_id": persisted["created_id"],
                    "project_group_id": persisted["project_group_id"],
                    "reload_proven": created["reload_proven"],
                    "restart_proven": persisted["restart_proven"],
                    "reset_repeatable": reset_repeatable,
                    "mobile_viewport": persisted["mobile_viewport"]}
        return {"verifier_evidence": evidence}
    except BaseException as original:
        if not isinstance(created_id, str) or not isinstance(project_group_id, str):
            raise PreviewError(f"persistence exercise failed: {original}") from original
        try:
            _cleanup_smoke_project(sha, created_id, project_group_id)
        except BaseException as cleanup:
            raise PreviewError(
                f"persistence exercise failed: {original}; cleanup failed: {cleanup}"
            ) from original
        raise PreviewError(f"persistence exercise failed; cleanup completed: {original}") from original


def _resume_or_prove_absent(stack: pathlib.Path, backup: pathlib.Path) -> None:
    state = _restore_backup(stack, backup)
    if state["presence"][COMPOSE]:
        _run_compose(stack, "up", "-d", "--remove-orphans")
        _wait_healthy(stack)
        _verify_prior_identity(state["identity"]["sha"], state["identity"]["digest"])
    else:
        _remove_container()


def _quiesce(stack: pathlib.Path) -> None:
    if _lstat_kind(stack / COMPOSE) is not None:
        _run_compose(stack, "down")
    else:
        _remove_container()


def _capture_prior(stack: pathlib.Path) -> dict:
    names = (COMPOSE, ".env", "state", "uploads")
    presence = {name: _lstat_kind(stack / name) is not None for name in names}
    return {"presence": presence,
            "identity": _compose_identity(stack / COMPOSE) if presence[COMPOSE] else None}


def _resume_prior(stack: pathlib.Path, prior: dict) -> None:
    if prior["presence"][COMPOSE]:
        identity = prior["identity"]
        _run_compose(stack, "up", "-d", "--remove-orphans")
        _wait_healthy(stack)
        _verify_prior_identity(identity["sha"], identity["digest"])
    else:
        _remove_container()


def _snapshot_or_resume(stack: pathlib.Path, prior: dict, action: str) -> pathlib.Path:
    try:
        return _backup(stack)
    except BaseException as original:
        try:
            _resume_prior(stack, prior)
        except BaseException as resume:
            raise PreviewError(
                f"{action} snapshot failed: {original}; prior-slot resume failed: {resume}"
            ) from original
        raise PreviewError(f"{action} snapshot failed; prior slot resumed: {original}") from original


def _rollback_failed_action(stack: pathlib.Path, backup: pathlib.Path,
                            original: BaseException, action: str) -> PreviewError:
    errors = []
    try:
        _quiesce(stack)
    except BaseException as error:
        errors.append(f"attempt teardown failed: {error}")
        try:
            _remove_container()
        except BaseException as remove_error:
            errors.append(f"forced teardown failed: {remove_error}")
            return PreviewError(f"{action} failed: {original}; rollback failed: {'; '.join(errors)}")
    try:
        _resume_or_prove_absent(stack, backup)
    except BaseException as error:
        errors.append(str(error))
    suffix = f"; rollback failed: {'; '.join(errors)}" if errors else "; previous slot restored"
    return PreviewError(f"{action} failed: {original}{suffix}")


def deploy(provenance: dict) -> dict:
    validate_image_provenance(provenance)
    sha, digest = provenance["sha"], provenance["digest"]
    _require_mutation_authority(); preflight_fixed_route()
    stack = assert_preview_scope()
    with _slot_lock(stack / LOCK):
        prior = _capture_prior(stack)
        _quiesce(stack)
        backup = _snapshot_or_resume(stack, prior, "deploy")
        try:
            _write_compose(stack, sha, digest)
            _run_compose(stack, "pull")
            _run_compose(stack, "up", "-d", "--remove-orphans")
            _wait_healthy(stack)
            _provision_preview_admin(stack)
            result = verify(provenance)
            result.update(_exercise_persistence(
                stack, provenance, result["deployment_evidence"]))
        except BaseException as original:
            raise _rollback_failed_action(stack, backup, original, "deploy") from original
        result["backup_id"] = backup.name
        return result


def reset_seed(provenance: dict) -> dict:
    validate_image_provenance(provenance)
    sha, digest = provenance["sha"], provenance["digest"]
    _require_mutation_authority(); stack = assert_preview_scope()
    with _slot_lock(stack / LOCK):
        prior = _capture_prior(stack)
        _quiesce(stack)
        backup = _snapshot_or_resume(stack, prior, "reset")
        try:
            first = _reset_once(stack)
            second = _reset_once(stack)
            if first != second:
                raise PreviewError("independent reset cycles produced different baselines")
            result = verify(provenance)
            result.update(_exercise_persistence(
                stack, provenance, result["deployment_evidence"], reset_repeatable=True))
            final_baseline = _baseline_fingerprint(stack)
            if final_baseline != second:
                raise PreviewError("persistence exercise did not leave the defined reset baseline")
        except BaseException as original:
            raise _rollback_failed_action(stack, backup, original, "reset") from original
        result["backup_id"] = backup.name
        result["seed"] = "repeatable"
        return result


def _reset_once(stack: pathlib.Path) -> dict:
    _quiesce(stack)
    for name in ("state", "uploads"):
        target = stack / name
        mode = _lstat_kind(target)
        if mode is not None and not stat.S_ISDIR(mode):
            raise PreviewError("reset target is not an ordinary preview directory")
        if mode is not None:
            shutil.rmtree(target)
        target.mkdir(mode=0o700)
    _run_compose(stack, "up", "-d")
    _wait_healthy(stack)
    _provision_preview_admin(stack)
    return _baseline_fingerprint(stack)


def rollback(backup_id: str) -> dict:
    _require_mutation_authority(); stack = assert_preview_scope()
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9]{19}", backup_id):
        raise PreviewError("invalid backup identifier")
    with _slot_lock(stack / LOCK):
        prior = _capture_prior(stack)
        _quiesce(stack)
        current = _snapshot_or_resume(stack, prior, "rollback")
        backup = stack / BACKUPS / backup_id
        try:
            _resume_or_prove_absent(stack, backup)
        except BaseException as original:
            raise _rollback_failed_action(stack, current, original, "rollback") from original
        return {"stack": str(stack), "restored_backup": backup_id}


def main() -> None:
    args = build_parser().parse_args()
    if args.action == "preflight":
        if not FULL_SHA.fullmatch(args.sha): raise PreviewError("full SHA required")
        preflight_fixed_route(); result = {"route": FIXED_ROUTE, "sha": args.sha, "reachable": True}
    elif args.action == "verify": result = verify(resolve_image_provenance(args.image_run, args.sha))
    elif args.action == "deploy": result = deploy(resolve_image_provenance(args.image_run, args.sha))
    elif args.action == "reset-seed": result = reset_seed(resolve_image_provenance(args.image_run, args.sha))
    else: result = rollback(args.backup_id)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__": main()
