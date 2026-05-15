import { assertEquals, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';

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
});
