import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { oauthClientRepository } from '../repositories/oauth-client.ts';
import { verifySessionCookie, OAUTH_SESSION_COOKIE_NAME } from '../services/oauth/session-cookie.ts';
import { verifyS256 } from '../services/oauth/pkce.ts';
import { generateToken } from '../services/jwt.ts';
import { createRefreshToken, verifyRefreshToken, revokeRefreshToken } from '../services/refresh-token.ts';
import { userRepository } from '../repositories/user.ts';
import { oauthCodeRepository } from '../repositories/oauth-code.ts';

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

oauthRoutes.post('/token', async (c) => {
  const form = await c.req.formData();
  const grantType = String(form.get('grant_type') ?? '');

  if (grantType === 'authorization_code') {
    const code = String(form.get('code') ?? '');
    const redirectUri = String(form.get('redirect_uri') ?? '');
    const clientId = String(form.get('client_id') ?? '');
    const verifier = String(form.get('code_verifier') ?? '');

    if (!code || !redirectUri || !clientId || !verifier) {
      return c.json({ error: 'invalid_request', error_description: 'missing field' }, 400);
    }
    const consumed = await oauthCodeRepository.consume(code);
    if (!consumed) {
      return c.json({ error: 'invalid_grant', error_description: 'code invalid/expired/reused' }, 400);
    }
    if (consumed.client_id !== clientId) {
      return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, 400);
    }
    if (consumed.redirect_uri !== redirectUri) {
      return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400);
    }
    const pkceOk = await verifyS256(verifier, consumed.code_challenge);
    if (!pkceOk) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    }

    const user = await userRepository.findById(consumed.user_id);
    if (!user) return c.json({ error: 'invalid_grant', error_description: 'user gone' }, 400);

    const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const refreshToken = await createRefreshToken(user.id);

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      scope: consumed.scope ?? 'read',
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = String(form.get('refresh_token') ?? '');
    if (!refreshToken) return c.json({ error: 'invalid_request' }, 400);
    const userId = await verifyRefreshToken(refreshToken);
    if (userId === null) return c.json({ error: 'invalid_grant' }, 400);
    const user = await userRepository.findById(userId);
    if (!user) return c.json({ error: 'invalid_grant' }, 400);

    await revokeRefreshToken(refreshToken);
    const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const newRefresh = await createRefreshToken(user.id);
    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: newRefresh,
      scope: 'read',
    });
  }

  return c.json({ error: 'unsupported_grant_type' }, 400);
});

export default oauthRoutes;
