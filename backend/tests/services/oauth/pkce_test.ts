import { assertEquals } from '@std/assert';
import { verifyS256 } from '../../../src/services/oauth/pkce.ts';

Deno.test('PKCE S256 verification', async (t) => {
  await t.step('verifies a known correct verifier/challenge pair (RFC 7636 example)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    assertEquals(await verifyS256(verifier, challenge), true);
  });

  await t.step('rejects mismatched pair', async () => {
    assertEquals(await verifyS256('wrong', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  });
});
