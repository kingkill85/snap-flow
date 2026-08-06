# GitHub Webhook Handoff (Dormant)

This integration authenticates eligible GitHub issue activity and writes a durable queue record for a separate `dev`-profile worker. It is production-oriented code, but it is deliberately **not activated**: SnapFlow's main server does not import or mount it, no package task starts it, and this repository adds no container, ingress, Hermes, or Traefik configuration.

## Accepted GitHub deliveries

The receiver verifies `X-Hub-Signature-256` over the exact raw bytes before parsing JSON. It then requires:

- `repository.full_name` exactly equals `SNAPFLOW_GITHUB_REPOSITORY` (case-sensitive).
- `X-GitHub-Delivery` is present.
- `issues` event with action `opened`, `reopened`, `edited`, or `labeled`; or `issue_comment` with action `created`.
- An open issue with an exact `neo-dev` label.
- For comments, a numeric comment ID and string body that does not contain `<!-- snapflow:neo-webhook -->`.

Comments produced by an eventual integration MUST include that hidden marker. Such loopback comments are acknowledged as ignored. Unsupported activity is also acknowledged as ignored; authentication, repository, parsing, configuration, and persistence failures fail closed and never enqueue work.

## Configuration

Provide values at runtime through a secret manager or process environment; never commit them:

| Variable | Required | Meaning |
| --- | --- | --- |
| `SNAPFLOW_GITHUB_WEBHOOK_SECRET` | yes | GitHub webhook secret shared only with the receiver |
| `SNAPFLOW_GITHUB_REPOSITORY` | yes | Exact `owner/repository` full name |
| `SNAPFLOW_GITHUB_WEBHOOK_DB` | yes | Absolute or service-owned path to a persistent SQLite file |
| `SNAPFLOW_GITHUB_WEBHOOK_PORT` | no | Loopback listener port, default `8787` |

OpenSpec telemetry is disabled globally during initialization and the repo-safe example sets `OPENSPEC_TELEMETRY=0`. Operators should preserve that environment setting in CI and local shells.

## Local-only run

From `backend/`, after exporting the required variables:

```bash
deno run --allow-env --allow-net=127.0.0.1:8787 --allow-read=/absolute/service-data --allow-write=/absolute/service-data src/integrations/github-webhook/server.ts
```

The runner always binds `127.0.0.1` and serves only `POST /github-webhook`. Adjust the network permission if the configured loopback port differs. SQLite may create `-wal` and `-shm` files beside the database, so the containing directory needs read/write access.

Do not point a GitHub webhook at this listener and do not expose it through public ingress. Activation requires a separate, explicitly approved design for private transport, secret provisioning, process supervision, rate limiting, monitoring, and queue consumption.

## Durable queue contract

On first acceptance, one transaction inserts the unique delivery ID and one queue row. A replay—including after process restart—returns `duplicate` without a second row. A success response is sent only after the transaction commits.

`github_webhook_queue` records contain `delivery_id`, `event`, `action`, `repository`, `issue_number`, optional `comment_id`, fixed `profile = 'dev'`, `payload_version = 1`, `status`, and `created_at`. They intentionally contain neither the webhook secret nor the full GitHub body.

A future worker must use a durable claim transaction to change `queued` to `processing`, run agent work outside the webhook request, and finally set `completed` or `failed`. It must target only the recorded `dev` profile. Worker implementation and activation are outside issue 77.

## Integration checklist (future approval required)

1. Provision the secret and durable database path outside the repository.
2. Run the receiver as an unprivileged account with the minimum Deno permissions shown above.
3. Provide an approved private delivery mechanism; do not add public ingress by default.
4. Configure GitHub for only Issues and Issue comments, with content type `application/json` and the same secret.
5. Add health/metrics and alerting without logging signatures, secrets, or raw bodies.
6. Add a separately reviewed transactional consumer for the `dev` profile.
7. Exercise signed test deliveries and restart/replay behavior before any real handoff.
