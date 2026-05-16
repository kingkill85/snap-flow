import { assertEquals } from '@std/assert';
import { readImageDimensions } from '../../src/services/mcp/image-dimensions.ts';

// Build a minimal valid PNG: 8-byte signature + IHDR chunk with given width/height.
function makePng(width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  // IHDR length (13)
  const length = [0x00, 0x00, 0x00, 0x0d];
  const type = [0x49, 0x48, 0x44, 0x52]; // "IHDR"
  const w = [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,  width & 0xff,
  ];
  const h = [
    (height >>> 24) & 0xff, (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,  height & 0xff,
  ];
  // bit depth, color type, compression, filter, interlace, then 4-byte CRC (zeros — parser ignores)
  const rest = [0x08, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  return new Uint8Array([...signature, ...length, ...type, ...w, ...h, ...rest]);
}

// Build a tiny JPEG with a single SOF0 marker carrying width/height.
function makeJpeg(width: number, height: number): Uint8Array {
  // SOI
  const soi = [0xff, 0xd8];
  // SOF0 marker: 0xff 0xc0, length (17), precision (8), height, width, components (3), then 9 bytes per component (we'll just zero-fill the rest of the segment)
  const sof0 = [0xff, 0xc0];
  const segLength = [0x00, 0x11]; // 17
  const precision = [0x08];
  const h = [(height >>> 8) & 0xff, height & 0xff];
  const w = [(width >>> 8) & 0xff, width & 0xff];
  const components = [0x03];
  const compData = new Array(9).fill(0); // not parsed
  // EOI
  const eoi = [0xff, 0xd9];
  return new Uint8Array([...soi, ...sof0, ...segLength, ...precision, ...h, ...w, ...components, ...compData, ...eoi]);
}

// Build a JPEG with a synthetic APP1 (EXIF) block of `exifPayloadSize` bytes placed
// before the SOF0 marker. Used to verify the parser handles large EXIF blocks whose
// length exceeds smaller read buffers.
function makeJpegWithExif(width: number, height: number, exifPayloadSize: number): Uint8Array {
  const soi = [0xff, 0xd8];
  // APP1 marker: 0xff 0xe1, 2-byte length, then EXIF payload.
  // segLength includes the 2 length bytes themselves.
  const segLen = exifPayloadSize + 2;
  if (segLen > 0xffff) throw new Error('exif segment too large');
  const app1 = [0xff, 0xe1, (segLen >>> 8) & 0xff, segLen & 0xff, ...new Array(exifPayloadSize).fill(0)];
  // SOF0 as before
  const sof0 = [0xff, 0xc0];
  const sofLen = [0x00, 0x11];
  const precision = [0x08];
  const h = [(height >>> 8) & 0xff, height & 0xff];
  const w = [(width >>> 8) & 0xff, width & 0xff];
  const components = [0x03];
  const compData = new Array(9).fill(0);
  const eoi = [0xff, 0xd9];
  return new Uint8Array([
    ...soi, ...app1, ...sof0, ...sofLen, ...precision, ...h, ...w, ...components, ...compData, ...eoi,
  ]);
}

async function writeTemp(bytes: Uint8Array, suffix: string): Promise<string> {
  const path = await Deno.makeTempFile({ suffix });
  await Deno.writeFile(path, bytes);
  return path;
}

Deno.test('readImageDimensions', async (t) => {
  await t.step('parses PNG width/height from IHDR', async () => {
    const path = await writeTemp(makePng(1920, 1080), '.png');
    try {
      const dims = await readImageDimensions(path);
      assertEquals(dims, { width: 1920, height: 1080 });
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });

  await t.step('parses JPEG width/height from SOF0', async () => {
    const path = await writeTemp(makeJpeg(640, 480), '.jpg');
    try {
      const dims = await readImageDimensions(path);
      assertEquals(dims, { width: 640, height: 480 });
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });

  await t.step('parses JPEG width/height when SOF is past a large APP1/EXIF block', async () => {
    // 16 KiB EXIF payload — past the old 4 KiB buffer, comfortably inside the new 64 KiB one.
    const path = await writeTemp(makeJpegWithExif(800, 600, 16 * 1024), '.jpg');
    try {
      const dims = await readImageDimensions(path);
      assertEquals(dims, { width: 800, height: 600 });
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });

  await t.step('returns null for unrecognized format', async () => {
    const path = await writeTemp(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '.bin');
    try {
      assertEquals(await readImageDimensions(path), null);
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });

  await t.step('returns null for missing file', async () => {
    const result = await readImageDimensions('/tmp/snapflow-does-not-exist-xyz.png');
    assertEquals(result, null);
  });

  await t.step('returns null for truncated PNG', async () => {
    // 8-byte signature only, no IHDR
    const path = await writeTemp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '.png');
    try {
      assertEquals(await readImageDimensions(path), null);
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });
});
