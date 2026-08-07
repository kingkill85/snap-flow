#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
data_root=/opt/data
live_src=$data_root/services/snapflow-neo-dev-webhook/src
host_lib=$data_root/lib/neo_dev_webhook
host_bin=$data_root/bin
profile=$data_root/profiles/dev/projects/snapflow.md
plugin=$data_root/profiles/dev/plugins/snapflow_neo_dev_transition
enforced=$data_root/profiles/dev/.snapflow-neo-dev-tools.enforced
backup_root=$data_root/backups/snapflow-neo-dev-webhook
identity=$data_root/credentials/snapflow-controller-client
known_hosts=$data_root/tailscale_known_hosts

require_hermes() {
  test "$(id -un)" = hermes
  test ! -L "$identity" && test -f "$identity"
  test ! -L "$known_hosts" && test -f "$known_hosts"
  test "$(stat -c '%U:%G:%a' "$identity")" = hermes:hermes:600
  PYTHONPATH="$repo_root/tools" python3 -c 'import pathlib; from neo_dev_webhook.deployment import validate_pinned_host; validate_pinned_host(pathlib.Path("/opt/data/tailscale_known_hosts"), "192.168.178.4", 2222)'
  test -d "$live_src" && test -s "$profile"
}

install_scope() {
  require_hermes
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup=$backup_root/$stamp
  install -d -m 0700 "$backup/tree"
  for path in "$live_src" "$host_lib" "$host_bin/neo-dev-project-control" "$host_bin/snapflow-neo-dev-transition" "$profile" "$plugin" "$enforced"; do
    relative=${path#"$data_root/"}
    if test -e "$path"; then
      install -d "$backup/tree/$(dirname "$relative")"
      cp -a "$path" "$backup/tree/$relative"
      printf 'present\t%s\n' "$relative" >>"$backup/manifest.tsv"
    else
      printf 'absent\t%s\n' "$relative" >>"$backup/manifest.tsv"
    fi
  done
  (cd "$backup/tree" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum >"$backup/SHA256SUMS")
  hermes -p dev config get platform_toolsets.cli >"$backup/platform_toolsets.cli.before" || printf '[]\n' >"$backup/platform_toolsets.cli.before"
  hermes -p dev config get agent.disabled_toolsets >"$backup/agent.disabled_toolsets.before" || printf '[]\n' >"$backup/agent.disabled_toolsets.before"
  hermes -p dev config get plugins.enabled >"$backup/plugins.enabled.before" || printf '[]\n' >"$backup/plugins.enabled.before"
  (cd "$backup" && sha256sum platform_toolsets.cli.before agent.disabled_toolsets.before plugins.enabled.before >config.before.sha256)
  install -d -m 0755 "$live_src/neo_dev_webhook" "$host_lib" "$host_bin"
  install -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,automation,consumer,server,remote_adapter,project_control,deployment,hermes_transition,verification}.py "$live_src/neo_dev_webhook/"
  install -m 0644 "$repo_root/tools/neo_dev_webhook/"{__init__,remote_adapter,project_control,deployment}.py "$host_lib/"
  install -m 0755 "$repo_root/tools/neo_dev_webhook/controller/neo-dev-remote-project-control" "$host_bin/neo-dev-project-control"
  rm -f -- "$enforced" "$host_bin/snapflow-neo-dev-transition"
  install -d -m 0755 "$plugin"
  install -m 0644 "$repo_root/tools/neo_dev_webhook/deploy/hermes-plugin/snapflow_neo_dev_transition/"{plugin.yaml,__init__.py} "$plugin/"
  if ! grep -Fq '<!-- snapflow-neo-dev-orchestrator:start -->' "$profile"; then
    printf '\n' >>"$profile"
    sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' "$repo_root/tools/neo_dev_webhook/deploy/profile.managed-block.md" >>"$profile"
  fi
  printf '%s\n' "$backup"
}

