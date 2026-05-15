import { assert, assertEquals } from '@std/assert';
import { generateClientSecret, hashClientSecret, timingSafeEqual } from '../../../src/services/oauth/client-secret.ts';

Deno.test('client-secret helpers', async (t) => {
  await t.step('generateClientSecret returns 43-char base64url', () => {
    const s = generateClientSecret();
    assertEquals(s.length, 43);
    assert(/^[A-Za-z0-9_-]+$/.test(s));
  });

  await t.step('two generated secrets differ', () => {
    const a = generateClientSecret();
    const b = generateClientSecret();
    assert(a !== b);
  });

  await t.step('hashClientSecret produces 64-char hex SHA-256', async () => {
    const h = await hashClientSecret('hello');
    assertEquals(h, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  await t.step('timingSafeEqual returns true for equal strings, false otherwise', () => {
    assert(timingSafeEqual('abc', 'abc'));
    assert(!timingSafeEqual('abc', 'abd'));
    assert(!timingSafeEqual('abc', 'ab'));
  });
});
