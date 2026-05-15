import type { Context } from 'hono';

/**
 * Returns the public base URL (scheme + host) for the current request.
 *
 * Honors X-Forwarded-Proto and X-Forwarded-Host when present (set by typical
 * reverse proxies like nginx, Caddy, Cloudflare, Traefik). This ensures
 * OAuth/MCP metadata advertises the correct HTTPS URL Claude.ai can reach,
 * not the internal http://app:8000 the proxy sees.
 *
 * If PUBLIC_BASE_URL env var is set, prefer it over derivation.
 */
export function publicBaseUrl(c: Context): string {
  const envBase = Deno.env.get('PUBLIC_BASE_URL');
  if (envBase) return envBase.replace(/\/$/, '');

  const xfProto = c.req.header('x-forwarded-proto');
  const xfHost = c.req.header('x-forwarded-host') ?? c.req.header('host');
  if (xfProto && xfHost) {
    return `${xfProto.split(',')[0].trim()}://${xfHost.split(',')[0].trim()}`;
  }

  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}