verify_scope() {
  require_hermes
  test -f "$live_src/neo_dev_webhook/consumer.py"
  test -x "$host_bin/neo-dev-project-control"
  test -f "$plugin/plugin.yaml" && test -f "$plugin/__init__.py"
  grep -Fq '<!-- snapflow-neo-dev-orchestrator:start -->' "$profile"
  for file in __init__ automation consumer server remote_adapter project_control deployment hermes_transition verification; do
    test "$(sha256sum "$repo_root/tools/neo_dev_webhook/$file.py" | cut -d' ' -f1)" = "$(sha256sum "$live_src/neo_dev_webhook/$file.py" | cut -d' ' -f1)"
  done
  test "$(sha256sum "$repo_root/tools/neo_dev_webhook/controller/neo-dev-remote-project-control" | cut -d' ' -f1)" = "$(sha256sum "$host_bin/neo-dev-project-control" | cut -d' ' -f1)"
  installed_block=$(mktemp); expected_block=$(mktemp); trap 'rm -f -- "$installed_block" "$expected_block"' RETURN
  sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' "$profile" >"$installed_block"
  sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' "$repo_root/tools/neo_dev_webhook/deploy/profile.managed-block.md" >"$expected_block"
  cmp "$installed_block" "$expected_block"
  "$host_bin/neo-dev-project-control" --help >/dev/null
  rm -f -- "$enforced"
  runtime=$(python3 "$repo_root/tools/neo_dev_webhook/deploy/verify_hermes_runtime.py" \
    "$data_root/profiles/dev")
  printf 'verified_at=%s\ntoolsets=snapflow_neo_dev,web,browser,memory,session_search,skills\ntool=snapflow_neo_dev_transition\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$enforced.tmp"
  printf 'runtime=%s\n' "$runtime" >>"$enforced.tmp"
  chmod 0600 "$enforced.tmp" && mv -f "$enforced.tmp" "$enforced"
}

configure_tools() {
  require_hermes
  command -v hermes >/dev/null
  rm -f -- "$enforced"
  hermes -p dev plugins enable snapflow-neo-dev-transition
  hermes -p dev config set platform_toolsets.cli \
    '["snapflow_neo_dev","web","browser","memory","session_search","skills"]'
  hermes -p dev config set agent.disabled_toolsets \
    '["bfl","terminal","code_execution","file","delegation","cronjob"]'
  echo "restart the dev profile gateway, then run: $0 verify" >&2
}

rollback_scope() {
  require_hermes
  backup=${2:?backup directory required}
  [[ $backup =~ ^/opt/data/backups/snapflow-neo-dev-webhook/[0-9]{8}T[0-9]{6}Z$ ]]
  test -f "$backup/manifest.tsv" && test -f "$backup/SHA256SUMS"
  (cd "$backup/tree" && sha256sum -c "$backup/SHA256SUMS")
  while IFS=$'\t' read -r state relative; do
    [[ $relative != /* && $relative != *..* ]]
    target=$data_root/$relative
    if test "$state" = present; then
      rm -rf -- "$target"
      install -d "$(dirname "$target")"
      cp -a "$backup/tree/$relative" "$target"
    else
      rm -rf -- "$target"
    fi
  done <"$backup/manifest.tsv"
  if test -f "$backup/platform_toolsets.cli.before"; then
    (cd "$backup" && sha256sum -c config.before.sha256)
    hermes -p dev config set platform_toolsets.cli "$(cat "$backup/platform_toolsets.cli.before")"
    hermes -p dev config set agent.disabled_toolsets "$(cat "$backup/agent.disabled_toolsets.before")"
    hermes -p dev config set plugins.enabled "$(cat "$backup/plugins.enabled.before")"
  fi
}

case "$action" in
  fixture-install) fixture=${2:?fixture root}; backup=${3:?fixture backup}; test -f "$fixture/.hermes-scope-fixture"; install -d -m 0700 "$backup/tree"; cp -a "$fixture/." "$backup/tree/"; (cd "$backup/tree" && find . -type f -print0 | sort -z | xargs -0 sha256sum >"$backup/SHA256SUMS"); install -d "$fixture/services/snapflow-neo-dev-webhook/src" "$fixture/profiles/dev/plugins/snapflow_neo_dev_transition"; install -m 0644 "$repo_root/tools/neo_dev_webhook/automation.py" "$fixture/services/snapflow-neo-dev-webhook/src/automation.py"; install -m 0644 "$repo_root/tools/neo_dev_webhook/deploy/hermes-plugin/snapflow_neo_dev_transition/"{plugin.yaml,__init__.py} "$fixture/profiles/dev/plugins/snapflow_neo_dev_transition/" ;;
  fixture-rollback) fixture=${2:?fixture root}; backup=${3:?fixture backup}; test -f "$fixture/.hermes-scope-fixture"; find "$fixture" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; cp -a "$backup/tree/." "$fixture/"; (cd "$fixture" && sha256sum -c "$backup/SHA256SUMS") ;;
  install) install_scope ;;
  verify) verify_scope ;;
  rollback) rollback_scope "$@" ;;
  configure-tools) configure_tools ;;
  *) echo "usage: $0 <install|configure-tools|verify|rollback BACKUP>" >&2; exit 2 ;;
esac
