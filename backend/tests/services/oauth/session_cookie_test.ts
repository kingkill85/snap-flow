import { assertEquals, assert } from '@std/assert';
import { signSessionCookie, verifySessionCookie } from '../../../src/services/oauth/session-cookie.ts';

Deno.test('oauth session cookie', async (t) => {
  await t.step('sign produces a string and verify returns the same userId', async () => {
    const cookie = await signSessionCookie(42);
    assert(cookie.length > 0);
    const userId = await verifySessionCookie(cookie);
    assertEquals(userId, 42);
  });

  await t.step('verify returns null for tampered cookie', async () => {
    const cookie = await signSessionCookie(42);
    // Find the signature segment, flip a character in its middle (not the
    // last char — base64url padding bits make end-tampering non-deterministic).
    const [payload, sig] = cookie.split('.');
    const mid = Math.floor(sig.length / 2);
    const tamperedSigChar = sig[mid] === 'A' ? 'B' : 'A';
    const tamperedSig = sig.slice(0, mid) + tamperedSigChar + sig.slice(mid + 1);
    const tampered = `${payload}.${tamperedSig}`;
    assertEquals(await verifySessionCookie(tampered), null);
  });

  await t.step('verify returns null for garbage', async () => {
    assertEquals(await verifySessionCookie('garbage'), null);
  });
});
