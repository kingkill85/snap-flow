# SnapFlow webhook to Neo Dev Kanban inbox

This standalone automation lives under `tools/neo_dev_webhook`; it does not add a SnapFlow product route or product-service dependency.

The signed receiver accepts only canonical GitHub deliveries for `kingkill85/snap-flow` from the configured human actor. It verifies the raw-body SHA-256 HMAC before parsing, bounds bodies, individual and aggregate headers, comments, labels, concurrency, and request duration, and filters event/action/repository/actor/Issue eligibility. Pull-request comments, closed or unlabeled Issues, unsupported actions, and comments containing the exact standalone `<!-- neo-dev -->` marker are ignored. The receiver performs no long-running orchestration or authenticated GitHub operation.

Each eligible delivery is committed under its `X-GitHub-Delivery` UUID to a synchronous WAL SQLite transaction before HTTP success. The delivery owns exactly one queue row. Replay is idempotent by delivery identity. A later eligible human delivery—even for the same Issue—creates another wakeup. Claims are lease- and ownership-token-bound, retries are bounded, and exhausted rows dead-letter without duplicating a Kanban card.

Immediately before card creation, the consumer revalidates through GitHub's public API, without an Authorization header, that the Issue is open, is not a pull request, and still carries `neo-dev`. It then invokes the configured task runner without a shell:

```text
python3 "$NEO_DEV_TASK_RUNNER" "SnapFlow issue #<number>" \
  --body "<stable identifiers and routing>" \
  --max-runtime 2h \
  --workspace dir:/opt/data/profiles/dev \
  --board private-dev \
  --assignee dev \
  --idempotency-key <github-delivery-uuid>
```

The body contains only repository, Issue, event/action, delivery ID, optional comment ID, the persistent `dev` profile, `private-dev` board, `dir:/opt/data/profiles/dev` workspace, and routing to the `snapflow-orchestrator` skill plus `/opt/data/profiles/dev/projects/snapflow.md`. It contains no inferred phase, lifecycle action, transition capability, or controller decision. Durable task-runner confirmation and an unambiguous task ID are required before the queue row is complete.

Neo Dev uses its normal persistent profile tool surface to fetch live state, decide the governed next action, supervise the sole resumable Codex implementation worker and fresh reviewers, and record progress in Kanban. The deployment-managed profile source is `tools/neo_dev_webhook/deploy/profile.managed-block.md`.

Before every `kanban_complete`, Neo Dev runs the deployed `reconcile-phase.py` helper with explicit repository, Issue, and internal phase. The helper accepts only `kingkill85/snap-flow`, uses `/home/dev/bin/gh` by default, preserves non-phase labels, replaces stale phase labels, re-fetches the Issue, and emits compact JSON only when exact synchronization is proven. A nonzero or unverifiable result requires `kanban_block`. Review findings are bundled and adjudicated per round; two unsuccessful correction rounds end as `non_convergent`/`blocked` rather than continuing indefinitely.

Run the processes privately:

```bash
export PYTHONPATH=tools
export NEO_DEV_WEBHOOK_SECRET='configured-outside-the-repository'
export NEO_DEV_WEBHOOK_DB='/absolute/durable/path/neo-dev.sqlite'
export NEO_DEV_TASK_RUNNER='/opt/data/scripts/neo-dev/task.py'
python3 -m neo_dev_webhook.server --host 127.0.0.1 --port 8787
python3 -m neo_dev_webhook.consumer "$NEO_DEV_WEBHOOK_DB" --max-runtime 2h --max-attempts 5
```

Repository scripts only provide reversible staging and verification. A later separately authorized install replaces the staged package exactly, installs the fixed-routing Kanban helper at `/opt/data/scripts/neo-dev/task.py`, and removes the retired Hermes-scope transition plugin, enforcement marker, host adapter/transition binaries, and host library after backing up their exact present/absent state. Rollback restores those scoped paths exactly. The helper accepts only the `private-dev` board, `dev` assignee, and persistent dev workspace; it serializes creation with `/opt/data/.neo-dev-task-create.lock`, uses `/opt/hermes/.venv/bin/hermes` for both creation and bounded dispatch, reconciles uncertain results against the same board through `hermes_cli.kanban_db`, and emits exactly one durable JSON result. No executable path or routing value is runtime-overridable or derived from webhook data.

Before separately authorized host staging, run `python3 tools/neo_dev_webhook/deploy/verify_hermes_contract.py` from the checkout. This read-only check requires the pinned observed `Hermes Agent v0.20.0 (2026.8.3)` installation at `/opt/hermes`, verifies the required create/dispatch options, resolves the `private-dev` database through `hermes_cli.kanban_db`, and checks its schema and named-row behavior through a read-only SQLite connection. A host without that installation fails verification; the remote repository test environment does not fabricate a pass.

`controller-retire.sh` is root-only, reversible code/state cleanup machinery for the old development-host controller install; it is never an orchestrator and must not be executed as part of staging. It requires separate deployment and destructive persistent-state authorization, an explicit inactivity assertion, and an observable process scan proving that no old controller executable is running. Backups are SHA-256 sealed and verified before rollback. The `neo-controller` account and its `.ssh` state remain outside that script's scope. The scripts do not deploy, restart a service, change ingress, restrict the profile tool surface, or modify externally managed sshd configuration or credentials.

Access retirement is separate and intentionally undeployed. After observable controller inactivity, `controller-access-retire.sh` may run only with Michael's distinct access-change authorization; it reversibly snapshots the former account's `.ssh`, shell, and password-lock value, then removes that SSH directory, locks the account, and selects `nologin`. `controller-retire.sh` follows only under separate deployment and destructive persistent-state authorization. Neither procedure changes global sshd configuration, other users, or externally managed credentials, and neither is executed by this change.

When an existing database contains rows from the retired queue, initialization copies every legacy wakeup not already represented into `kanban_wakeups` as `blocked_legacy`, preserving its delivery, repository, Issue, event/action, and optional comment identity. The consumer never claims those rows. Inspection or disposition requires separate human authorization and must not automatically continue Issues #6, #13, or #84.
