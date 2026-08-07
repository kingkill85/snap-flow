#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
live_root=/opt/data/services/snapflow-neo-dev-webhook
stack_root=/opt/data/build/snapflow-neo-dev-webhook
backup_root=/var/lib/neo-dev/backups
profile=/opt/data/profiles/dev/projects/snapflow.md
container=snapflow-dev
controller_user=neo-controller

require_root() { test "$(id -u)" -eq 0 || { echo "root required" >&2; exit 1; }; }
backup_host_path() {
  local source=$1 name=$2 destination=$3
  if test -e "$source"; then
    printf 'present\n' >"$destination/$name.present"
    cp -a "$source" "$destination/$name"
  else
    printf 'absent\n' >"$destination/$name.absent"
  fi
}
backup_container_path() {
  local path=$1 destination=$2
  if docker exec -u root "$container" test -e "$path"; then
    printf '%s\n' "$path" >>"$destination/container.present"
    docker exec -u root "$container" stat -c '%n\t%u\t%g\t%a' "$path" >>"$destination/container.metadata"
    docker cp "$container:$path" "$destination/container$path"
  else
    printf '%s\n' "$path" >>"$destination/container.absent"
  fi
}
verify_source() {
  test -f "$stack_root/compose.yaml"
  test -d "$live_root"
  test -f /opt/data/credentials/snapflow-dev-client
  test -f /opt/data/credentials/snapflow-dev-client.pub
  test -f /opt/data/tailscale_known_hosts
  PYTHONPATH="$repo_root/tools" python3 -c 'import pathlib; from neo_dev_webhook.deployment import validate_pinned_host; validate_pinned_host(pathlib.Path("/opt/data/tailscale_known_hosts"), "192.168.178.4", 2222)'
  test -s "$profile"
  test -s /var/lib/neo-dev/neo-dev.sqlite
  test "$(stat -c '%U:%G:%a' /opt/data/credentials/snapflow-dev-client)" = root:root:400
  docker inspect "$container" >/dev/null
  for tool in git gh tmux codex python3 sudo; do docker exec -u root "$container" sh -c "command -v $tool" >/dev/null; done
}
install_profile_block() {
  test -s "$profile"
  if grep -Fq '<!-- snapflow-neo-dev-orchestrator:start -->' "$profile"; then
    return
  fi
  printf '\n' >>"$profile"
  sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' \
    "$repo_root/tools/neo_dev_webhook/deploy/profile.managed-block.md" >>"$profile"
}
install_container() {
  local controller=$repo_root/tools/neo_dev_webhook/controller
  docker exec -u root "$container" install -d -o root -g root -m 0755 /usr/local/lib/neo_dev_webhook /etc/neo-dev/project-control
  docker exec -u root "$container" sh -c 'id neo-controller >/dev/null 2>&1 || { useradd --system --create-home --shell /bin/sh neo-controller && passwd -l neo-controller; }'
  docker exec -u root "$container" install -d -o "$controller_user" -g "$controller_user" -m 0700 /var/lib/neo-dev/project-control
  for file in __init__.py project_control.py codex_runtime.py verification.py forced_command.py; do
    docker cp "$repo_root/tools/neo_dev_webhook/$file" "$container:/usr/local/lib/neo_dev_webhook/$file"
    docker exec -u root "$container" chown root:root "/usr/local/lib/neo_dev_webhook/$file"
    docker exec -u root "$container" chmod 0644 "/usr/local/lib/neo_dev_webhook/$file"
  done
  docker cp "$controller/registry.v1.json" "$container:/etc/neo-dev/project-control/registry.json"
  docker cp "$controller/card-capability-policy.v1.json" "$container:/etc/neo-dev/project-control/card-capability-policy.json"
  docker cp "$controller/state-schema.v1.json" "$container:/etc/neo-dev/project-control/state-schema.json"
  docker exec -u root "$container" chown root:root /etc/neo-dev/project-control/registry.json /etc/neo-dev/project-control/card-capability-policy.json /etc/neo-dev/project-control/state-schema.json
  docker exec -u root "$container" chmod 0644 /etc/neo-dev/project-control/registry.json /etc/neo-dev/project-control/card-capability-policy.json /etc/neo-dev/project-control/state-schema.json
  docker exec -u root "$container" install -d -o root -g root -m 0755 /usr/local/lib/neo-dev-project-control
  for pair in 'neo-dev-project-control:/usr/local/bin/neo-dev-project-control' 'neo-dev-codex-runtime:/usr/local/lib/neo-dev-project-control/neo-dev-codex-runtime' 'neo-dev-forced-command:/usr/local/bin/neo-dev-forced-command' 'neo-dev-project-control-privileged:/usr/local/sbin/neo-dev-project-control-privileged' 'neo-dev-codex-runtime-privileged:/usr/local/sbin/neo-dev-codex-runtime-privileged'; do
    src=${pair%%:*}; dst=${pair#*:}
    docker cp "$controller/$src" "$container:$dst"
    docker exec -u root "$container" chown root:root "$dst"
    docker exec -u root "$container" chmod 0755 "$dst"
  done
  docker cp "$controller/neo-dev-control.sudoers" "$container:/etc/sudoers.d/neo-dev-control"
  docker exec -u root "$container" chown root:root /etc/sudoers.d/neo-dev-control
  docker exec -u root "$container" chmod 0440 /etc/sudoers.d/neo-dev-control
  public_key=$(cat /opt/data/credentials/snapflow-dev-client.pub)
  options=$(cat "$controller/authorized_keys.options")
  docker exec -u root "$container" sh -c 'install -d -o neo-controller -g neo-controller -m 0700 /home/neo-controller/.ssh; touch /home/neo-controller/.ssh/authorized_keys; chown neo-controller:neo-controller /home/neo-controller/.ssh/authorized_keys; chmod 0600 /home/neo-controller/.ssh/authorized_keys'
  docker exec -i -u root "$container" python3 - "$public_key" "$options" <<'PY'
import pathlib, sys
path = pathlib.Path('/home/neo-controller/.ssh/authorized_keys')
key, options = sys.argv[1:]
material = ' '.join(key.split()[:2])
lines = [line for line in path.read_text().splitlines() if material not in line]
lines.append(f'{options} {key}')
path.write_text('\n'.join(lines) + '\n')
PY
}

case "$action" in
  fixture-install)
    fixture_root=${2:?fixture root required}; fixture_backup=${3:?fixture backup required}
    test -f "$fixture_root/.neo-dev-deploy-fixture"
    install -d -m 0700 "$fixture_backup/tree"
    cp -a "$fixture_root/." "$fixture_backup/tree/"
    (cd "$fixture_backup/tree" && find . -type f -print0 | sort -z | xargs -0 sha256sum >"$fixture_backup/SHA256SUMS")
    install -d "$fixture_root/opt/data/build/snapflow-neo-dev-webhook" "$fixture_root/opt/data/bin"
    install -m 0644 "$repo_root/tools/neo_dev_webhook/deploy/compose.neo-dev-repair.yaml" "$fixture_root/opt/data/build/snapflow-neo-dev-webhook/compose.neo-dev-repair.yaml"
    install -m 0755 "$repo_root/tools/neo_dev_webhook/controller/neo-dev-remote-project-control" "$fixture_root/opt/data/bin/neo-dev-project-control"
    ;;
  fixture-rollback)
    fixture_root=${2:?fixture root required}; fixture_backup=${3:?fixture backup required}
    test -f "$fixture_root/.neo-dev-deploy-fixture"; test -f "$fixture_backup/SHA256SUMS"
    find "$fixture_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "$fixture_backup/tree/." "$fixture_root/"
    (cd "$fixture_root" && sha256sum -c "$fixture_backup/SHA256SUMS")
    ;;
  install)
    require_root; verify_source
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    install -d -m 0700 "$backup_root/$stamp"
    backup=$backup_root/$stamp
    install -d -m 0700 "$backup/container"
    backup_host_path "$live_root" source "$backup"
    backup_host_path "$stack_root/compose.yaml" compose.yaml "$backup"
    backup_host_path "$stack_root/compose.neo-dev-repair.yaml" compose.override "$backup"
    backup_host_path "$profile" snapflow.md "$backup"
    backup_host_path /opt/data/bin/neo-dev-project-control host.adapter "$backup"
    backup_host_path /opt/data/lib/neo_dev_webhook host.library "$backup"
    sha256sum /var/lib/neo-dev/neo-dev.sqlite >"$backup/database.sha256"
    if docker exec -u root "$container" id neo-controller >/dev/null 2>&1; then
      touch "$backup/controller-user.present"
    else
      touch "$backup/controller-user.absent"
    fi
    for path in /usr/local/lib/neo_dev_webhook /usr/local/lib/neo-dev-project-control /usr/local/bin/neo-dev-project-control /usr/local/bin/neo-dev-forced-command /usr/local/sbin/neo-dev-project-control-privileged /usr/local/sbin/neo-dev-codex-runtime-privileged /etc/neo-dev/project-control /etc/sudoers.d/neo-dev-control /home/neo-controller/.ssh/authorized_keys /var/lib/neo-dev/project-control; do
      install -d "$backup/container$(dirname "$path")"
      backup_container_path "$path" "$backup"
    done
    (cd "$backup" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
    install -d -o root -g root -m 0755 "$live_root/neo_dev_webhook" /opt/data/bin /opt/data/lib/neo_dev_webhook
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,automation,consumer,server,remote_adapter,project_control}.py "$live_root/neo_dev_webhook/"
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/controller/card-capability-policy.v1.json" "$live_root/card-capability-policy.json"
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,remote_adapter,project_control}.py /opt/data/lib/neo_dev_webhook/
    install -o root -g root -m 0755 "$repo_root/tools/neo_dev_webhook/controller/neo-dev-remote-project-control" /opt/data/bin/neo-dev-project-control
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/deploy/compose.neo-dev-repair.yaml" "$stack_root/compose.neo-dev-repair.yaml"
    install_profile_block
    install_container
    sha256sum -c "$backup/database.sha256"
    "$0" verify
    ;;
  activate)
    require_root; "$0" verify
    docker compose -p snapflow-neo-dev-webhook -f "$stack_root/compose.yaml" -f "$stack_root/compose.neo-dev-repair.yaml" up -d --no-deps receiver consumer
    ;;
  verify)
    verify_source
    test "$(stat -c '%U:%G:%a' /opt/data/bin/neo-dev-project-control)" = root:root:755
    docker exec -u root "$container" test "$(docker exec -u root "$container" stat -c '%U:%G:%a' /var/lib/neo-dev/project-control)" = neo-controller:neo-controller:700
    docker exec -u dev "$container" test ! -r /var/lib/neo-dev/project-control
    docker exec -u dev "$container" sudo -n /usr/local/sbin/neo-dev-project-control-privileged --help >/dev/null 2>&1 && exit 1 || true
    docker exec -u neo-controller "$container" sudo -n /usr/local/sbin/neo-dev-project-control-privileged --help >/dev/null
    docker exec -u root "$container" visudo -cf /etc/sudoers.d/neo-dev-control
    docker exec -u neo-controller "$container" python3 -c 'from neo_dev_webhook.forced_command import validated_original_command; validated_original_command("/usr/local/bin/neo-dev-project-control preflight --repository kingkill85/snap-flow --issue-number 13 --idempotency-key 12345678-1234-4abc-8def-123456789abc")'
    if docker exec -u neo-controller "$container" python3 -c 'from neo_dev_webhook.forced_command import validated_original_command; validated_original_command("git status")' >/dev/null 2>&1; then exit 1; fi
    sha256sum /var/lib/neo-dev/neo-dev.sqlite >/dev/null
    test "$(docker exec -u neo-controller "$container" git -C /workspace/snap-flow rev-parse --show-toplevel)" = /workspace/snap-flow
    origin=$(docker exec -u neo-controller "$container" git -C /workspace/snap-flow remote get-url origin)
    test "$origin" = git@github.com:kingkill85/snap-flow.git || test "$origin" = https://github.com/kingkill85/snap-flow.git
    while IFS=$'\t' read -r source destination owner group mode; do
      source_path=$repo_root/tools/neo_dev_webhook/controller/$source
      expected_hash=$(sha256sum "$source_path" | cut -d' ' -f1)
      observed_hash=$(docker exec -u root "$container" sha256sum "$destination" | cut -d' ' -f1)
      observed_metadata=$(docker exec -u root "$container" stat -c '%U:%G:%a' "$destination")
      test "$expected_hash" = "$observed_hash"
      test "$observed_metadata" = "$owner:$group:${mode#0}"
    done < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); [print(x["source"],x["destination"],x["owner"],x["group"],x["mode"],sep="\t") for x in d["files"]]' "$repo_root/tools/neo_dev_webhook/controller/install-manifest.v1.json")
    docker compose -p snapflow-neo-dev-webhook -f "$stack_root/compose.yaml" -f "$stack_root/compose.neo-dev-repair.yaml" config >/dev/null
    ;;
  rollback)
    require_root
    backup=${2:?backup directory required}
    test -f "$backup/SHA256SUMS" && (cd "$backup" && sha256sum -c SHA256SUMS)
    rm -rf "$live_root" /opt/data/lib/neo_dev_webhook
    rm -f "$stack_root/compose.neo-dev-repair.yaml" /opt/data/bin/neo-dev-project-control
    cp -a "$backup/source" "$live_root"
    cp -a "$backup/compose.yaml" "$stack_root/compose.yaml"
    cp -a "$backup/snapflow.md" "$profile"
    test -f "$backup/compose.override.present" && cp -a "$backup/compose.override" "$stack_root/compose.neo-dev-repair.yaml"
    test -f "$backup/host.adapter.present" && cp -a "$backup/host.adapter" /opt/data/bin/neo-dev-project-control
    test -f "$backup/host.library.present" && cp -a "$backup/host.library" /opt/data/lib/neo_dev_webhook
    while IFS= read -r path; do docker exec -u root "$container" rm -rf "$path"; done < <(cat "$backup/container.present" "$backup/container.absent")
    while IFS= read -r path; do docker cp "$backup/container$path" "$container:$path"; done <"$backup/container.present"
    while IFS=$'\t' read -r path uid gid mode; do
      docker exec -u root "$container" chown "$uid:$gid" "$path"
      docker exec -u root "$container" chmod "$mode" "$path"
    done <"$backup/container.metadata"
    test -f "$backup/controller-user.absent" && docker exec -u root "$container" userdel -r neo-controller >/dev/null 2>&1 || true
    ;;
  *) echo "usage: $0 <install|verify|activate|rollback BACKUP>" >&2; exit 2 ;;
esac
