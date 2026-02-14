import { create, verify, getNumericDate } from 'djwt';
import { env } from '../config/env.ts';

const JWT_SECRET = env.JWT_SECRET;
// Access tokens expire in 15 minutes (900 seconds)
// Short-lived for security, refreshed automatically via refresh token
const ACCESS_TOKEN_EXPIRY = 60 * 15;

export interface JWTPayload {
  sub: string;      // user id
  email: string;    // user email
  role: 'admin' | 'user';
  exp: number;      // expiration time
  iat: number;      // issued at
}

/**
 * Generate a JWT token
 */
export async function generateToken(
  userId: number,
  email: string,
  role: 'admin' | 'user'
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId.toString(),
    email,
    role,
    exp: now + ACCESS_TOKEN_EXPIRY,
    iat: now,
  };

  // Use HS256 algorithm with the secret
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return await create({ alg: 'HS256', typ: 'JWT' }, payload, key);
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return await verify(token, key) as unknown as JWTPayload;
}
