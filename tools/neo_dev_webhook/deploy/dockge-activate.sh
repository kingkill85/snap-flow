#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
stack=/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook
compose=$stack/compose.yaml
backup_root=$stack/.neo-dev-backups

verify_scope() {
  test -f "$compose"; command -v docker >/dev/null; docker compose version >/dev/null
  python3 "$(dirname "$0")/verify_live_compose.py" "$compose"
  for service in receiver consumer; do id=$(docker compose -f "$compose" ps -q "$service"); test -n "$id"; docker inspect "$id" >/dev/null; done
  consumer_id=$(docker compose -f "$compose" ps -q consumer); docker exec "$consumer_id" test -s /var/lib/neo-dev/neo-dev.sqlite
}
case "$action" in
  verify) verify_scope ;;
  activate) verify_scope; stamp=$(date -u +%Y%m%dT%H%M%SZ); install -d "$backup_root/$stamp"; cp -a "$compose" "$backup_root/$stamp/compose.yaml"; docker compose -f "$compose" ps --format json >"$backup_root/$stamp/containers.json"; (cd "$backup_root/$stamp" && sha256sum compose.yaml containers.json >SHA256SUMS); docker compose -f "$compose" up -d --no-deps --force-recreate receiver consumer; printf '%s\n' "$backup_root/$stamp" ;;
  rollback) backup=${2:?backup required}; [[ $backup =~ ^/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/.neo-dev-backups/[0-9]{8}T[0-9]{6}Z$ ]]; (cd "$backup" && sha256sum -c SHA256SUMS); cp -a "$backup/compose.yaml" "$compose"; docker compose -f "$compose" up -d --no-deps --force-recreate receiver consumer ;;
  *) echo "usage: $0 <verify|activate|rollback BACKUP>" >&2; exit 2 ;;
esac
