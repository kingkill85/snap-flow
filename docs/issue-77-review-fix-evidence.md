# Issue 77 independent-review fix evidence

Date: 2026-08-06. Branch: `chore/issue-77-openspec-workflow`. No commit, push, archive, merge, deployment, ingress, release, or secret change was performed.

- TDD RED: `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v` initially failed with `ModuleNotFoundError: neo_dev_webhook.automation`; archive guard tests separately failed before the guard existed.
- Focused GREEN after the initial review pass: the same discovery command passed 15/15 tests. A fresh audit added red tests for the real controller CLI and multi-JSON output, creation-time revalidation, receiver isolation from network work, multi-connection races, lease-owner compare-and-set, bounded dead-lettering, aggregate headers, malformed schema, and full archive delta syntax. Final command evidence is recorded at the end of this audit.
- Python syntax/type-level compile: `python3 -m compileall -q tools/neo_dev_webhook tools/openspec_archive_guard.py` and `python3 -m py_compile tools/neo_dev_webhook/*.py tools/openspec_archive_guard.py` passed. No Python static type checker or formatter is installed in the repository toolchain.
- Strict spec validation: `openspec validate issue-77-governed-webhook-handoff --strict` passed after scenario fixes.
- Backend lint: `cd backend && deno lint` passed (`Checked 141 files`).
- Backend full suite: `cd backend && deno task test` reported 327 passed and one failure at `tests/services/excel-sync_test.ts:161`. `git diff --exit-code main -- backend/src/services/excel-sync.ts backend/tests/services/excel-sync_test.ts` passed (no PR diff), and focused `deno test --allow-all tests/services/excel-sync_test.ts` reproduced the same failure (7 passed, 1 failed), isolating it as pre-existing and unrelated.
- Frontend: `cd frontend && npm run lint && npm run test:run` passed; 37/37 files and 264/264 tests passed. Existing React `act(...)` and canceled/network-request warnings were printed.
- Repository hygiene: `git diff --check` passed. `rg` found no personal-name, old marker, product webhook env, or removed backend webhook path references. `/workspace/snap-flow/test-results/` was not touched.
- The authorized script is controller-owned at `/opt/data/scripts/neo-dev/task.py` and intentionally unavailable on this remote host. The production runner now validates its real top-level help shape, invokes positional title plus `--body`, `--workspace`, and `--idempotency-key`, and parses create-plus-dispatch JSON streams. Tests mock subprocess execution and never create a real task.
- Playwright: not applicable; this change is standalone automation and governance documentation with no UI behavior change.
- Bootstrap: issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. This evidence does not weaken future material-change, merge, or privileged-operation gates.

## Fresh audit verification

- Each corrected behavior was first exercised by a failing focused unittest before implementation. The final `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v` passed 23/23 tests.
- `python3 -m py_compile tools/neo_dev_webhook/*.py tools/openspec_archive_guard.py`, `OPENSPEC_TELEMETRY=0 openspec validate issue-77-governed-webhook-handoff --strict`, and `git diff --check` passed.
- `cd backend && deno lint` passed. `deno task test` again reported 327 passed and the same unrelated `tests/services/excel-sync_test.ts:161` failure; the webhook implementation has no backend diff except deletion of the superseded first-pass integration.
- `cd frontend && npm run lint && npm run test:run` passed: 37/37 files and 264/264 tests. Existing React `act(...)` and canceled/network-request warnings remain.
- No real `task.py` invocation, task creation, commit, push, archive, merge, deployment, activation, ingress, secret/access change, or edit under `/workspace/snap-flow/test-results` occurred.

## Five-finding follow-up

- Focused RED: the five-test command covering late wakeups, lease-expiry exhaustion, configurable maximum runtime, exact archive blocks, and server admission failed all five before implementation: two `Store.claim(..., max_attempts=...)` `TypeError`s, a `TaskRunner(max_runtime=...)` `TypeError`, stale extra scenario return code `0`, and missing `BoundedThreadingHTTPServer`.
- Focused GREEN: the identical five-test command passed 5/5 after implementation.
- Tooling full suite GREEN: `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v` passed 28/28.
- Final verification GREEN: `python3 -m py_compile tools/neo_dev_webhook/*.py tools/openspec_archive_guard.py`, `OPENSPEC_TELEMETRY=0 openspec validate issue-77-governed-webhook-handoff --strict`, and `git diff --check` all passed.
- Backend and frontend suites were not rerun for this five-finding follow-up; no claim is made that they were.
