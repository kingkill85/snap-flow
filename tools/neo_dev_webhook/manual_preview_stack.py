#!/usr/bin/env python3
"""Single-slot SnapFlow preview deployment operations. No remote routing mutations."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from neo_dev_webhook.manual_preview import (
    FIXED_ROUTE, FIXED_STACK, FULL_SHA, PreviewError, preflight_fixed_route,
    validate_compose,
)

AUTH_VALUE = "OWNER_AUTHORIZED_MANUAL_PREVIEW"
MARKER = ".snapflow-preview-only"
COMPOSE = "compose.yaml"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fixed SnapFlow manual-preview slot")
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("preflight", "verify", "deploy", "reset-seed"):
        command = actions.add_parser(action)
        command.add_argument("sha")
    rollback = actions.add_parser("rollback")
    rollback.add_argument("backup_id")
    return parser


def assert_preview_scope(path: pathlib.Path = FIXED_STACK) -> pathlib.Path:
    try:
        resolved = path.resolve(strict=True)
        expected = FIXED_STACK.resolve(strict=True)
    except OSError as error:
        raise PreviewError("fixed preview stack does not exist") from error
    if resolved != expected or not (resolved / MARKER).is_file():
        raise PreviewError("target is not the marked fixed preview-only stack")
    for child in ("state", "uploads"):
        raw_candidate = resolved / child
        candidate = raw_candidate.resolve()
        if candidate.parent != resolved or raw_candidate.is_symlink():
            raise PreviewError("preview state path escapes or aliases fixed stack")
        if raw_candidate.exists() and any(path.is_symlink() for path in raw_candidate.rglob("*")):
            raise PreviewError("preview state contains a forbidden symlink")
    return resolved


def _require_mutation_authority() -> None:
    if os.environ.get("SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED") != AUTH_VALUE:
        raise PreviewError("explicit preview mutation authorization is required")
    password = os.environ.get("PREVIEW_ADMIN_PASSWORD", "")
    secret = os.environ.get("PREVIEW_JWT_SECRET", "")
    if (len(password) < 16 or password.lower() in {"admin", "admin123", "password", "changeme"}
            or len(secret) < 32):
        raise PreviewError("non-default preview-only credentials are required")


def _run_compose(stack: pathlib.Path, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", "compose", "--project-directory", str(stack),
                           "-f", str(stack / COMPOSE), *arguments], check=True,
                          capture_output=True, text=True, timeout=180)


def _backup(stack: pathlib.Path) -> pathlib.Path:
    backup_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{time.time_ns()}"
    target = stack / ".preview-backups" / backup_id
    target.mkdir(parents=True, mode=0o700)
    presence = {name: (stack / name).exists()
                for name in (COMPOSE, ".env", "state", "uploads")}
    (target / "BACKUP_STATE.json").write_text(
        json.dumps(presence, sort_keys=True) + "\n")
    for name in (COMPOSE, ".env"):
        source = stack / name
        if source.exists():
            shutil.copy2(source, target / name)
    for name in ("state", "uploads"):
        source = stack / name
        if source.exists():
            shutil.copytree(source, target / name, symlinks=False)
    manifest = {}
    for item in sorted(target.rglob("*")):
        if item.is_file():
            manifest[str(item.relative_to(target))] = hashlib.sha256(item.read_bytes()).hexdigest()
    (target / "SHA256.json").write_text(json.dumps(manifest, sort_keys=True) + "\n")
    os.chmod(target / "SHA256.json", 0o600)
    return target


def _verify_backup(target: pathlib.Path) -> None:
    try:
        manifest = json.loads((target / "SHA256.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("sealed backup verification failed") from error
    paths = list(target.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise PreviewError("sealed backup verification failed")
    actual = {str(path.relative_to(target)) for path in paths
              if path.is_file() and path.name != "SHA256.json"}
    if (not manifest or set(manifest) != actual
            or any(hashlib.sha256((target / name).read_bytes()).hexdigest() != digest
                   for name, digest in manifest.items())):
        raise PreviewError("sealed backup verification failed")


def _restore_backup(stack: pathlib.Path, backup: pathlib.Path) -> None:
    _verify_backup(backup)
    try:
        presence = json.loads((backup / "BACKUP_STATE.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("sealed backup state is invalid") from error
    expected_presence = {COMPOSE, ".env", "state", "uploads"}
    if set(presence) != expected_presence or any(type(value) is not bool
                                                  for value in presence.values()):
        raise PreviewError("sealed backup state is invalid")
    for name in (COMPOSE, ".env"):
        target = stack / name
        source = backup / name
        if presence[name]:
            if not source.exists():
                raise PreviewError("sealed backup presence does not match content")
            shutil.copy2(source, target)
        else:
            if source.exists():
                raise PreviewError("sealed backup presence does not match content")
            if target.exists():
                target.unlink()
    for name in ("state", "uploads"):
        target = stack / name
        if target.exists():
            shutil.rmtree(target)
        source = backup / name
        if presence[name]:
            if not source.exists():
                raise PreviewError("sealed backup presence does not match content")
            shutil.copytree(source, target)
        elif source.exists():
            raise PreviewError("sealed backup presence does not match content")


def _verify_route_contract() -> None:
    try:
        with urllib.request.urlopen(FIXED_ROUTE + "/login", timeout=5) as response:
            if response.status != 200:
                raise PreviewError("browser-ready login route is unavailable")
    except (urllib.error.URLError, urllib.error.HTTPError) as error:
        raise PreviewError("browser-ready login route is unavailable") from error
    try:
        urllib.request.urlopen(FIXED_ROUTE + "/api/projects", timeout=5)
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            return
        raise PreviewError("route authentication contract is invalid") from error
    except urllib.error.URLError as error:
        raise PreviewError("route authentication contract is unreachable") from error
    raise PreviewError("protected real route allowed unauthenticated access")


def render_compose(sha: str) -> str:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("full lowercase 40-character SHA required")
    template = pathlib.Path(__file__).parent / "deploy/manual-preview-compose.yaml"
    text = template.read_text().replace("__FULL_SHA__", sha)
    validate_compose(text, sha)
    return text


def verify(sha: str) -> dict:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("full lowercase 40-character SHA required")
    stack = assert_preview_scope()
    validate_compose((stack / COMPOSE).read_text(), sha)
    preflight_fixed_route()
    _verify_route_contract()
    compose = json.loads(_run_compose(stack, "ps", "--format", "json").stdout)
    if not compose or any(item.get("Health") != "healthy" for item in compose):
        raise PreviewError("preview compose container is not healthy")
    inspect = json.loads(subprocess.run(
        ["docker", "inspect", "snapflow-test"], check=True, capture_output=True,
        text=True, timeout=30).stdout)[0]
    revision = inspect.get("Config", {}).get("Labels", {}).get(
        "org.opencontainers.image.revision")
    image = inspect.get("Config", {}).get("Image", "")
    mounts = {mount.get("Destination"): mount.get("Source")
              for mount in inspect.get("Mounts", [])}
    expected_mounts = {
        "/app/backend/data": str((stack / "state").resolve()),
        "/app/backend/uploads": str((stack / "uploads").resolve()),
    }
    if mounts != expected_mounts:
        raise PreviewError("running mounts are not the isolated preview state and uploads")
    if revision != sha or (f"sha-{sha}" not in image and "@sha256:" not in image):
        raise PreviewError("running image provenance does not match requested SHA")
    version = json.loads(subprocess.run(
        ["docker", "exec", "snapflow-test", "deno", "eval",
         "console.log(await (await fetch('http://localhost:8000/version')).text())"],
        check=True, capture_output=True, text=True, timeout=30).stdout)
    if version.get("sha") != sha:
        raise PreviewError("running /version SHA does not match")
    subprocess.run(
        ["npm", "run", "e2e:preview-smoke"], check=True, capture_output=True,
        text=True, timeout=120, cwd=pathlib.Path(__file__).parents[2],
        env={**os.environ, "EXPECTED_SHA": sha},
    )
    return {"stack": str(FIXED_STACK), "route": FIXED_ROUTE, "sha": sha,
            "image": image, "revision": revision, "health": "healthy"}


def deploy(sha: str) -> dict:
    _require_mutation_authority()
    stack = assert_preview_scope()
    preflight_fixed_route()
    backup = _backup(stack)
    with tempfile.NamedTemporaryFile("w", dir=stack, delete=False) as output:
        output.write(render_compose(sha))
        temporary = pathlib.Path(output.name)
    os.replace(temporary, stack / COMPOSE)
    try:
        _run_compose(stack, "pull")
        _run_compose(stack, "up", "-d", "--remove-orphans")
        result = verify(sha)
    except BaseException:
        _restore_backup(stack, backup)
        if (stack / COMPOSE).exists():
            _run_compose(stack, "up", "-d", "--remove-orphans")
        raise
    result["backup_id"] = backup.name
    return result


def reset_seed(sha: str) -> dict:
    _require_mutation_authority()
    stack = assert_preview_scope()
    backup = _backup(stack)
    try:
        _run_compose(stack, "down")
        for name in ("state", "uploads"):
            target = stack / name
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(mode=0o700)
        (stack / "state" / MARKER).write_text("preview-only\n")
        _run_compose(stack, "up", "-d")
        seed_program = (
            "import {userRepository} from './src/repositories/user.ts';"
            "import {hashPassword} from './src/services/password.ts';"
            "const email=Deno.env.get('ADMIN_EMAIL');const password=Deno.env.get('ADMIN_PASSWORD');"
            "if(!email||!password)throw Error('preview credentials missing');"
            "const current=await userRepository.findByEmail(email);const password_hash=hashPassword(password);"
            "if(current)await userRepository.update(current.id,{password_hash,role:'admin'});"
            "else await userRepository.create({email,password_hash,full_name:'Preview Administrator',role:'admin'});"
            "console.log('preview seed complete');"
        )
        for _ in range(2):
            _run_compose(stack, "exec", "-T", "snapflow-test", "deno", "eval",
                         "--allow-env", "--allow-read", "--allow-write", seed_program)
        result = verify(sha)
    except BaseException as reset_error:
        try:
            _restore_backup(stack, backup)
            if (stack / COMPOSE).exists():
                _run_compose(stack, "up", "-d", "--remove-orphans")
        except BaseException as rollback_error:
            raise PreviewError(
                f"reset failed and rollback failed: {rollback_error}"
            ) from reset_error
        raise PreviewError("reset failed; previous stack restored") from reset_error
    result["backup_id"] = backup.name
    result["seed"] = "completed"
    return result


def rollback(backup_id: str) -> dict:
    _require_mutation_authority()
    stack = assert_preview_scope()
    if not __import__("re").fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9]{19}", backup_id):
        raise PreviewError("invalid backup identifier")
    backup = stack / ".preview-backups" / backup_id
    _restore_backup(stack, backup)
    _run_compose(stack, "up", "-d", "--remove-orphans")
    return {"stack": str(stack), "restored_backup": backup_id}


def main() -> None:
    args = build_parser().parse_args()
    if args.action == "preflight":
        if not FULL_SHA.fullmatch(args.sha):
            raise PreviewError("full lowercase 40-character SHA required")
        preflight_fixed_route()
        result = {"route": FIXED_ROUTE, "sha": args.sha, "reachable": True}
    elif args.action == "verify": result = verify(args.sha)
    elif args.action == "deploy": result = deploy(args.sha)
    elif args.action == "reset-seed": result = reset_seed(args.sha)
    else: result = rollback(args.backup_id)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
