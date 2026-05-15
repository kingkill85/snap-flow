import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { oauthClientRepository } from '../repositories/oauth-client.ts';
import { verifySessionCookie, OAUTH_SESSION_COOKIE_NAME } from '../services/oauth/session-cookie.ts';

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

oauthRoutes.get('/authorize', async (c) => {
  const responseType = c.req.query('response_type');
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'read';

  if (responseType !== 'code') return c.text('unsupported response_type', 400);
  if (!clientId) return c.text('missing client_id', 400);
  if (!redirectUri) return c.text('missing redirect_uri', 400);
  if (!codeChallenge) return c.text('missing code_challenge', 400);
  if (codeChallengeMethod !== 'S256') return c.text('only S256 supported', 400);

  const client = await oauthClientRepository.findById(clientId);
  if (!client) return c.text('unknown client_id', 400);
  if (!client.redirect_uris.includes(redirectUri)) return c.text('redirect_uri not registered', 400);

  // Parse cookie header
  const cookieHeader = c.req.header('Cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_SESSION_COOKIE_NAME}=([^;]+)`));
  const userId = match ? await verifySessionCookie(match[1]) : null;

  if (userId === null) {
    const returnTo = encodeURIComponent(c.req.url);
    return c.redirect(`/login?return_to=${returnTo}`, 302);
  }

  const consentParams = new URLSearchParams();
  consentParams.set('client_id', clientId);
  consentParams.set('redirect_uri', redirectUri);
  consentParams.set('code_challenge', codeChallenge);
  consentParams.set('state', state);
  consentParams.set('scope', scope);
  return c.redirect(`/oauth/consent?${consentParams.toString()}`, 302);
});

export default oauthRoutes;
