function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a PKCE S256 challenge against a verifier per RFC 7636.
 * challenge == base64url(SHA-256(verifier))
 */
export async function verifyS256(verifier: string, challenge: string): Promise<boolean> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const expected = base64UrlEncode(new Uint8Array(hash));
  return expected === challenge;
}
