# Independent implementation review maintenance evidence

This document preserves the strict vertical-slice TDD transcript for the
controller-only maintenance change. Approved OpenSpec artifacts are read-only.

## Slice 1 — migrate an in-flight approved implementation

RED command:

```text
python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewMigrationTests.test_migrates_inflight_spec_approved_without_reapproval_or_new_implementer
```

RED result: `FAILED (errors=1)` — `ModuleNotFoundError` for the not-yet-created
controller review module.

GREEN command: same command.

GREEN result: `Ran 1 test ... OK`.

## Slice 2b — implementer prompt cannot self-review

RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewTopologyTests.test_implementer_prompt_cannot_self_review_or_publish_accept
```

RED result: `FAILED (failures=1)` — the implementation prompt still appended
`/accept <exact-full-implementation-sha>` and lacked the independent reviewer.

GREEN command: same command.

GREEN result: `Ran 1 test ... OK`.

The focused compatibility run then exposed one obsolete assertion expecting the
implementer prompt to publish `/accept`; it failed with `IndexError` because the
unsafe footer is intentionally absent. The assertion was updated to require the
independent reviewer handoff and prohibit `/accept`.

## Slice 2 — independent fresh reviewer topology

RED command:

```text
python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewTopologyTests.test_reviewer_must_be_fresh_and_never_the_implementer
```

RED result: `FAILED (errors=1)` — `begin_review` did not exist.

GREEN command: same command.

GREEN result: `Ran 1 test ... OK`.

## Slices 3–12 — review evidence and verdict state machine

Each focused test below was added before its production behavior. RED was run
individually with `python3 -m unittest <fully-qualified-test>`:

```text
test_missing_or_failed_deterministic_evidence_blocks_review_start
test_stale_reviewer_sha_and_malformed_provenance_block
test_structured_blocking_finding_resumes_same_implementer
test_fix_changed_sha_requires_new_fresh_reviewer
test_max_three_fix_cycles_blocks_fourth
test_repeated_blocking_finding_blocks_immediately
test_material_spec_finding_requests_revision_without_editing_spec
test_reviewer_crash_blocks_with_exact_evidence
test_duplicate_terminal_verdict_is_idempotent
test_clean_review_renders_complete_acceptance_footer
```

RED results: the evidence test reported `FAILED (failures=5)` because invalid
evidence was accepted; each of the other nine tests reported `FAILED (errors=1)`
because its state-machine API did not exist. Each invocation ran exactly one test.

GREEN commands: the same ten individually-qualified commands.

GREEN results: `Ran 12 tests ... OK` (the complete new state-machine file,
including migration and topology slices).

## Slice 17 — controller-owned acceptance gate

RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewPersistenceTests.test_controller_cannot_enter_acceptance_gate_until_exact_clean_verdict
```

RED result: `FAILED (errors=1)` — `Controller` had no
`begin_independent_review` API.

GREEN command: same command.

GREEN result: `Ran 1 test ... OK`.

## Slices 15–16 — non-destructive canary and install coverage

RED commands:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewCanaryTests.test_fixture_canary_exercises_stale_fix_and_clean_review_loop
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewCanaryTests.test_install_manifest_includes_review_runtime_with_hash_verification
```

RED results: canary `FAILED (errors=1)` because the harness module did not
exist; manifest test `FAILED (failures=1)` because runtime files and declared
verification were absent.

GREEN commands: same commands.

GREEN results: `Ran 2 tests ... OK`.

## Slices 13–14 — lifecycle persistence and removal of self-review transition

RED commands:

```text
python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewPersistenceTests.test_legacy_file_state_migrates_and_serializes_review_state
python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewPersistenceTests.test_spec_approved_verification_enters_independent_review_not_acceptance_gate
```

RED results: after setting the controller test import path, the migration test
failed with `AttributeError: WorkState has no attribute review_state`; the
transition test exposed that the old verifier still selected
`implementation_verified` (the initial helper import typo was corrected before
production changes).

GREEN commands: same commands with `PYTHONPATH=tools`.

GREEN results: `Ran 2 tests ... OK`.

## First full controller regression run

Command:

```text
PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -p 'test_*.py'
```

Result: `Ran 179 tests in 11.803s — OK (skipped=1)`.

## Final verification

```text
PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -p 'test_*.py'
```

Result: `Ran 181 tests in 11.300s — OK (skipped=1)`. The single skip is the
existing optional live integration test. Expected argparse rejection output is
emitted by negative CLI boundary tests.

```text
PYTHONPATH=tools python3 -c 'from neo_dev_webhook.independent_review_canary import run_canary; import json; print(json.dumps(run_canary(), sort_keys=True))'
```

Result: all six expected phases, same implementer `true`, fresh reviewer
`true`, and the exact four-command footer.

```text
python3 -m compileall -q tools/neo_dev_webhook
python3 -m json.tool tools/neo_dev_webhook/controller/state-schema.v1.json
python3 -m json.tool tools/neo_dev_webhook/controller/install-manifest.v1.json
git diff --check
npm exec -- openspec validate issue-77-enforce-container-boundary --strict
```

Results: all exited 0; strict validation reported the protected Issue #77
change valid. OpenSpec 1.8.0 has no `verify` CLI command, and this maintenance
change intentionally has no OpenSpec change because approved artifacts were
explicitly out of scope. UI/Playwright is N/A: only controller Python, schema,
install metadata, tests, and evidence changed.

Final added-content audit covered all tracked modifications and untracked files:
`SECRET_SCAN=PASS`, `PRIVATE_PATH_SCAN=PASS`, `SCOPE_SCAN=PASS`, and
`CHANGED_FILE_COUNT=11`. No `backend/`, `frontend/`, or `openspec/` path changed.

## Independent review correction cycle 1

Reviewed implementation SHA:
`2a4b95a46dc0e1a964de266f2551dfc95186e5de`

Reviewer provenance: independent fresh-context Codex thread
`019fe056-858b-7ad1-8cd0-bca329d16062`.

Disposition: **BLOCKING**, fix/re-review cycle 1 of maximum 3.

Structured findings: IR-001 critical spec-compliance (unreachable production
review loop); IR-002 high regression (runtime/supervisor lifecycle omissions);
IR-003 high spec-compliance (approved-spec provenance not bound); IR-004 medium
missing-test, blocking (installed canary not executed by staging/live verify).

### IR-001 — production controller entrypoint

RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_review_entrypoint_persists_intent_and_launches_separate_supervisor
```

