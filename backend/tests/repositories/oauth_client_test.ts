import { assertEquals, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { generateClientSecret, hashClientSecret } from '../../src/services/oauth/client-secret.ts';

Deno.test('oauth-client repository', async (t) => {
  await setupTestDatabase();

  await t.step('create returns client with id and stores redirect_uris', async () => {
    await clearDatabase();
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://claude.ai/oauth/callback'],
      client_name: 'Claude',
    });
    assertNotEquals(created.id, '');
    assertEquals(created.redirect_uris, ['https://claude.ai/oauth/callback']);
    assertEquals(created.client_name, 'Claude');
  });

  await t.step('findById returns stored client', async () => {
    await clearDatabase();
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://x/cb'],
    });
    const found = await oauthClientRepository.findById(created.id);
    assertEquals(found?.id, created.id);
    assertEquals(found?.redirect_uris, ['https://x/cb']);
  });

  await t.step('findById returns null for unknown id', async () => {
    await clearDatabase();
    const found = await oauthClientRepository.findById('nope');
    assertEquals(found, null);
  });

  await t.step('verifySecret returns true for matching secret', async () => {
    await clearDatabase();
    const raw = generateClientSecret();
    const hash = await hashClientSecret(raw);
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://c/cb'],
      client_secret_hash: hash,
    });
    assertEquals(await oauthClientRepository.verifySecret(created.id, raw), true);
  });

  await t.step('verifySecret returns false for wrong secret', async () => {
    await clearDatabase();
    const hash = await hashClientSecret(generateClientSecret());
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://c/cb'],
      client_secret_hash: hash,
    });
    assertEquals(await oauthClientRepository.verifySecret(created.id, 'wrong'), false);
  });

  await t.step('verifySecret returns false for client without secret', async () => {
    await clearDatabase();
    const created = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    assertEquals(await oauthClientRepository.verifySecret(created.id, 'anything'), false);
  });
});
