#!/usr/bin/env bash
set -euo pipefail
action=${1:-}; user=neo-controller; expected_home=/home/neo-controller; nologin=/usr/sbin/nologin
script_dir=$(cd "$(dirname "$0")" && pwd)
transaction_mode=
transaction_root=
transaction_backup=
transaction_active=0

restore_transaction() {
  code=${1:-$?}
  trap - EXIT INT TERM HUP
  if [[ $transaction_active -eq 1 ]]; then
    if [[ $transaction_mode == production ]]; then
      restore_production "$transaction_backup" || true
    elif [[ $transaction_mode == fixture ]]; then
      restore_fixture "$transaction_root" "$transaction_backup" || true
      printf '%s\n' rollback-after-failure >>"$transaction_backup/account-operations"
    fi
  fi
  exit "$code"
}

arm_transaction() {
  transaction_mode=$1; transaction_root=$2; transaction_backup=$3; transaction_active=1
  trap 'restore_transaction $?' EXIT
  trap 'restore_transaction 130' INT
  trap 'restore_transaction 143' TERM
  trap 'restore_transaction 129' HUP
}

disarm_transaction() {
  transaction_active=0
  trap - EXIT INT TERM HUP
}

fixture_signal() {
  point=$1
  [[ ${CONTROLLER_ACCESS_INJECT_SIGNAL_POINT:-} == "$point" ]] || return 0
  case ${CONTROLLER_ACCESS_INJECT_SIGNAL:-} in
    TERM) kill -TERM $$ ;;
    HUP) kill -HUP $$ ;;
    *) return 1 ;;
  esac
}

seal_state() {
  backup=$1
  tar -C "$backup" -cf "$backup/state.tar" state || return 1
  (cd "$backup" && sha256sum state.tar >SHA256SUMS) || return 1
  rm -rf -- "$backup/state"
}

extract_state() {
  backup=$1 output=$2
  test -f "$backup/state.tar" || return 1; test -f "$backup/SHA256SUMS" || return 1
  (cd "$backup" && sha256sum -c SHA256SUMS >/dev/null) || return 1
  tar -C "$output" -xf "$backup/state.tar" || return 1
}

snapshot_fixture() {
  root=$1 backup=$2
  test -f "$root/.controller-access-fixture" || return 1
  [[ $(<"$root/home") == "$expected_home" ]] || return 1
  test ! -e "$backup" || return 1; install -d -m 0700 "$backup/state" || return 1
  for item in ssh shell hash home; do
    path=$root/$item; [[ $item == ssh ]] && path=$root/home-dir/$user/.ssh
    if [[ -e $path || -L $path ]]; then : >"$backup/state/$item.present"; cp -a "$path" "$backup/state/$item.data";
    else : >"$backup/state/$item.absent"; fi
  done
  seal_state "$backup"
}

restore_fixture() {
  root=$1 backup=$2 temporary=$(mktemp -d); trap 'rm -rf -- "$temporary"' RETURN
  extract_state "$backup" "$temporary" || return 1
  for item in ssh shell hash home; do
    path=$root/$item; [[ $item == ssh ]] && path=$root/home-dir/$user/.ssh
    rm -rf -- "$path"
    [[ -f $temporary/state/$item.present ]] && { install -d "$(dirname "$path")"; cp -a "$temporary/state/$item.data" "$path"; }
  done
}

production_guard() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] || return 1
  [[ ${CONTROLLER_ACCESS_RETIRE_AUTHORIZED:-} == MICHAEL_APPROVED ]] || return 1
  [[ $(getent passwd "$user" | cut -d: -f6) == "$expected_home" ]] || return 1
  getent shadow "$user" >/dev/null || return 1
  "$script_dir/controller-retire.sh" check-inactive || return 1
}

snapshot_production() {
  backup=$1; install -d -m 0700 "$backup/state" || return 1
  printf '%s\n' "$expected_home" >"$backup/state/home.data"
  getent passwd "$user" | cut -d: -f7 >"$backup/state/shell.data"
  getent shadow "$user" | cut -d: -f2 >"$backup/state/hash.data"
  : >"$backup/state/home.present"; : >"$backup/state/shell.present"; : >"$backup/state/hash.present"
  if [[ -e $expected_home/.ssh || -L $expected_home/.ssh ]]; then : >"$backup/state/ssh.present"; cp -a "$expected_home/.ssh" "$backup/state/ssh.data"; else : >"$backup/state/ssh.absent"; fi
  chmod -R go-rwx "$backup"; seal_state "$backup"
}

restore_production() {
  backup=$1 temporary=$(mktemp -d); trap 'rm -rf -- "$temporary"' RETURN
  extract_state "$backup" "$temporary" || return 1
  shell=$(<"$temporary/state/shell.data"); hash=$(<"$temporary/state/hash.data")
  rm -rf -- "$expected_home/.ssh"
  [[ -f $temporary/state/ssh.present ]] && { install -d "$expected_home"; cp -a "$temporary/state/ssh.data" "$expected_home/.ssh"; }
  usermod -s "$shell" -p "$hash" "$user"
}

verify_retired() {
  test ! -e "$expected_home/.ssh" || return 1; test ! -L "$expected_home/.ssh" || return 1
  [[ $(getent passwd "$user" | cut -d: -f7) == "$nologin" ]] || return 1
  [[ $(getent shadow "$user" | cut -d: -f2) == '!'* ]] || return 1
}

case "$action" in
  retire)
    production_guard; backup=/var/backups/snapflow-neo-dev-controller-access/$(date -u +%Y%m%dT%H%M%SZ)-$$
    snapshot_production "$backup"
    arm_transaction production / "$backup"
    rm -rf -- "$expected_home/.ssh"
    usermod -L -s "$nologin" "$user"
    verify_retired
    disarm_transaction
    printf '%s\n' "$backup" ;;
  verify) production_guard; verify_retired ;;
  rollback) production_guard; backup=$(realpath "${2:?backup}"); [[ $backup == /var/backups/snapflow-neo-dev-controller-access/* ]]; restore_production "$backup" ;;
  fixture-retire)
    root=${2:?root}; backup=${3:?backup}
    "$script_dir/controller-retire.sh" fixture-check-inactive || exit 1
    snapshot_fixture "$root" "$backup" || exit 1
    arm_transaction fixture "$root" "$backup"
    printf '%s\n' "retire:ssh-remove" "retire:usermod-lock-nologin" >"$backup/account-operations"
    rm -rf -- "$root/home-dir/$user/.ssh"
    fixture_signal ssh-remove
    printf '%s\n' "$nologin" >"$root/shell"
    old=$(<"$root/hash"); printf '!%s\n' "${old#!}" >"$root/hash"
    fixture_signal account-mutation
    [[ ${CONTROLLER_ACCESS_INJECT_FAILURE:-} != 1 ]]
    verify_fixture_retired() {
      test ! -e "$root/home-dir/$user/.ssh" || return 1
      [[ $(<"$root/shell") == "$nologin" ]] || return 1
      [[ $(<"$root/hash") == '!'* ]] || return 1
    }
    verify_fixture_retired
    disarm_transaction
    ;;
  fixture-rollback) root=${2:?root}; backup=${3:?backup}; restore_fixture "$root" "$backup" ;;
  *) echo "usage: $0 <retire|verify|rollback BACKUP|fixture-retire ROOT BACKUP|fixture-rollback ROOT BACKUP>" >&2; exit 2 ;;
esac
