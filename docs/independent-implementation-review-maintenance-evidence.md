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
