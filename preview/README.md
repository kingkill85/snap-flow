# Permanent SnapFlow test stack

`preview/deploy.py <full-40-character-sha>` updates the single permanent
`snapflow-test` stack to the immutable image for that commit.

The stack always uses `https://snapflow-test.kingkill.org` and the same persistent
data/upload mounts. Updating the software does not reset, seed, or remove data.
If startup or `/version` verification fails, the previous image configuration is
restored.

Initial host setup requires a mode-`600` `.env` beside `compose.yaml`:

```dotenv
JWT_SECRET=<preview-only-secret>
SNAPFLOW_IMAGE=ghcr.io/kingkill85/snap-flow:sha-<full-sha>
SNAPFLOW_SHA=<full-sha>
```

Build an exact image with the **Build exact-SHA preview image** workflow, then run
the deploy command on the Docker host.
