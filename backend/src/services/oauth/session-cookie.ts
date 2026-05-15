import { env } from '../../config/env.ts';

const TTL_SECONDS = 60 * 60; // 1 hour

async function getKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSessionCookie(userId: number): Promise<string> {
  const payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadStr = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
  return `${payloadStr}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySessionCookie(cookie: string): Promise<number | null> {
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sigStr] = parts;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sigStr).buffer as ArrayBuffer,
      new TextEncoder().encode(payloadStr)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadStr))) as { uid: number; exp: number };
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export const OAUTH_SESSION_COOKIE_NAME = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = TTL_SECONDS;
