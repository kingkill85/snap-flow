import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthCodeRepository } from '../../src/repositories/oauth-code.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';

async function seedUserAndClient() {
  const tenant = await tenantRepository.create({ name: 'T' });
  const user = await userRepository.create({
    email: 't@t.t', password_hash: 'x', role: 'user',
    full_name: 'T', tenant_id: tenant.id,
  });
  const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
  return { user, client };
}

Deno.test('oauth-code repository', async (t) => {
  await setupTestDatabase();

  await t.step('create stores code with expires_at in the future', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc', scope: 'read',
    });
    assert(created.code.length > 0);
    assert(new Date(created.expires_at).getTime() > Date.now());
  });

  await t.step('consume returns code and marks consumed', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc',
    });
    const consumed = await oauthCodeRepository.consume(created.code);
    assertEquals(consumed?.user_id, user.id);
    const again = await oauthCodeRepository.consume(created.code);
    assertEquals(again, null);
  });

  await t.step('consume returns null for expired code', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc',
      ttl_seconds: -1,
    });
    const consumed = await oauthCodeRepository.consume(created.code);
    assertEquals(consumed, null);
  });
});
