/**
 * Encoding utilities
 */

/**
 * Encode a Uint8Array to base64 string
 */
export function encodeBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

/**
 * Decode a base64 string to Uint8Array
 */
export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
