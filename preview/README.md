# Permanent SnapFlow test stack

The repository defines exactly one permanent `snapflow-test` stack at
`https://snapflow-test.kingkill.org`.

1. Build the selected full commit SHA with **Build exact-SHA preview image**.
2. Set `SNAPFLOW_IMAGE=ghcr.io/kingkill85/snap-flow:sha-<full-sha>` in the
   stack `.env`.
3. Run `docker compose pull` and `docker compose up -d` in the existing stack.
4. Verify `/health` and `/version`.

The Compose file always reuses the same persistent database and upload mounts.
Updating the software does not reset, seed, create, or remove application data.
