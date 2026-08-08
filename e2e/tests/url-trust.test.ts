import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRuntimeUrls } from '../support/runtime-urls.ts';

test('uses only the fixed spawned loopback origins', () => {
  assert.deepEqual(resolveRuntimeUrls({}), {
    frontend: 'http://127.0.0.1:4173', backend: 'http://127.0.0.1:18000',
  });
});

test('rejects inherited URL overrides including alternate loopback ports', () => {
  for (const environment of [
    { E2E_BASE_URL: 'https://attacker.example' },
    { E2E_API_URL: 'http://localhost:18000' },
    { E2E_BASE_URL: 'http://127.0.0.1:9999' },
  ]) assert.throws(() => resolveRuntimeUrls(environment), /override|fixed runtime/);
});
