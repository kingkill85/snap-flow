#!/usr/bin/env bash
set -euo pipefail
action=${1:-}
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
requested_data_root=${NEO_DEV_DATA_ROOT:-/opt/data}
[[ $requested_data_root == /* && $requested_data_root != / ]]
data_root=$(realpath -m -- "$requested_data_root")
[[ $data_root == /* && $data_root != / ]]
if [[ $data_root != /opt/data ]]; then
  [[ $data_root == */opt/data ]]
  fixture_root=${data_root%/opt/data}
  [[ -n $fixture_root && -f $fixture_root/.hermes-scope-fixture ]]
fi
live_src=$data_root/services/snapflow-neo-dev-webhook/src
profile=$data_root/profiles/dev/SOUL.md
task_helper=$data_root/scripts/neo-dev/task.py
phase_helper=$data_root/scripts/neo-dev/reconcile-phase.py
plugin=$data_root/profiles/dev/plugins/snapflow_neo_dev_transition
enforcement=$data_root/profiles/dev/.snapflow-neo-dev-tools.enforced
host_adapter=$data_root/bin/neo-dev-project-control
host_transition=$data_root/bin/snapflow-neo-dev-transition
host_lib=$data_root/lib/neo_dev_webhook
backup_root=$data_root/backups/snapflow-neo-dev-webhook
approved_files=(__init__.py automation.py server.py)
transaction_backup=
transaction_active=0

restore_transaction() {
  code=${1:-$?}
  trap - EXIT INT TERM HUP
  if [[ $transaction_active -eq 1 && -n $transaction_backup ]]; then
    restore_scope "$transaction_backup" || true
  fi
  exit "$code"
}

scope_paths() {
  printf '%s\t%s\n' \
    live-src "$live_src" \
    profile "$profile" \
    task-helper "$task_helper" \
    phase-helper "$phase_helper" \
    transition-plugin "$plugin" \
    enforcement-marker "$enforcement" \
    host-adapter "$host_adapter" \
    host-transition "$host_transition" \
    host-library "$host_lib"
}

