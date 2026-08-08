#!/usr/bin/env bash
set -euo pipefail

action=${1:-verify}
bundle=${NEO_CONTROLLER_BUNDLE:-/tmp/snapflow-neo-controller}
backup_root=/var/lib/neo-dev/controller-backups

require_maintenance() { test "$(id -u)" -eq 0; test -d "$bundle/controller"; }

install_scope() {
  require_maintenance
  stamp=$(date -u +%Y%m%dT%H%M%SZ); backup=$backup_root/$stamp
  install -d -m 0700 "$backup/root"
  paths=(/usr/local/lib/neo_dev_webhook /usr/local/lib/neo-dev-project-control /usr/local/bin/neo-dev-project-control /usr/local/bin/neo-dev-forced-command /usr/local/sbin/neo-dev-project-control-privileged /usr/local/sbin/neo-dev-project-worker /usr/local/sbin/neo-dev-runtime-supervisor /etc/neo-dev/project-control /etc/sudoers.d/neo-dev-control /home/neo-controller/.ssh /var/lib/neo-dev/project-control)
  for path in "${paths[@]}"; do
    relative=${path#/}
    if test -e "$path"; then install -d "$backup/root/$(dirname "$relative")"; cp -a "$path" "$backup/root/$relative"; printf 'present\t%s\n' "$relative" >>"$backup/manifest.tsv"; else printf 'absent\t%s\n' "$relative" >>"$backup/manifest.tsv"; fi
  done
  (cd "$backup/root" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum >"$backup/SHA256SUMS")
  id neo-controller >/dev/null 2>&1 && touch "$backup/user.present" || touch "$backup/user.absent"
  id neo-controller >/dev/null 2>&1 || useradd --system --create-home --shell /bin/sh neo-controller
  sshd_effective=$(/usr/sbin/sshd -T -C user=neo-controller,host=localhost,addr=127.0.0.1)
  grep -Fxq 'passwordauthentication no' <<<"$sshd_effective"
  grep -Fxq 'kbdinteractiveauthentication no' <<<"$sshd_effective"
  grep -Fxq 'authenticationmethods publickey' <<<"$sshd_effective"
  allow_users=$(grep '^allowusers ' <<<"$sshd_effective")
  grep -qw dev <<<"$allow_users"; grep -qw neo-controller <<<"$allow_users"
  passwd -d neo-controller
  install -d -o root -g root -m 0755 /usr/local/lib/neo_dev_webhook /usr/local/lib/neo-dev-project-control /etc/neo-dev/project-control
  install -d -o neo-controller -g neo-controller -m 0700 /var/lib/neo-dev/project-control
  install -o root -g root -m 0644 "$bundle/neo_dev_webhook/"{__init__,project_control,project_worker,codex_runtime,runtime_supervisor,operator_commands,verification,forced_command,independent_review,independent_review_canary,deterministic_gates,gate_exec,gate_scan}.py /usr/local/lib/neo_dev_webhook/
  install -o root -g root -m 0644 "$bundle/controller/registry.v1.json" /etc/neo-dev/project-control/registry.json
  install -o root -g root -m 0644 "$bundle/controller/card-capability-policy.v1.json" /etc/neo-dev/project-control/card-capability-policy.json
  install -o root -g root -m 0644 "$bundle/controller/state-schema.v1.json" /etc/neo-dev/project-control/state-schema.json
  for pair in neo-dev-project-control:/usr/local/bin/neo-dev-project-control neo-dev-codex-runtime:/usr/local/lib/neo-dev-project-control/neo-dev-codex-runtime neo-dev-forced-command:/usr/local/bin/neo-dev-forced-command neo-dev-project-control-privileged:/usr/local/sbin/neo-dev-project-control-privileged neo-dev-runtime-supervisor:/usr/local/sbin/neo-dev-runtime-supervisor; do install -o root -g root -m 0755 "$bundle/controller/${pair%%:*}" "${pair#*:}"; done
  install -o root -g root -m 0700 "$bundle/controller/neo-dev-project-worker" /usr/local/sbin/neo-dev-project-worker
  install -o root -g root -m 0440 "$bundle/controller/neo-dev-control.sudoers" /etc/sudoers.d/neo-dev-control
  install -d -o neo-controller -g neo-controller -m 0700 /home/neo-controller/.ssh
  install -o neo-controller -g neo-controller -m 0600 "$bundle/authorized_keys" /home/neo-controller/.ssh/authorized_keys
  "$0" verify
  printf '%s\n' "$backup"
}

verify_scope() {
  command -v git >/dev/null; command -v tmux >/dev/null; command -v codex >/dev/null; command -v python3 >/dev/null; command -v sudo >/dev/null; test -x /usr/sbin/sshd; command -v setpriv >/dev/null
  test "$(stat -c '%U:%G:%a' /var/lib/neo-dev/project-control)" = neo-controller:neo-controller:700
  sudo -u dev test ! -r /var/lib/neo-dev/project-control
  test -z "$(getent shadow neo-controller | cut -d: -f2)"
  test "$(getent passwd neo-controller | cut -d: -f7)" != /usr/sbin/nologin
  test "$(stat -c '%U:%G:%a' /usr/local/sbin/neo-dev-project-worker)" = root:root:700
  if sudo -u dev sudo -n /usr/local/sbin/neo-dev-project-control-privileged --help >/dev/null 2>&1; then exit 1; fi
  sudo -u neo-controller sudo -n /usr/local/sbin/neo-dev-project-control-privileged --help >/dev/null
  /usr/sbin/visudo -cf /etc/sudoers.d/neo-dev-control
  test "$(sudo -u dev git -C /workspace/snap-flow rev-parse --show-toplevel)" = /workspace/snap-flow
  origin=$(sudo -u dev git -C /workspace/snap-flow remote get-url origin); test "$origin" = git@github.com:kingkill85/snap-flow.git || test "$origin" = https://github.com/kingkill85/snap-flow.git
  sudo -u dev tmux has-session -t snapflow-dev
  while IFS=$'\t' read -r source destination owner group mode; do
    source_path=$bundle/controller/$source
    test "$(sha256sum "$source_path" | cut -d' ' -f1)" = "$(sha256sum "$destination" | cut -d' ' -f1)"
    test "$(stat -c '%U:%G:%a' "$destination")" = "$owner:$group:${mode#0}"
  done < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); [print(x["source"],x["destination"],x["owner"],x["group"],x["mode"],sep="\t") for x in d["files"]]' "$bundle/controller/install-manifest.v1.json")
  PYTHONPATH=/usr/local/lib python3 -m neo_dev_webhook.independent_review_canary
}

