import assert from 'node:assert/strict';
import test from 'node:test';

import { FIXED_PREVIEW_ROUTE, readPreviewSmokeContract } from
  '../support/manual-preview-contract.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('manual preview smoke accepts only fixed route credentials and exact SHA', () => {
  const contract = readPreviewSmokeContract({
    PREVIEW_ADMIN_EMAIL: 'preview@example.test',
    PREVIEW_ADMIN_PASSWORD: 'preview-only-password',
    EXPECTED_SHA: SHA,
    PREVIEW_SMOKE_PHASE: 'create',
    BASE_URL: 'https://attacker.example',
  });
  assert.equal(FIXED_PREVIEW_ROUTE, 'https://snapflow-test.kingkill.org');
  assert.deepEqual(contract, {
    route: FIXED_PREVIEW_ROUTE,
    email: 'preview@example.test',
    password: 'preview-only-password',
    expectedSha: SHA,
    phase: 'create',
    createdId: undefined,
  });
});

test('manual preview smoke rejects missing credentials and non-full SHA', () => {
  for (const environment of (
    [{ EXPECTED_SHA: SHA },
     { PREVIEW_ADMIN_EMAIL: 'x', PREVIEW_ADMIN_PASSWORD: 'y', EXPECTED_SHA: 'short' },
     { PREVIEW_ADMIN_EMAIL: 'x', PREVIEW_ADMIN_PASSWORD: 'y', EXPECTED_SHA: SHA,
       PREVIEW_SMOKE_PHASE: 'verify-cleanup' }]
  )) {
    assert.throws(() => readPreviewSmokeContract(environment));
  }
});

test('cleanup phase requires a numeric preview-only project id', () => {
  const base = {
    PREVIEW_ADMIN_EMAIL: 'preview@example.test',
    PREVIEW_ADMIN_PASSWORD: 'preview-only-password',
    EXPECTED_SHA: SHA,
    PREVIEW_SMOKE_PHASE: 'cleanup',
  };
  assert.throws(() => readPreviewSmokeContract(base));
  assert.equal(readPreviewSmokeContract({ ...base, PREVIEW_SMOKE_ID: '42' }).createdId, '42');
});
