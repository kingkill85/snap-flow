import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { oauthClientRepository } from '../repositories/oauth-client.ts';

export const oauthRoutes = new Hono();

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().optional(),
}).passthrough();

oauthRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { redirect_uris, client_name } = c.req.valid('json');
  const client = await oauthClientRepository.create({
    redirect_uris,
    ...(client_name !== undefined ? { client_name } : {}),
  });
  return c.json({
    client_id: client.id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: client.redirect_uris,
    client_name: client.client_name,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }, 201);
});

export default oauthRoutes;
