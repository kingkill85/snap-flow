/**
 * Validate file content by checking magic bytes.
 * Returns true if the buffer matches a known format for the given type.
 */
export function validateMagicBytes(buffer: Uint8Array, type: 'image' | 'excel'): boolean {
  if (buffer.length < 4) return false;

  if (type === 'image') {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    // WebP: 52 49 46 46 at 0, 57 45 42 50 at 8
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
    return false;
  }

  if (type === 'excel') {
    // XLSX (ZIP): 50 4B 03 04
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return true;
    }
    // XLS (OLE): D0 CF 11 E0
    if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
      return true;
    }
    return false;
  }

  return false;
}