rollback_scope() {
  require_maintenance; backup=${2:?backup directory required}; [[ $backup =~ ^/var/lib/neo-dev/controller-backups/[0-9]{8}T[0-9]{6}Z$ ]]; test -f "$backup/manifest.tsv"; (cd "$backup/root" && sha256sum -c "$backup/SHA256SUMS")
  while IFS=$'\t' read -r state relative; do [[ $relative != /* && $relative != *..* ]]; target=/$relative; rm -rf -- "$target"; if test "$state" = present; then install -d "$(dirname "$target")"; cp -a "$backup/root/$relative" "$target"; fi; done <"$backup/manifest.tsv"
  test -f "$backup/user.absent" && userdel -r neo-controller >/dev/null 2>&1 || true
}

case "$action" in
  fixture-install) fixture=${2:?fixture root}; backup=${3:?fixture backup}; test -f "$fixture/.controller-scope-fixture"; install -d -m 0700 "$backup/tree"; cp -a "$fixture/." "$backup/tree/"; install -d "$fixture/usr/local/bin"; install -m 0755 "$bundle/controller/neo-dev-project-control" "$fixture/usr/local/bin/neo-dev-project-control" ;;
  fixture-rollback) fixture=${2:?fixture root}; backup=${3:?fixture backup}; test -f "$fixture/.controller-scope-fixture"; find "$fixture" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; cp -a "$backup/tree/." "$fixture/" ;;
  fixture-verify-canary) runtime=${2:?runtime root}; PYTHONPATH="$runtime" python3 -m neo_dev_webhook.independent_review_canary ;;
  install) install_scope ;; verify) verify_scope ;; rollback) rollback_scope "$@" ;; *) echo "usage: $0 <install|verify|rollback BACKUP>" >&2; exit 2 ;;
esac
