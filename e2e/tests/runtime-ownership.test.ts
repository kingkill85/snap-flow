import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { assertOwnedResponse, assertPortAvailable } from '../support/runtime-ownership.ts';

for (const label of ['backend', 'frontend']) {
  test(`${label} collision fails closed`, async () => {
    const listener = createServer();
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const address = listener.address();
    assert(address && typeof address === 'object');
    await assert.rejects(assertPortAvailable('127.0.0.1', address.port, label), /unavailable/);
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  });
}

test('compatible foreign readiness response is rejected', () => {
  assert.throws(() => assertOwnedResponse(new Response('{}', { status: 200 }), 'expected', 'backend'), /unowned/);
  assert.throws(() => assertOwnedResponse(new Response('{}', { status: 200, headers: { 'X-SnapFlow-E2E-Run': 'other' } }), 'expected', 'frontend'), /unowned/);
});
