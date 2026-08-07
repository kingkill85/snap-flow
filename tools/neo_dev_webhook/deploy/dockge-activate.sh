#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
stack=/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook
backup_root=$stack/.neo-dev-backups

verify_definition() {
  local scope=${1:-$stack} compose services
  compose="$scope/compose.yaml"
  test -f "$compose"; command -v docker >/dev/null; docker compose version >/dev/null
  docker compose -f "$compose" config >/dev/null
  services=$(docker compose -f "$compose" config --services)
  test "$(grep -cx receiver <<<"$services")" = 1
  test "$(grep -cx consumer <<<"$services")" = 1
}

verify_scope() {
  local scope=${1:-$stack} compose receiver_id consumer_id mounts id
  compose="$scope/compose.yaml"
  verify_definition "$scope"
  receiver_id=$(docker compose -f "$compose" ps -q receiver); test -n "$receiver_id"
  consumer_id=$(docker compose -f "$compose" ps -q consumer); test -n "$consumer_id"
  test "$(docker inspect --format '{{json .Config.Cmd}}' "$receiver_id")" = \
    '["exec python3 -m neo_dev_webhook.server --host 0.0.0.0 --port 8787"]'
  test "$(docker inspect --format '{{json .Config.Cmd}}' "$consumer_id")" = \
    '["exec python3 -m neo_dev_webhook.consumer /var/lib/neo-dev/neo-dev.sqlite --max-runtime 2h --max-attempts 5"]'
  for id in "$receiver_id" "$consumer_id"; do
    mounts=$(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$id")
    grep -Fxq /srv/webhook <<<"$mounts"
    grep -Fxq /var/lib/neo-dev <<<"$mounts"
    grep -Fxq /etc/passwd <<<"$mounts"
    grep -Fxq /etc/group <<<"$mounts"
    test "$(docker exec "$id" getent passwd 1000)" = 'neo-runtime:x:1000:1000:Neo Dev runtime:/tmp:/usr/sbin/nologin'
    test "$(docker exec "$id" getent group 1000)" = 'neo-runtime:x:1000:'
  done
  mounts=$(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$consumer_id")
  grep -Fxq /opt/data <<<"$mounts"
  docker exec "$consumer_id" test -s /var/lib/neo-dev/neo-dev.sqlite
}
case "$action" in
  verify) verify_scope ;;
  activate) compose=$stack/compose.yaml; verify_definition; stamp=$(date -u +%Y%m%dT%H%M%SZ); install -d "$backup_root/$stamp"; cp -a "$compose" "$backup_root/$stamp/compose.yaml"; docker compose -f "$compose" ps --format json >"$backup_root/$stamp/containers.json"; (cd "$backup_root/$stamp" && sha256sum compose.yaml containers.json >SHA256SUMS); docker compose -f "$compose" up -d --no-deps --force-recreate receiver consumer; verify_scope; printf '%s\n' "$backup_root/$stamp" ;;
  rollback) compose=$stack/compose.yaml; backup=${2:?backup required}; [[ $backup =~ ^/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/.neo-dev-backups/[0-9]{8}T[0-9]{6}Z$ ]]; (cd "$backup" && sha256sum -c SHA256SUMS); cp -a "$backup/compose.yaml" "$compose"; docker compose -f "$compose" up -d --no-deps --force-recreate receiver consumer; verify_scope ;;
  fixture-verify) fixture=${2:?fixture stack}; test -f "$fixture/.dockge-scope-fixture"; verify_scope "$fixture" ;;
  fixture-activate) fixture=${2:?fixture stack}; test -f "$fixture/.dockge-scope-fixture"; verify_scope "$fixture"; docker compose -f "$fixture/compose.yaml" up -d --no-deps --force-recreate receiver consumer; verify_scope "$fixture" ;;
  *) echo "usage: $0 <verify|activate|rollback BACKUP>" >&2; exit 2 ;;
esac
