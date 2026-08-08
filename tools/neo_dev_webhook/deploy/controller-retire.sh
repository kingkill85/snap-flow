#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
fixture_marker=.controller-retire-fixture
transaction_root=
transaction_backup=
transaction_active=0
paths=(
  /usr/local/lib/neo_dev_webhook
  /usr/local/lib/neo-dev-project-control
  /usr/local/bin/neo-dev-project-control
  /usr/local/bin/neo-dev-forced-command
  /usr/local/sbin/neo-dev-project-control-privileged
  /usr/local/sbin/neo-dev-project-worker
  /usr/local/sbin/neo-dev-runtime-supervisor
  /etc/neo-dev/project-control
  /etc/sudoers.d/neo-dev-control
  /var/lib/neo-dev/project-control
)

guard_root() {
  root=$1
  [[ $root == /* && $root != / && $root != *'/../'* && $root != */.. ]]
}

target_path() {
  local root=$1 path=$2
  [[ $path == /* && $path != / && $path != *'/../'* && $path != */.. ]]
  if [[ $root == / ]]; then printf '%s\n' "$path"; else printf '%s%s\n' "$root" "$path"; fi
}

snapshot() {
  local root=$1 backup=$2 index=0 target
  test ! -e "$backup"
  install -d -m 0700 "$backup/state"
  for path in "${paths[@]}"; do
    target=$(target_path "$root" "$path")
    if [[ -e $target || -L $target ]]; then
      : >"$backup/state/$index.present"
      cp -a -- "$target" "$backup/state/$index.data"
    else
      : >"$backup/state/$index.absent"
    fi
    printf '%s\n' "$path" >"$backup/state/$index.path"
    ((index += 1))
  done
  tar -C "$backup" -cf "$backup/state.tar" state
  (cd "$backup" && sha256sum state.tar >SHA256SUMS)
  rm -rf -- "$backup/state"
}

retire() {
  local root=$1 target index=0
  for path in "${paths[@]}"; do
    target=$(target_path "$root" "$path")
    rm -rf -- "$target"
    ((index += 1))
    if [[ $index -eq 1 && -f $root/$fixture_marker ]]; then
      [[ ${CONTROLLER_RETIRE_INJECT_FAILURE:-} != 1 ]] || return 1
      [[ ${CONTROLLER_RETIRE_INJECT_SIGNAL:-} != 1 ]] || kill -TERM $$
    fi
  done
}

verify() {
  local root=$1 target
  for path in "${paths[@]}"; do
    target=$(target_path "$root" "$path")
    test ! -e "$target" || return 1
    test ! -L "$target" || return 1
  done
}

restore_transaction() {
  code=${1:-$?}; trap - EXIT INT TERM HUP
  if [[ $transaction_active -eq 1 ]]; then restore "$transaction_root" "$transaction_backup" || true; fi
  exit "$code"
}

restore() {
  local root=$1 backup=$2 index=0 target recorded state temporary
  test -f "$backup/state.tar"; test -f "$backup/SHA256SUMS"
  (cd "$backup" && sha256sum -c SHA256SUMS >/dev/null)
  temporary=$(mktemp -d)
  trap 'rm -rf -- "$temporary"' RETURN
  tar -C "$temporary" -xf "$backup/state.tar"
  state=$temporary/state
  for path in "${paths[@]}"; do
    recorded=$(<"$state/$index.path")
    [[ $recorded == "$path" ]]
    target=$(target_path "$root" "$path")
    rm -rf -- "$target"
    if [[ -f $state/$index.present ]]; then
      install -d "$(dirname "$target")"
      cp -a -- "$state/$index.data" "$target"
    elif [[ ! -f $state/$index.absent ]]; then
      echo "incomplete backup state for $path" >&2
      exit 1
    fi
    ((index += 1))
  done
}

