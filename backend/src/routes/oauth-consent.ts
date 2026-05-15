import { Hono } from 'hono';
import { verifySessionCookie, OAUTH_SESSION_COOKIE_NAME } from '../services/oauth/session-cookie.ts';
import { oauthClientRepository } from '../repositories/oauth-client.ts';
import { oauthCodeRepository } from '../repositories/oauth-code.ts';
import { userRepository } from '../repositories/user.ts';

export const oauthConsentRoutes = new Hono();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string));
}

function getCookieUserId(cookieHeader: string | undefined): Promise<number | null> {
  if (!cookieHeader) return Promise.resolve(null);
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_SESSION_COOKIE_NAME}=([^;]+)`));
  if (!m) return Promise.resolve(null);
  return verifySessionCookie(m[1]);
}

oauthConsentRoutes.get('/consent', async (c) => {
  const userId = await getCookieUserId(c.req.header('Cookie'));
  if (userId === null) {
    const returnTo = encodeURIComponent(c.req.url);
    return c.redirect(`/login?return_to=${returnTo}`, 302);
  }
  const clientId = c.req.query('client_id') ?? '';
  const redirectUri = c.req.query('redirect_uri') ?? '';
  const codeChallenge = c.req.query('code_challenge') ?? '';
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'read';

  const client = await oauthClientRepository.findById(clientId);
  if (!client) return c.text('unknown client', 400);
  if (!client.redirect_uris.includes(redirectUri)) return c.text('bad redirect_uri', 400);

  const user = await userRepository.findById(userId);
  const clientName = escapeHtml(client.client_name ?? 'an MCP client');
  const email = escapeHtml(user?.email ?? '');

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>SnapFlow — Authorize</title></head>
  <body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:24px;border:1px solid #ddd;border-radius:8px">
    <h2>Authorize ${clientName}</h2>
    <p>${clientName} wants to read your SnapFlow projects and catalog as <strong>${email}</strong>.</p>
    <form method="POST" action="/oauth/consent">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
      <button name="action" value="allow" style="padding:10px 16px;margin-right:8px">Allow</button>
      <button name="action" value="deny" style="padding:10px 16px">Deny</button>
    </form>
  </body>
</html>`;
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(html);
});

oauthConsentRoutes.post('/consent', async (c) => {
  const userId = await getCookieUserId(c.req.header('Cookie'));
  if (userId === null) return c.text('not authenticated', 401);

  const form = await c.req.formData();
  const action = form.get('action');
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const codeChallenge = String(form.get('code_challenge') ?? '');
  const state = String(form.get('state') ?? '');
  const scope = String(form.get('scope') ?? 'read');

  const client = await oauthClientRepository.findById(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return c.text('bad client/redirect', 400);
  }

  const cbUrl = new URL(redirectUri);
  if (action !== 'allow') {
    cbUrl.searchParams.set('error', 'access_denied');
    if (state) cbUrl.searchParams.set('state', state);
    return c.redirect(cbUrl.toString(), 302);
  }

  const created = await oauthCodeRepository.create({
    client_id: clientId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    ...(scope ? { scope } : {}),
  });
  cbUrl.searchParams.set('code', created.code);
  if (state) cbUrl.searchParams.set('state', state);
  return c.redirect(cbUrl.toString(), 302);
});

export default oauthConsentRoutes;
