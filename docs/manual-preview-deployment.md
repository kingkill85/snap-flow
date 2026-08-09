# Manual preview deployment

SnapFlow has one persistent manual-preview slot: Dockge stack path `/mnt/marder/docker/dockge/stacks/snapflow-test` and operator route `https://snapflow-test.kingkill.org`. Neither value is configurable. There are no per-PR stacks, alternate hosts, dynamic routes, public DNS actions, or direct host ports.

Persistent Neo Dev may offer `/preview <full-40-char-sha>` only after exact-head required CI and a fresh explicit `CLEAN` independent review of a managed Draft PR whose reviewed diff includes a runnable product implementation. Spec/planning, docs, test metadata, workflows, orchestration/control-plane changes, and the `/version` identity plumbing alone are ineligible. The repository validator invokes authenticated `gh`; it accepts no token argument and emits auditable JSON without credentials.

The image workflow is manually dispatched from `main` with a full SHA. It checks out and verifies that exact commit, embeds no runtime credentials, sets OCI source/revision/created labels, pushes by digest, and attaches immutable `sha-<full-sha>` metadata. `/version` and the small authenticated-layout footer expose the full build SHA.

## Fixed-slot operations

The stack directory must already exist, resolve canonically to the fixed path, and contain `.snapflow-preview-only`. `state` and `uploads` must be ordinary children of that directory. The compose definition uses the already-authorized external `preview-internal` network, no `ports`, preview-only credentials supplied at runtime, and an immutable full-SHA image tag.

Read-only preflight and verification are separate from mutation:

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack preflight <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack verify <full-sha>
```

Mutation additionally requires `SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED=OWNER_AUTHORIZED_MANUAL_PREVIEW` and non-default `PREVIEW_ADMIN_PASSWORD`/`PREVIEW_JWT_SECRET` environment values. Deploy seals the prior compose and `.env` byte content, switches the same slot, and rolls compose back automatically on failure. Reset/seed proves the fixed marker and canonical isolated paths before deletion. Rollback accepts only a generated backup identifier.

```bash
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack deploy <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack reset-seed <full-sha>
PYTHONPATH=tools python3 -m neo_dev_webhook.manual_preview_stack rollback <backup-id>
```

Verification checks compose/container health, immutable image reference, OCI revision, local `/version`, isolated mounts, route reachability/authentication, persistence, repeatable reset/seed evidence, and the approved browser-ready flow before packet publication. Scenario packets include the verified URL/SHA/build time, setup, navigation, expected result, persistence/mobile checks, screenshot guidance, and only `/fix <bounded feedback>` or `/accept <full-sha>`. `/merge` is not legal at this gate.

Current live boundary: Neo Dev discovered `snapflow-test.kingkill.org` as NX/non-resolving on 2026-08-09. Dockge is reachable only through authenticated LAN address `http://192.168.178.4:5001`. Therefore preflight must fail closed and no deployment may occur until the owner separately provides the already-authorized private/internal route. This repository does not create it.
