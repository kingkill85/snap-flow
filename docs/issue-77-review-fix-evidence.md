# Issue 77 review and verification evidence

Date: 2026-08-06. Branch: `chore/issue-77-openspec-workflow`.

Issue 77 is the repository owner's explicitly authorized one-time workflow bootstrap. This evidence does not authorize merge, release, deployment, public ingress, secrets/access changes, destructive operations, or an exception for later issues.

## Independent review disposition

The initial independent security/correctness and OpenSpec/governance reviews required changes. The implementation was moved out of the product backend into `tools/`, the automated marker was corrected to exact `<!-- neo-dev -->`, and a real durable receiver/consumer handoff was added.

Follow-up independent reviews identified and drove fixes for:

- invalid `task.py --workspace` usage;
- non-reproducible OpenSpec installation;
- trusted-rate starvation by invalid HMAC traffic;
- stalled socket admission exhaustion;
- simultaneous fresh SQLite initialization failures;
- queue/dispatch handoff semantics;
- malformed archive deltas failing open;
- valid skipped/no-delta archive handling;
- incomplete independent-review task wording;
- baseline-test and repository-relative evidence rules;
- slow-drip absolute request deadlines and pre-parse wire header limits;
- bounded dispatcher wake-up and serialized private task creation;
- mixed-case unknown and duplicate archive operations;
- zero-side-effect assertions for ignored events;
- private runner-path configuration and public-data hygiene.

Task 3.3 remains open until the final post-fix independent code/security and test/governance review completes. Playwright is not applicable because this change modifies standalone operational tooling and governance documentation, not UI behavior.

## Final local verification

Commands were run in the issue worktree with `OPENSPEC_TELEMETRY=0` and Python bytecode disabled where applicable.

- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **49/49 passed**. Coverage includes HMAC, exact marker and lookalikes, actor/repository/event/action/label/PR filtering, schema and resource bounds, authenticated rate accounting, absolute slow-drip/header/body deadlines and pre-parse wire header limits, durable enqueue/replay, multi-process fresh-database initialization, separate-connection races, ownership-token claims, lease recovery, bounded dead-lettering, late-wakeup serialization, task idempotency, archive operation parsing, malformed delta rejection, and guard-owned OpenSpec no-delta status validation and generated-workflow coupling.
- `python3 -m compileall -q tools`: passed.
- `npm exec -- openspec validate issue-77-governed-webhook-handoff --strict --no-interactive`: passed.
- `npm exec -- openspec --version`: `1.8.0` from the exact repository lockfile.
- `npm audit --audit-level=low`: **0 vulnerabilities**.
- `cd backend && deno lint`: passed, 141 files checked.
- `cd backend && deno task test`: **327 passed, 1 failed** at `tests/services/excel-sync_test.ts:161`.
- On clean `main`, `cd backend && deno test --allow-all tests/services/excel-sync_test.ts` reproduced the identical assertion at the same test and source line: **7 passed, 1 failed**. The PR has no diff in `backend/src/services/excel-sync.ts` or `backend/tests/services/excel-sync_test.ts`; this is recorded as a pre-existing baseline failure, not a green full suite. The repository owner explicitly accepted this documented baseline exception for Issue #77 on 2026-08-06; it does not apply to later issues.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run test:run`: **37/37 files and 264/264 tests passed**. Existing React `act(...)` and canceled/network-request warnings remain.
- `git diff --check`: passed.
- No Python bytecode is tracked, and repository `test-results/` was not modified.

## Operational boundary

The receiver and consumer remain inactive. Tests inject GitHub and task-runner boundaries and never create a real Kanban task. The repository tests only the abstract configured runner contract. The private controller implementation and live dispatcher configuration are verified outside this public repository.
