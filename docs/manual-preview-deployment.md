# Manual preview deployment

SnapFlow has one persistent manual-preview slot: Dockge stack path `/mnt/marder/docker/dockge/stacks/snapflow-test` and operator route `https://snapflow-test.kingkill.org`. Neither value is configurable. There are no per-PR stacks, alternate hosts, dynamic routes, public DNS actions, or direct host ports.

Persistent Neo Dev may offer `/preview <full-40-char-sha>` only after exact-head required CI and a fresh explicit `CLEAN` independent review of a managed Draft PR whose reviewed diff includes a runnable product implementation. Spec/planning, docs, test metadata, workflows, orchestration/control-plane changes, and the `/version` identity plumbing alone are ineligible. The repository validator invokes authenticated `gh`; it accepts no token argument and emits auditable JSON without credentials. It verifies the live Issue is open with `neo-dev`, requires exactly one open PR body with an exact closing/reference token for that Issue, and reads check-runs directly from the requested commit. The explicit required names are `Backend Tests (Deno)`, `Frontend Tests (Vitest)`, `E2E (Cucumber + Playwright)`, and `Test Summary`; every duplicate run under a required name must be completed successfully, while unrelated checks do not affect the gate.

Independent-review evidence and its report must remain outside the checkout. Evidence has an exact schema binding PR number, base/head SHA, `CLEAN` verdict, strict UTC review time, distinct canonical implementation/reviewer session UUIDs, writer/reviewer login identities, detached checkout SHA, absolute report path, and verified report SHA-256. Missing, extra, malformed, mismatched, stale, future-dated, self-review, or tampered evidence fails closed.

The image workflow is manually dispatched from `main` with a full SHA. It checks out and verifies that exact commit, embeds no runtime credentials, sets OCI source/revision/created labels, pushes by digest, and attaches immutable `sha-<full-sha>` metadata. The normal image workflow likewise checks out and verifies its event’s exact source SHA before labeling or building. `/version` and the small authenticated-layout footer expose the full build SHA.

## Fixed-slot operations

The stack directory must already exist, resolve canonically to the fixed path, and contain `.snapflow-preview-only`. `state` and `uploads` must be ordinary children of that directory. The compose definition uses the already-authorized external `preview-internal` network, no `ports`, preview-only credentials supplied at runtime, and an immutable full-SHA image tag.

Read-only preflight and verification are separate from mutation:

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack preflight <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack verify <full-sha>
```

Mutation additionally requires `SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED=OWNER_AUTHORIZED_MANUAL_PREVIEW` and non-default `PREVIEW_ADMIN_PASSWORD`/`PREVIEW_JWT_SECRET` environment values. Deploy seals the prior compose, `.env`, state, uploads, and present/absent metadata, switches the same slot, and rolls back automatically on failure. Reset/seed proves the fixed marker, canonical isolated paths, and absence of nested symlinks before deletion; any down/up/seed/verify failure verifies the seal, restores byte-identical prior content, and attempts to recreate the previous stack before returning failure. Rollback accepts only a generated backup identifier.

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack deploy <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack reset-seed <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack rollback <backup-id>
```

Pre-deploy preflight proves only fixed-host DNS plus a valid TLS/reverse-proxy response; an HTTP upstream error is acceptable so the first slot can bootstrap after private ingress authorization but before an app is healthy. Post-deploy verification remains strict: compose/container health, immutable image reference, OCI revision, local `/version`, isolated mounts, route authentication, persistence, repeatable reset/seed evidence, and `npm run e2e:preview-smoke`. That separate Playwright entrypoint uses only the fixed route, requires preview-only credentials and `EXPECTED_SHA`, logs in at phone width, proves the authenticated build footer, and opens the real Projects page before packet publication. Generic CI E2E remains separate. Scenario packets include the verified URL/SHA/build time, setup, navigation, expected result, persistence/mobile checks, screenshot guidance, and only `/fix <bounded feedback>` or `/accept <full-sha>`. `/merge` is not legal at this gate.

Current live boundary: Neo Dev discovered `snapflow-test.kingkill.org` as NX/non-resolving on 2026-08-09. Dockge is reachable only through authenticated LAN address `http://192.168.178.4:5001`. Therefore preflight must fail closed and no deployment may occur until the owner separately provides the already-authorized private/internal route. This repository does not create it.
