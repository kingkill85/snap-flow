/**
 * Read width/height from a PNG or JPEG file by parsing only the header bytes.
 *
 * Returns null on any failure (missing file, unsupported format, truncated header).
 * Never throws — callers can treat this as a best-effort enrichment.
 */
export async function readImageDimensions(
  absolutePath: string,
): Promise<{ width: number; height: number } | null> {
  let file: Deno.FsFile;
  try {
    file = await Deno.open(absolutePath, { read: true });
  } catch {
    return null;
  }
  try {
    // 64 KiB — enough to skip past typical EXIF/APP1 payloads in phone-camera JPEGs
    // (up to ~80 KiB), then locate the SOF marker. Floorplans uploaded as photos hit
    // large EXIF blocks; CAD-exported PNGs/JPEGs are well under this.
    const buf = new Uint8Array(65536);
    const n = await file.read(buf) ?? 0;
    if (n < 8) return null;
    const bytes = buf.subarray(0, n);

    if (isPng(bytes)) return parsePngDimensions(bytes);
    if (isJpeg(bytes)) return parseJpegDimensions(bytes);
    return null;
  } catch {
    return null;
  } finally {
    try { file.close(); } catch { /* already closed */ }
  }
}

function isPng(b: Uint8Array): boolean {
  return b.length >= 8
    && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 2 && b[0] === 0xff && b[1] === 0xd8;
}

function parsePngDimensions(b: Uint8Array): { width: number; height: number } | null {
  // After the 8-byte signature, the first chunk is IHDR. Layout:
  //   bytes  8..11 = chunk length (always 13 for IHDR)
  //   bytes 12..15 = "IHDR"
  //   bytes 16..19 = width  (big-endian uint32)
  //   bytes 20..23 = height (big-endian uint32)
  if (b.length < 24) return null;
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function parseJpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  // Walk markers starting after SOI (0xFF 0xD8). Each marker is 0xFF <code>.
  // SOF markers (0xC0..0xCF, except 0xC4 / 0xC8 / 0xCC which are DHT/JPG/DAC) carry dimensions.
  // Segment layout: 0xFF <sof> <len-hi> <len-lo> <precision> <h-hi> <h-lo> <w-hi> <w-lo> ...
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    // Skip padding 0xFF bytes
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return null;
    const marker = b[i];
    i++;
    // Standalone markers with no payload
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue; // RSTn
    if (i + 1 >= b.length) return null;
    const segLen = (b[i] << 8) | b[i + 1];
    if (segLen < 2) return null;

    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 7 >= b.length) return null;
      const height = (b[i + 3] << 8) | b[i + 4];
      const width  = (b[i + 5] << 8) | b[i + 6];
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }
    i += segLen;
  }
  return null;
}
