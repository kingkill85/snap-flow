import { assertEquals } from '@std/assert';
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from '../../../src/services/oauth/metadata.ts';

Deno.test('OAuth metadata', async (t) => {
  await t.step('authorization server metadata contains required fields', () => {
    const m = buildAuthServerMetadata('https://snapflow.example.com');
    assertEquals(m.issuer, 'https://snapflow.example.com');
    assertEquals(m.authorization_endpoint, 'https://snapflow.example.com/oauth/authorize');
    assertEquals(m.token_endpoint, 'https://snapflow.example.com/oauth/token');
    assertEquals(m.registration_endpoint, 'https://snapflow.example.com/oauth/register');
    assertEquals(m.code_challenge_methods_supported, ['S256']);
    assertEquals(m.grant_types_supported, ['authorization_code', 'refresh_token']);
    assertEquals(m.response_types_supported, ['code']);
  });

  await t.step('protected resource metadata points at auth server', () => {
    const m = buildProtectedResourceMetadata('https://snapflow.example.com');
    assertEquals(m.resource, 'https://snapflow.example.com/mcp');
    assertEquals(m.authorization_servers, ['https://snapflow.example.com']);
    assertEquals(m.bearer_methods_supported, ['header']);
  });
});
