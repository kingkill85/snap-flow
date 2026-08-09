# Manual preview deployment

SnapFlow has one persistent manual-preview slot: Dockge stack path `/mnt/marder/docker/dockge/stacks/snapflow-test` and operator route `https://snapflow-test.kingkill.org`. Neither value is configurable. There are no per-PR stacks, alternate hosts, dynamic routes, public DNS actions, or direct host ports.

Persistent Neo Dev may offer `/preview <full-40-char-sha>` only after exact-head required CI and a fresh explicit `CLEAN` independent review of a managed Draft PR whose reviewed diff includes a runnable product implementation. Spec/planning, docs, test metadata, workflows, orchestration/control-plane changes, and the `/version` identity plumbing alone are ineligible. The repository validator invokes authenticated `gh`; it accepts no token argument and emits auditable JSON without credentials. It verifies the live Issue is open with `neo-dev`, exhaustively walks the open-PR GraphQL connection, requires exactly one body with an exact closing/reference token for that Issue, fetches that candidate’s full details/files, and reads check-runs directly from the requested commit. The explicit required names are `Backend Tests (Deno)`, `Frontend Tests (Vitest)`, `E2E (Cucumber + Playwright)`, and `Test Summary`; every duplicate run under a required name must be completed successfully, while unrelated checks do not affect the gate.

Independent-review evidence and its report must remain outside the checkout. Evidence has an exact schema binding PR number, base/head SHA, `CLEAN` verdict, strict UTC review time, distinct canonical implementation/reviewer session UUIDs, writer/reviewer login identities, detached checkout SHA, absolute report path, and verified report SHA-256. Missing, extra, malformed, mismatched, stale, future-dated, self-review, or tampered evidence fails closed.

The image workflow is manually dispatched from `main` with a full SHA. It checks out and verifies that exact commit, embeds no runtime credentials, sets OCI source/revision/created labels, pushes by digest, and publishes a GitHub artifact binding the SHA, digest, build time, repository, and workflow run. The deployment CLI accepts that run ID, downloads the evidence through authenticated `gh`, and deploys only `ghcr.io/kingkill85/snap-flow@sha256:<digest>`; the full-SHA tag is informational. The normal workflow binds its explicit tag and OCI revision/created metadata to the verified source SHA rather than moving event context. `/version` and the small authenticated-layout footer expose the full build SHA.

## Fixed-slot operations

The stack directory must already exist, resolve canonically to the fixed path, and contain an ordinary no-follow `.snapflow-preview-only` file. Compose, environment, lock, backup, `state`, and `uploads` entries must also be ordinary no-follow entries. The compose definition uses the already-authorized external `preview-internal` network, no `ports`, preview-only credentials supplied at runtime, and an immutable image digest.

Read-only preflight and verification are separate from mutation:

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack preflight <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack verify <full-sha> <successful-image-workflow-run-id>
```

Mutation additionally requires `SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED=OWNER_AUTHORIZED_MANUAL_PREVIEW`, `PREVIEW_ADMIN_EMAIL`, and non-default `PREVIEW_ADMIN_PASSWORD`/`PREVIEW_JWT_SECRET` values. One exclusive fixed-slot lock covers snapshot through post-verification. Deploy/reset/rollback capture prior presence and identity, quiesce, build and fsync a same-filesystem temporary snapshot, verify its exact schema/presence/no-symlink/digest seal, and atomically publish it before any switch or deletion. Snapshot failure resumes and verifies the unchanged prior stack or proves prior absence. A failed mutation quiesces its attempt and restores the verified seal. Empty-slot rollback proves the attempted container absent. Preview startup suppresses unrelated default-admin seeding; after migrations become healthy the tooling idempotently provisions the explicit preview account without passing or logging its password. Rollback accepts only a generated backup identifier and transactionally restores its own pre-action snapshot if the requested rollback fails.

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack deploy <full-sha> <successful-image-workflow-run-id>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack reset-seed <full-sha> <successful-image-workflow-run-id>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack rollback <backup-id>
```

Pre-deploy preflight proves only fixed-host DNS plus a valid TLS/reverse-proxy response; an HTTP upstream error is acceptable so the first slot can bootstrap after private ingress authorization but before an app is healthy. Standalone `verify` is strictly read-only: compose/container health, running RepoDigest, OCI revision, local `/version`, isolated mounts, and the fixed-route authentication boundary. Authorized deploy/reset transactions alone run `npm run e2e:preview-smoke` while holding the slot lock; any exercise failure attempts cleanup and then restores the transaction snapshot. Reset performs two complete clear/start/readiness/provision/baseline cycles and requires matching fingerprints before leaving the defined baseline. The Playwright entrypoint uses only the fixed route, requires preview-only credentials and `EXPECTED_SHA`, logs in at phone width, proves the authenticated build footer, creates identifiable preview-only project data through the real API/UI, proves it after reload and controlled restart, then deletes it. Generic CI E2E remains separate. Scenario packets bind persistence/mobile claims to structured verifier evidence and include only `/fix <bounded feedback>` or `/accept <full-sha>`; `/merge` is not legal at this gate.

Current live boundary: Neo Dev discovered `snapflow-test.kingkill.org` as NX/non-resolving on 2026-08-09. Dockge is reachable only through authenticated LAN address `http://192.168.178.4:5001`. Therefore preflight must fail closed and no deployment may occur until the owner separately provides the already-authorized private/internal route. This repository does not create it.
