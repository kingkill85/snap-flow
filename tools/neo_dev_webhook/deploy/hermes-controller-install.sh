#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
maintenance_identity=/opt/data/credentials/snapflow-dev-client
controller_public=/opt/data/credentials/snapflow-controller-client.pub
known_hosts=/opt/data/tailscale_known_hosts
remote=(/usr/bin/ssh -F /dev/null -T -p 2222 -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known_hosts" -o GlobalKnownHostsFile=/dev/null -o ProxyCommand=none -i "$maintenance_identity" dev@192.168.178.4)

test "$(id -un)" = hermes
test ! -L "$maintenance_identity" && test "$(stat -c '%U:%G:%a' "$maintenance_identity")" = hermes:hermes:600
test ! -L "$controller_public" && test -f "$controller_public"
PYTHONPATH="$repo_root/tools" python3 -c 'import pathlib; from neo_dev_webhook.deployment import validate_pinned_host; validate_pinned_host(pathlib.Path("/opt/data/tailscale_known_hosts"), "192.168.178.4", 2222)'

case "$action" in
  install)
    stage=$(mktemp -d); trap 'rm -rf -- "$stage"' EXIT
    install -d "$stage/snapflow-neo-controller/controller" "$stage/snapflow-neo-controller/neo_dev_webhook" "$stage/snapflow-neo-controller/deploy"
    cp -a "$repo_root/tools/neo_dev_webhook/controller/." "$stage/snapflow-neo-controller/controller/"
    cp -a "$repo_root/tools/neo_dev_webhook/"{__init__,project_control,project_worker,codex_runtime,runtime_supervisor,operator_commands,verification,forced_command,independent_review,independent_review_canary}.py "$stage/snapflow-neo-controller/neo_dev_webhook/"
    cp -a "$repo_root/tools/neo_dev_webhook/"{__init__,project_control,project_worker,codex_runtime,runtime_supervisor,operator_commands,verification,forced_command,independent_review,independent_review_canary}.py "$stage/snapflow-neo-controller/"
    cp -a "$repo_root/tools/neo_dev_webhook/deploy/controller-install.sh" "$stage/snapflow-neo-controller/deploy/"
    printf '%s %s\n' "$(cat "$repo_root/tools/neo_dev_webhook/controller/authorized_keys.options")" "$(cat "$controller_public")" >"$stage/snapflow-neo-controller/authorized_keys"
    tar -C "$stage" -cf - snapflow-neo-controller | "${remote[@]}" 'sudo rm -rf /tmp/snapflow-neo-controller && sudo tar -C /tmp -xf - && sudo NEO_CONTROLLER_BUNDLE=/tmp/snapflow-neo-controller /tmp/snapflow-neo-controller/deploy/controller-install.sh install'
    ;;
  verify) "${remote[@]}" 'sudo NEO_CONTROLLER_BUNDLE=/tmp/snapflow-neo-controller /tmp/snapflow-neo-controller/deploy/controller-install.sh verify' ;;
  rollback) backup=${2:?remote backup required}; [[ $backup =~ ^/var/lib/neo-dev/controller-backups/[0-9]{8}T[0-9]{6}Z$ ]]; "${remote[@]}" "sudo NEO_CONTROLLER_BUNDLE=/tmp/snapflow-neo-controller /tmp/snapflow-neo-controller/deploy/controller-install.sh rollback '$backup'" ;;
  *) echo "usage: $0 <install|verify|rollback REMOTE_BACKUP>" >&2; exit 2 ;;
esac
