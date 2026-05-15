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
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a');
    assertEquals(await verifySessionCookie(tampered), null);
  });

  await t.step('verify returns null for garbage', async () => {
    assertEquals(await verifySessionCookie('garbage'), null);
  });
});