controller_inactive() {
  local pattern code
  pattern='(^|/)(neo-dev-codex-runtime|neo-dev-project-control|neo-dev-remote-project-control|neo-dev-forced-command|neo-dev-project-control-privileged|neo-dev-project-worker|neo-dev-runtime-supervisor)([[:space:]]|$)|neo_dev_webhook\.(codex_runtime|independent_review|independent_review_canary|deterministic_gates|gate_exec|gate_scan|verification|operator_commands|forced_command|project_control|project_worker|runtime_supervisor|remote_adapter)([[:space:]]|$)|(^|/)(codex_runtime|independent_review|independent_review_canary|deterministic_gates|gate_exec|gate_scan|verification|operator_commands|forced_command|project_control|project_worker|runtime_supervisor|remote_adapter)\.py([[:space:]]|$)'
  if pgrep -f -- "$pattern" >/dev/null; then
    echo "old Neo Dev controller process is still active" >&2
    return 1
  else
    code=$?
    [[ $code -eq 1 ]] || { echo "unable to inspect controller processes" >&2; return 1; }
  fi
}

fixture_guard() {
  guard_root "$1"
  test -f "$1/$fixture_marker"
}

production_guard() {
  [[ ${EUID:-$(id -u)} -eq 0 ]]
  [[ ${CONTROLLER_RETIRE_AUTHORIZED:-} == MICHAEL_APPROVED ]]
  [[ ${CONTROLLER_CONFIRMED_INACTIVE:-} == YES ]]
  controller_inactive
}

case "$action" in
  retire)
    production_guard
    backup_root=/var/backups/snapflow-neo-dev-controller-retire
    install -d -m 0700 "$backup_root"
    backup=$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$$
    snapshot / "$backup"
    transaction_root=/; transaction_backup=$backup; transaction_active=1
    trap 'restore_transaction $?' EXIT; trap 'restore_transaction 130' INT; trap 'restore_transaction 143' TERM; trap 'restore_transaction 129' HUP
    controller_inactive
    retire /
    verify /
    transaction_active=0; trap - EXIT INT TERM HUP
    printf '%s\n' "$backup"
    ;;
  verify)
    production_guard
    for path in "${paths[@]}"; do test ! -e "$path" && test ! -L "$path"; done
    ;;
  rollback)
    production_guard
    backup=${2:?backup required}
    canonical=$(realpath "$backup")
    [[ $canonical == /var/backups/snapflow-neo-dev-controller-retire/* ]]
    restore / "$canonical"
    ;;
  fixture-retire)
    root=${2:?fixture root}; backup=${3:?backup required}
    [[ ${CONTROLLER_FIXTURE_CHECK_REAL_PROCESSES:-} != 1 ]] || controller_inactive
    fixture_guard "$root"; snapshot "$root" "$backup"
    transaction_root=$root; transaction_backup=$backup; transaction_active=1
    trap 'restore_transaction $?' EXIT; trap 'restore_transaction 130' INT; trap 'restore_transaction 143' TERM; trap 'restore_transaction 129' HUP
    retire "$root"; verify "$root"
    transaction_active=0; trap - EXIT INT TERM HUP
    ;;
  fixture-verify)
    root=${2:?fixture root}; fixture_guard "$root"; verify "$root"
    ;;
  fixture-rollback)
    root=${2:?fixture root}; backup=${3:?backup required}
    fixture_guard "$root"; restore "$root" "$backup"
    ;;
  fixture-check-inactive)
    [[ ${CONTROLLER_FIXTURE_CHECK_REAL_PROCESSES:-} != 1 ]] || controller_inactive
    ;;
  check-inactive)
    controller_inactive
    ;;
  *)
    echo "usage: $0 <retire|verify|rollback BACKUP|fixture-retire ROOT BACKUP|fixture-verify ROOT|fixture-rollback ROOT BACKUP|fixture-check-inactive|check-inactive>" >&2
    exit 2
    ;;
esac