validate_profile_markers() {
  [[ ! -e $profile ]] && return
  local counts
  counts=$(awk '
    $0 == "<!-- snapflow-neo-dev-orchestrator:start -->" { starts++; start_line=NR }
    $0 == "<!-- snapflow-neo-dev-orchestrator:end -->" { ends++; end_line=NR }
    END { print starts + 0, ends + 0, start_line + 0, end_line + 0 }
  ' "$profile")
  read -r starts ends start_line end_line <<<"$counts"
  if ! { [[ $starts -eq 0 && $ends -eq 0 ]] ||
         [[ $starts -eq 1 && $ends -eq 1 && $start_line -lt $end_line ]]; }; then
    echo "malformed managed-profile markers" >&2
    exit 1
  fi
}

snapshot_scope() {
  backup=$1
  install -d -m 0700 "$backup/state"
  while IFS=$'\t' read -r name path; do
    if [[ -e $path || -L $path ]]; then
      : >"$backup/state/$name.present"
      cp -a "$path" "$backup/state/$name.data"
    else
      : >"$backup/state/$name.absent"
    fi
  done < <(scope_paths)
}

restore_scope() {
  backup=$1
  while IFS=$'\t' read -r name path; do
    rm -rf -- "$path"
    if [[ -f $backup/state/$name.present ]]; then
      install -d "$(dirname "$path")"
      cp -a "$backup/state/$name.data" "$path"
    elif [[ ! -f $backup/state/$name.absent ]]; then
      echo "incomplete backup state for $name" >&2
      exit 1
    fi
  done < <(scope_paths)
}

install_scope() {
  if [[ $data_root == /opt/data && ${NEO_DEV_DEPLOY_AUTHORIZED:-} != MICHAEL_APPROVED ]]; then
    echo "Michael deployment authorization required" >&2; return 1
  fi
  validate_profile_markers
  stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
  backup=$backup_root/$stamp
  snapshot_scope "$backup"
  transaction_backup=$backup; transaction_active=1
  trap 'restore_transaction $?' EXIT
  trap 'restore_transaction 130' INT
  trap 'restore_transaction 143' TERM
  trap 'restore_transaction 129' HUP

  rm -rf -- "$live_src" "$plugin" "$enforcement" "$host_adapter" \
    "$host_transition" "$host_lib"
  if [[ $data_root != /opt/data ]]; then
    [[ ${NEO_DEV_INJECT_MUTATION_FAILURE:-} != 1 ]] || return 1
    [[ ${NEO_DEV_INJECT_MUTATION_SIGNAL:-} != 1 ]] || kill -TERM $$
  fi
  install -d -m 0755 "$live_src/neo_dev_webhook" "$(dirname "$profile")" \
    "$(dirname "$task_helper")"
  for file in "${approved_files[@]}"; do
    install -m 0644 "$repo_root/tools/neo_dev_webhook/$file" "$live_src/neo_dev_webhook/$file"
  done
  install -m 0755 "$repo_root/tools/neo_dev_webhook/deploy/task.py" "$task_helper"
  install -m 0755 "$repo_root/tools/neo_dev_webhook/deploy/reconcile_phase.py" "$phase_helper"

  touch "$profile"
  sed -i '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/d' "$profile"
  if [[ -s $profile ]]; then
    last_byte=$(tail -c 1 "$profile" | od -An -t u1)
    [[ $last_byte -eq 10 ]] || printf '\n' >>"$profile"
  fi
  sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' \
    "$repo_root/tools/neo_dev_webhook/deploy/profile.managed-block.md" >>"$profile"
  if [[ ${NEO_DEV_INJECT_LATE_DRIFT:-} == 1 && $data_root != /opt/data ]]; then
    install -d "$host_lib"; printf 'fixture drift\n' >"$host_lib/drift"
  fi
  if ! verify_scope; then
    echo "staging verification failed; exact backup restored" >&2
    return 1
  fi
  transaction_active=0; trap - EXIT INT TERM HUP
  printf '%s\n' "$backup"
}

verify_scope() {
  if [[ ${NEO_DEV_INJECT_VERIFY_FAILURE:-} == 1 && $data_root != /opt/data ]]; then
    return 1
  fi
  package=$live_src/neo_dev_webhook
  test -d "$package" || return 1
  test "$(find "$live_src" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 || return 1
  mapfile -t actual < <(find "$package" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort) || return 1
  mapfile -t expected < <(printf '%s\n' "${approved_files[@]}" | sort)
  [[ ${actual[*]} == "${expected[*]}" ]] || return 1
  test "$(find "$package" -mindepth 1 -maxdepth 1 | wc -l)" -eq "${#approved_files[@]}" || return 1
  for file in "${approved_files[@]}"; do
    cmp -s "$repo_root/tools/neo_dev_webhook/$file" "$package/$file" || return 1
  done
  cmp -s "$repo_root/tools/neo_dev_webhook/deploy/task.py" "$task_helper" || return 1
  test -x "$task_helper" || return 1
  cmp -s "$repo_root/tools/neo_dev_webhook/deploy/reconcile_phase.py" "$phase_helper" || return 1
  test -x "$phase_helper" || return 1
  expected_block=$(mktemp) || return 1
  trap 'rm -f "$expected_block"' RETURN
  sed -n '/<!-- snapflow-neo-dev-orchestrator:start -->/,/<!-- snapflow-neo-dev-orchestrator:end -->/p' \
    "$profile" >"$expected_block" || return 1
  cmp -s "$expected_block" "$repo_root/tools/neo_dev_webhook/deploy/profile.managed-block.md" || return 1
  for obsolete in "$plugin" "$enforcement" "$host_adapter" "$host_transition" "$host_lib"; do
    test ! -e "$obsolete" || return 1
    test ! -L "$obsolete" || return 1
  done
  return 0
}

rollback_scope() {
  backup=${2:?backup required}
  backup=$(realpath "$backup")
  canonical_backup_root=$(realpath -m "$backup_root")
  [[ $backup == "$canonical_backup_root"/* ]]
  test -d "$backup/state"
  restore_scope "$backup"
}

fixture_install() {
  fixture=${2:?fixture root}; backup=${3:?fixture backup}
  test -f "$fixture/.hermes-scope-fixture"
  install -d -m 0700 "$backup"
  cp -a "$fixture/." "$backup/tree/"
  NEO_DEV_DATA_ROOT="$fixture/opt/data" "$0" install >/dev/null
}

fixture_rollback() {
  fixture=${2:?fixture root}; backup=${3:?fixture backup}
  test -f "$fixture/.hermes-scope-fixture"
  find "$fixture" -mindepth 1 -maxdepth 1 ! -name .hermes-scope-fixture -exec rm -rf {} +
  cp -a "$backup/tree/." "$fixture/"
}

case "$action" in
  install) install_scope ;;
  verify) verify_scope ;;
  rollback) rollback_scope "$@" ;;
  fixture-install) fixture_install "$@" ;;
  fixture-rollback) fixture_rollback "$@" ;;
  *) echo "usage: $0 <install|verify|rollback BACKUP|fixture-install ROOT BACKUP|fixture-rollback ROOT BACKUP>" >&2; exit 2 ;;
esac