RED result: `FAILED (errors=1)` — the production controller rejected `review`
as an unsupported operation before any launch.

GREEN command: same command.

GREEN result: pending.

IR-002 duplicate terminal RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_duplicate_supervisor_clean_terminal_is_idempotent_after_promotion
```

RED result: `FAILED (errors=1)` — the duplicate clean terminal was rejected
after the first event promoted the lifecycle.

GREEN command: same command.

GREEN result: pending.

IR-001 correction-to-re-review RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_correction_attestation_records_new_sha_and_returns_to_fresh_review
```

RED result: `FAILED (errors=1)` — `attest` rejected the independent-review
correction lifecycle as unverifiable.

GREEN command: same command.

GREEN result: pending.

IR-002 correction runtime RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_correction_prompt_contains_exact_findings_and_preserves_spec
```

RED result: `FAILED (errors=1)` — no correction-specific runtime prompt existed.

GREEN command: same command.

GREEN result: pending.

Additional IR-001 correction-routing RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_blocking_verdict_autonomously_resumes_same_implementer_with_findings
```

RED result: `FAILED (failures=1)` — the blocking verdict stayed
`exited_resumable` and did not launch the durable implementer correction.

GREEN command: same command.

GREEN result: pending.

Additional IR-001 webhook/orchestrator RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_automation.AutomationTest.test_implementation_attestation_autonomously_starts_independent_review
```

RED result: `FAILED (failures=1)` — the durable consumer completed attestation
without invoking the review entrypoint.

GREEN command: same command.

GREEN result: pending.

### IR-004 — installed canary is a deployment gate

RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_deployment.DeploymentTest.test_installed_canary_failure_blocks_verification_and_rollback_remains_exact
```

RED result: `FAILED (failures=1)` — installer returned usage status 2 because
no installed-canary verification action existed.

GREEN command: same command.

GREEN result: pending.

### IR-003 — exact approved-spec and approval-artifact binding

RED command:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_review_start_and_clean_promotion_reject_spec_approval_mismatch
```

RED result: `FAILED (failures=1)` — the production `review` entrypoint accepted
a mismatched approved-spec SHA.

GREEN command: same command.

GREEN result: pending.

RED command for supervisor callbacks/final handoff:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_supervisor_callbacks_bind_reviewer_and_render_clean_handoff
```

RED result: `FAILED (errors=1)` — the controller had no supervised reviewer
session callback.

GREEN command: same command.

GREEN result: pending.

### IR-002 — reviewer runtime and idempotent recovery

RED commands:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_review_retry_reuses_persisted_run_without_implementer_identity
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review.IndependentReviewEntrypointTests.test_runtime_builds_fresh_reviewer_process_and_schema
```

RED results: retry/recovery was already GREEN after the IR-001 production slice
(`Ran 1 test ... OK`), proving the persisted run is reused; the fresh runtime
test was RED with `ImportError` because no reviewer schema/prompt existed.

GREEN command: rerun the fresh runtime test.

GREEN result: pending.

### Correction-cycle GREEN and final verification

Every focused RED command above was rerun after its corresponding production
slice and reported `Ran 1 test ... OK`. The combined controller/runtime,
verification, automation, orchestrator, and deployment focus run was:

```text
PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_independent_review tools.neo_dev_webhook.tests.test_verification tools.neo_dev_webhook.tests.test_automation tools.neo_dev_webhook.tests.test_generic_orchestrator tools.neo_dev_webhook.tests.test_deployment tools.neo_dev_webhook.tests.test_codex_runtime tools.neo_dev_webhook.tests.test_project_control
```

Result: `Ran 149 tests in 7.875s — OK`.

Final full controller command:

```text
PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -p 'test_*.py'
```

Result: `Ran 192 tests in 11.629s — OK (skipped=1)`. The one skip remains the
pre-existing optional live integration test; argparse output is expected from
negative boundary tests.

Additional final commands, all exit 0:

```text
python3 -m compileall -q tools/neo_dev_webhook
bash -n tools/neo_dev_webhook/deploy/controller-install.sh tools/neo_dev_webhook/deploy/hermes-controller-install.sh
python3 -m json.tool tools/neo_dev_webhook/controller/state-schema.v1.json
python3 -m json.tool tools/neo_dev_webhook/controller/install-manifest.v1.json
npm exec -- openspec validate issue-77-enforce-container-boundary --strict
PYTHONPATH=tools python3 -m neo_dev_webhook.independent_review_canary
git diff --check
```

Strict OpenSpec validation reports the protected, unchanged Issue #77 change
valid. OpenSpec 1.8.0 has no `verify` CLI command. Playwright/UI evidence is N/A
because this correction changes only control-plane Python, controller deployment
shell, tests, and maintenance evidence.

Final added-content audit: `SECRET_SCAN=PASS`, `PRIVATE_PATH_SCAN=PASS`,
`SCOPE_SCAN=PASS`, `CHANGED_FILE_COUNT=15`. No `backend/`, `frontend/`, or
`openspec/` path changed.
