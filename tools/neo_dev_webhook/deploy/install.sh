#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
live_root=/opt/data/services/snapflow-neo-dev-webhook
stack_root=/opt/data/stacks/snapflow-neo-dev-webhook
backup_root=/var/lib/neo-dev/backups
profile=/opt/data/profiles/dev/projects/snapflow.md
container=snapflow-dev

require_root() { test "$(id -u)" -eq 0 || { echo "root required" >&2; exit 1; }; }
verify_source() {
  test -f "$stack_root/compose.yaml"
  test -d "$live_root"
  test -f /opt/data/credentials/snapflow-dev-client
  test -f /opt/data/credentials/snapflow-dev-client.pub
  test -f /opt/data/tailscale_known_hosts
  test -s "$profile"
  docker inspect "$container" >/dev/null
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
  docker exec -u root "$container" install -d -o root -g root -m 0700 /var/lib/neo-dev/project-control
  for file in __init__.py project_control.py codex_runtime.py verification.py forced_command.py; do
    docker cp "$repo_root/tools/neo_dev_webhook/$file" "$container:/usr/local/lib/neo_dev_webhook/$file"
    docker exec -u root "$container" chown root:root "/usr/local/lib/neo_dev_webhook/$file"
    docker exec -u root "$container" chmod 0644 "/usr/local/lib/neo_dev_webhook/$file"
  done
  docker cp "$controller/registry.v1.json" "$container:/etc/neo-dev/project-control/registry.json"
  docker exec -u root "$container" chown root:root /etc/neo-dev/project-control/registry.json
  docker exec -u root "$container" chmod 0644 /etc/neo-dev/project-control/registry.json
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
  docker exec -u root "$container" sh -c 'install -d -o dev -g dev -m 0700 /home/dev/.ssh; touch /home/dev/.ssh/authorized_keys; chown dev:dev /home/dev/.ssh/authorized_keys; chmod 0600 /home/dev/.ssh/authorized_keys'
  docker exec -i -u root "$container" python3 - "$public_key" "$options" <<'PY'
import pathlib, sys
path = pathlib.Path('/home/dev/.ssh/authorized_keys')
key, options = sys.argv[1:]
material = ' '.join(key.split()[:2])
lines = [line for line in path.read_text().splitlines() if material not in line]
lines.append(f'{options} {key}')
path.write_text('\n'.join(lines) + '\n')
PY
}

case "$action" in
  install)
    require_root; verify_source
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    install -d -m 0700 "$backup_root/$stamp"
    cp -a "$live_root" "$backup_root/$stamp/source"
    cp -a "$stack_root/compose.yaml" "$backup_root/$stamp/compose.yaml"
    cp -a "$profile" "$backup_root/$stamp/snapflow.md"
    install -d -o root -g root -m 0755 "$live_root/neo_dev_webhook" /opt/data/bin /opt/data/lib/neo_dev_webhook
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,automation,consumer,server,remote_adapter,project_control}.py "$live_root/neo_dev_webhook/"
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,remote_adapter,project_control}.py /opt/data/lib/neo_dev_webhook/
    install -o root -g root -m 0755 "$repo_root/tools/neo_dev_webhook/controller/neo-dev-remote-project-control" /opt/data/bin/neo-dev-project-control
    install -o root -g root -m 0644 "$repo_root/tools/neo_dev_webhook/deploy/compose.neo-dev-repair.yaml" "$stack_root/compose.neo-dev-repair.yaml"
    install_profile_block
    install_container
    "$0" verify
    ;;
  activate)
    require_root; "$0" verify
    docker compose -p snapflow-neo-dev-webhook -f "$stack_root/compose.yaml" -f "$stack_root/compose.neo-dev-repair.yaml" up -d --no-deps receiver consumer
    ;;
  verify)
    verify_source
    test "$(stat -c '%U:%G:%a' /opt/data/bin/neo-dev-project-control)" = root:root:755
    docker exec -u root "$container" test "$(docker exec -u root "$container" stat -c '%U:%G:%a' /var/lib/neo-dev/project-control)" = root:root:700
    docker exec -u dev "$container" test ! -r /var/lib/neo-dev/project-control/resolutions.json
    docker exec -u root "$container" visudo -cf /etc/sudoers.d/neo-dev-control
    docker compose -p snapflow-neo-dev-webhook -f "$stack_root/compose.yaml" -f "$stack_root/compose.neo-dev-repair.yaml" config >/dev/null
    ;;
  rollback)
    require_root
    backup=${2:?backup directory required}
    test -d "$backup/source" && test -f "$backup/compose.yaml" && test -f "$backup/snapflow.md"
    cp -a "$backup/source/." "$live_root/"
    cp -a "$backup/compose.yaml" "$stack_root/compose.yaml"
    cp -a "$backup/snapflow.md" "$profile"
    echo "container controller files require restoration from the preceding approved image snapshot" >&2
    ;;
  *) echo "usage: $0 <install|verify|activate|rollback BACKUP>" >&2; exit 2 ;;
esac
