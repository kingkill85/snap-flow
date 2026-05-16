# MCP Image Tools — Honest Rendering & Spatial Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SnapFlow's MCP image tools honest about what the user actually sees, let the model fetch catalog product pictures (not only placed BOM entries), and give it enough spatial data — canvas size, per-placement coordinates, and area boxes — to mentally reconstruct a floorplan layout.

**Architecture:** Three changes, all confined to `backend/src/services/mcp/`. The image tools keep returning inline base64 (auth-correct path), but their descriptions/text blocks stop encouraging the model to claim rendering happened. `get_item_picture` gains a discriminated input so it works against BOM, catalog variant, or catalog item. `get_floorplan_bom` gains spatial enrichment: canvas dimensions read from PNG/JPEG headers via a small new helper, per-placement coordinates fetched from the existing placements endpoint, and area bounding boxes drawn from the areas already fetched today. All enrichments are best-effort — failures degrade gracefully, never break the tool.

**Tech Stack:** Deno + Hono backend, Zod input schemas, in-memory SQLite tests via `setupTestDatabase()` / `clearDatabase()`. No new HTTP routes, no DB migrations.

**Spec:** `docs/superpowers/specs/2026-05-16-mcp-image-tools-honest-and-spatial-design.md`

---

## File Structure

**Create:**
- `backend/src/services/mcp/image-dimensions.ts` — PNG/JPEG header parser. Single exported function `readImageDimensions(absolutePath): Promise<{width: number; height: number} | null>`. ~50 lines.

**Modify:**
- `backend/src/services/mcp/tools/get-floorplan-image.ts` — rewrite description + text content (Change 1 only).
- `backend/src/services/mcp/tools/get-item-picture.ts` — rewrite description, change Zod input schema to discriminated union, add variant_id + item_id resolution branches (Changes 1 + 2).
- `backend/src/services/mcp/tools/get-floorplan-bom.ts` — fetch placements, enrich groups with per-placement coords, canvas, areas, area_box (Change 3).
- `backend/tests/mcp/tools_test.ts` — add new test steps for every behavior change.

**No other files are touched.** No new HTTP routes. No DB migrations. No frontend changes.

---

### Task 1: Honest descriptions on both image tools

**Files:**
- Modify: `backend/src/services/mcp/tools/get-floorplan-image.ts` (lines 23-67)
- Modify: `backend/src/services/mcp/tools/get-item-picture.ts` (lines 23-67) — description and trailing text only; input schema is changed in Task 3
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 1.1: Add the imports the new tests will need**

At the top of `backend/tests/mcp/tools_test.ts`, after the existing imports on line 21, add:

```ts
import { getFloorplanImageTool } from '../../src/services/mcp/tools/get-floorplan-image.ts';
```

(`getItemPictureTool` is already imported on line 21. `getFloorplanImageTool` is not yet imported — this adds it.)

- [ ] **Step 1.2: Write failing tests for the new description wording**

Append to `backend/tests/mcp/tools_test.ts` (after the last existing `Deno.test`):

```ts
Deno.test('image tools describe themselves honestly', async (t) => {
  await t.step('get_floorplan_image description warns the user cannot see it', () => {
    const d = getFloorplanImageTool.description.toLowerCase();
    assert(d.includes('user') && d.includes('not'),
      `expected get_floorplan_image description to warn user cannot see image, got: ${getFloorplanImageTool.description}`);
    assert(d.includes('describe'),
      `expected get_floorplan_image description to instruct the model to describe contents`);
  });

  await t.step('get_item_picture description warns the user cannot see it', () => {
    const d = getItemPictureTool.description.toLowerCase();
    assert(d.includes('user') && d.includes('not'),
      `expected get_item_picture description to warn user cannot see image, got: ${getItemPictureTool.description}`);
    assert(d.includes('describe'),
      `expected get_item_picture description to instruct the model to describe contents`);
  });
});
```

- [ ] **Step 1.3: Run tests to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "image tools describe themselves honestly"
```

Expected: Two failing assertions (both old descriptions lack the new wording).

- [ ] **Step 1.4: Rewrite `get_floorplan_image` description and text content**

In `backend/src/services/mcp/tools/get-floorplan-image.ts`, replace lines 23-26 (the `description` field):

```ts
export const getFloorplanImageTool = {
  name: 'get_floorplan_image',
  description:
    "Load a floorplan's background image into your visual context for analysis. The image bytes go to Claude's vision so you can describe the layout, identify rooms, estimate scale, and reason about placements. The Claude Desktop UI does NOT render this image back to the user — never say 'here is the floorplan' or 'as you can see'. Instead, describe what you observe.",
  inputSchema,
```

In the same file, replace the success-path text content (line 56 today) so the trailing text reinforces the framing:

```ts
      return {
        content: [
          { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(imagePath) },
          { type: 'text', text: `Image of floorplan "${fp?.name ?? 'unnamed'}" (#${args.floorplan_id}) loaded for your analysis only. The user cannot see it — describe its contents in your reply.` },
        ],
      };
```

- [ ] **Step 1.5: Rewrite `get_item_picture` description and text content**

In `backend/src/services/mcp/tools/get-item-picture.ts`, replace lines 23-26 (the `description` field). The input schema and resolution change in Task 3 — for now only update the wording around the existing `bom_id` flow:

```ts
export const getItemPictureTool = {
  name: 'get_item_picture',
  description:
    "Load a product picture into your visual context for analysis. The image bytes go to Claude's vision so you can describe the item's appearance. The Claude Desktop UI does NOT render this image back to the user — describe what you see rather than claiming the picture was shown. Today accepts `bom_id` (a placed BOM entry); other input modes are added in a later change.",
  inputSchema,
```

Replace the success-path text content (line 56 today):

```ts
      return {
        content: [
          { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(picturePath) },
          { type: 'text', text: `Image of "${entry?.item_name ?? 'unknown'}" (BOM #${args.bom_id}) loaded for your analysis only. The user cannot see it — describe its contents in your reply.` },
        ],
      };
```

(The description sentence about "other input modes" gets rewritten properly in Task 3 once the schema actually supports them.)

- [ ] **Step 1.6: Run tests to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "image tools describe themselves honestly"
```

Expected: Both steps pass.

- [ ] **Step 1.7: Run full MCP test suite to confirm no regressions**

```bash
cd backend && deno test --allow-all tests/mcp/
```

Expected: All tests pass. The existing `get_item_picture tool` test at line 382 still validates the bom_id success path — its assertions check `result.content.find(b => b.type === 'image')`, which is unaffected by the text-block change.

- [ ] **Step 1.8: Commit**

```bash
git add backend/src/services/mcp/tools/get-floorplan-image.ts \
        backend/src/services/mcp/tools/get-item-picture.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): honest descriptions on image tools so the LM stops claiming it showed them"
```

---

### Task 2: Image-dimension helper (PNG + JPEG)

**Files:**
- Create: `backend/src/services/mcp/image-dimensions.ts`
- Test: `backend/tests/mcp/image_dimensions_test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `backend/tests/mcp/image_dimensions_test.ts`:

```ts
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
```

- [ ] **Step 2.2: Run tests to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/image_dimensions_test.ts
```

Expected: All steps fail with `Module not found: ../../src/services/mcp/image-dimensions.ts`.

- [ ] **Step 2.3: Implement the helper**

Create `backend/src/services/mcp/image-dimensions.ts`:

```ts
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
    // Read up to 4 KiB — enough for the IHDR chunk in PNG and most SOF markers in JPEG.
    const buf = new Uint8Array(4096);
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
```

- [ ] **Step 2.4: Run tests to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/image_dimensions_test.ts
```

Expected: All five steps pass.

- [ ] **Step 2.5: Commit**

```bash
git add backend/src/services/mcp/image-dimensions.ts \
        backend/tests/mcp/image_dimensions_test.ts
git commit -m "feat(mcp): add PNG/JPEG image-dimension helper for floorplan canvas enrichment"
```

---

### Task 3: `get_item_picture` discriminated input — variant_id branch

**Files:**
- Modify: `backend/src/services/mcp/tools/get-item-picture.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 3.1: Add imports for the new test**

In `backend/tests/mcp/tools_test.ts`, after the existing imports (around line 22), add:

```ts
import { itemVariantRepository } from '../../src/repositories/item-variant.ts';
```

- [ ] **Step 3.2: Write failing tests for variant_id and schema validation**

Append to `backend/tests/mcp/tools_test.ts`:

```ts
Deno.test('get_item_picture accepts variant_id from catalog', async (t) => {
  await setupTestDatabase();

  await t.step('returns image content for a variant with image_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'var@example.com', password_hash: 'x', role: 'user',
      full_name: 'V', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });

    // Seed a category + item_type to satisfy items FK, then an item + variant with image.
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'CatalogLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    const subdir = `variants`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/var.png`;
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    await Deno.writeFile(fileStorageService.getFilePath(relPath), fakeBytes);

    const variant = await itemVariantRepository.create({
      item_id: item.id, style_name: 'Black', price: 100, image_path: relPath, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getItemPictureTool.handler({ variant_id: variant.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const img = result.content.find(b => b.type === 'image');
      assertEquals(img?.type, 'image');
      assertEquals(img?.mimeType, 'image/png');
      assert((img?.data?.length ?? 0) > 0);
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('returns isError for variant with no image_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'var2@example.com', password_hash: 'x', role: 'user',
      full_name: 'V', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'NoImageLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);
    const variant = await itemVariantRepository.create({
      item_id: item.id, style_name: 'Black', price: 100, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ variant_id: variant.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_item_picture input validation', async (t) => {
  await setupTestDatabase();

  await t.step('rejects calls with zero IDs', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'v0@example.com', password_hash: 'x', role: 'user',
      full_name: 'X', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    // @ts-expect-error — exercising runtime validation
    const result = await getItemPictureTool.handler({}, { app, accessToken: token });
    assertEquals(result.isError, true);
    assert((result.content[0]!.text ?? '').toLowerCase().includes('exactly one'));
  });

  await t.step('rejects calls with two IDs', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'v2@example.com', password_hash: 'x', role: 'user',
      full_name: 'X', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler(
      { bom_id: 1, variant_id: 2 } as never,
      { app, accessToken: token },
    );
    assertEquals(result.isError, true);
    assert((result.content[0]!.text ?? '').toLowerCase().includes('exactly one'));
  });
});
```

- [ ] **Step 3.3: Run tests to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_item_picture accepts variant_id from catalog"
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_item_picture input validation"
```

Expected: All steps fail — `variant_id` is not yet in the schema and the validation message does not yet exist.

- [ ] **Step 3.4: Rewrite `get_item_picture` tool with discriminated input and variant_id branch**

Replace the full contents of `backend/src/services/mcp/tools/get-item-picture.ts`:

```ts
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import { fileStorageService } from '../../file-storage.ts';
import { encodeBase64 } from '@std/encoding/base64';
import { itemVariantRepository } from '../../../repositories/item-variant.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  bom_id: z.number().int().positive().optional(),
  variant_id: z.number().int().positive().optional(),
  item_id: z.number().int().positive().optional(),
});

function mimeTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

interface ResolvedPicture {
  relPath: string;
  label: string;     // human-readable subject, used in the text content block
  subjectTag: string; // e.g. "BOM #5", "Variant #2", "Item #7"
}

async function loadAndReturn(resolved: ResolvedPicture): Promise<ToolResult> {
  try {
    const bytes = await Deno.readFile(fileStorageService.getFilePath(resolved.relPath));
    return {
      content: [
        { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(resolved.relPath) },
        { type: 'text', text: `Image of "${resolved.label}" (${resolved.subjectTag}) loaded for your analysis only. The user cannot see it — describe its contents in your reply.` },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to read picture file (${resolved.relPath}): ${msg}` }],
    };
  }
}

async function resolveBom(args: { bom_id: number }, ctx: ToolContext): Promise<ResolvedPicture | ToolResult> {
  const meta = await dispatchToBackend(ctx.app, {
    method: 'GET',
    path: `/api/bom-entries/${args.bom_id}`,
    accessToken: ctx.accessToken,
  });
  if (!meta.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to load BOM entry ${args.bom_id} (HTTP ${meta.status}): ${JSON.stringify(meta.body)}` }],
    };
  }
  const entry = meta.body?.data as { picture_path?: string | null; item_name?: string } | undefined;
  if (!entry?.picture_path) {
    return {
      isError: true,
      content: [{ type: 'text', text: `BOM entry ${args.bom_id} has no picture_path` }],
    };
  }
  return {
    relPath: entry.picture_path,
    label: entry.item_name ?? 'unknown',
    subjectTag: `BOM #${args.bom_id}`,
  };
}

async function resolveVariant(variantId: number): Promise<ResolvedPicture | ToolResult> {
  const variant = await itemVariantRepository.findById(variantId);
  if (!variant) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Variant ${variantId} not found` }],
    };
  }
  if (!variant.image_path) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Variant ${variantId} has no image_path` }],
    };
  }
  return {
    relPath: variant.image_path,
    label: variant.style_name,
    subjectTag: `Variant #${variantId}`,
  };
}

export const getItemPictureTool = {
  name: 'get_item_picture',
  description:
    "Load a product picture into your visual context for analysis. The image bytes go to Claude's vision so you can describe the item's appearance. The Claude Desktop UI does NOT render this image back to the user — describe what you see rather than claiming the picture was shown. Pass exactly one of: `bom_id` (a placed BOM entry), `variant_id` (a catalog variant/style), or `item_id` (a catalog product; uses the first active variant's image).",
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const provided = [args.bom_id, args.variant_id, args.item_id].filter(v => v !== undefined);
    if (provided.length !== 1) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Pass exactly one of bom_id, variant_id, or item_id' }],
      };
    }

    let resolved: ResolvedPicture | ToolResult;
    if (args.bom_id !== undefined) {
      resolved = await resolveBom({ bom_id: args.bom_id }, ctx);
    } else if (args.variant_id !== undefined) {
      resolved = await resolveVariant(args.variant_id);
    } else {
      // item_id branch is implemented in Task 4
      return {
        isError: true,
        content: [{ type: 'text', text: 'item_id input is not yet supported' }],
      };
    }

    if ('isError' in resolved) return resolved;
    return loadAndReturn(resolved);
  },
};
```

- [ ] **Step 3.5: Run tests to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_item_picture"
```

Expected: All `get_item_picture` test groups pass — original BOM test from line 382, the new `variant_id` test group, and the input validation group. (`item_id` branch is exercised in Task 4.)

- [ ] **Step 3.6: Commit**

```bash
git add backend/src/services/mcp/tools/get-item-picture.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): get_item_picture accepts variant_id with discriminated input"
```

---

### Task 4: `get_item_picture` item_id branch

**Files:**
- Modify: `backend/src/services/mcp/tools/get-item-picture.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 4.1: Write failing tests for item_id**

Append to `backend/tests/mcp/tools_test.ts`:

```ts
Deno.test('get_item_picture accepts item_id from catalog', async (t) => {
  await setupTestDatabase();

  await t.step('falls back to first active variant with an image', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'MultiVariantLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    // Variant A: sort_order 0, NO image. Variant B: sort_order 1, with image.
    // Expected fallback: variant B (first active variant *with* an image).
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'NoImg', price: 100, sort_order: 0, is_active: true,
    } as never);
    const subdir = `variants`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/item-fallback.png`;
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);
    await Deno.writeFile(fileStorageService.getFilePath(relPath), fakeBytes);
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'WithImg', price: 110, image_path: relPath, sort_order: 1, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const img = result.content.find(b => b.type === 'image');
      assertEquals(img?.mimeType, 'image/png');
      assert((img?.data?.length ?? 0) > 0);
      const text = result.content.find(b => b.type === 'text')?.text ?? '';
      assert(text.toLowerCase().includes('item'));
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('returns isError when no active variant has an image', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item2@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'NoImagesLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'A', price: 100, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });

  await t.step('returns isError when item has no variants at all', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item3@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'Empty', description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});
```

- [ ] **Step 4.2: Run tests to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_item_picture accepts item_id from catalog"
```

Expected: All three steps fail — first step's `result.isError` is `true` (the Task 3 placeholder returns "not yet supported"); the other two trivially get `true` for the wrong reason. Confirming with the assertion messages is fine; this test will be valid once Step 4.3 lands.

- [ ] **Step 4.3: Implement item_id resolution**

In `backend/src/services/mcp/tools/get-item-picture.ts`, add a new `resolveItem` function after `resolveVariant`, and replace the `else` branch in the handler:

Add this function (place it just after `resolveVariant`):

```ts
async function resolveItem(itemId: number): Promise<ResolvedPicture | ToolResult> {
  const variants = await itemVariantRepository.findByItemId(itemId);
  // findByItemId returns active variants ordered by sort_order ASC, id ASC.
  const withImage = variants.find(v => v.is_active && v.image_path);
  if (!withImage || !withImage.image_path) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Item ${itemId} has no active variant with an image` }],
    };
  }
  return {
    relPath: withImage.image_path,
    label: `Item ${itemId} / ${withImage.style_name}`,
    subjectTag: `Item #${itemId}`,
  };
}
```

Replace the `else` branch in the handler with:

```ts
    } else {
      resolved = await resolveItem(args.item_id!);
    }
```

(The non-null assertion is safe: we already validated `provided.length === 1`, so if `bom_id` and `variant_id` are both undefined, `item_id` must be set.)

- [ ] **Step 4.4: Confirm `findByItemId` ordering matches the spec**

Open `backend/src/repositories/item-variant.ts:25-50` and verify that `findByItemId` returns rows ordered by `sort_order ASC, id ASC`. If the ordering already matches, no change needed. If not, fix the ORDER BY clause to `ORDER BY sort_order ASC, id ASC` so the fallback selects the same "first active variant" the existing `preview_image` SQL picks (see `item.ts:85-88`).

(Read-only check during implementation; do not change unrelated repository behavior.)

- [ ] **Step 4.5: Run tests to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_item_picture"
```

Expected: All `get_item_picture` test groups pass (BOM, variant_id, validation, item_id).

- [ ] **Step 4.6: Commit**

```bash
git add backend/src/services/mcp/tools/get-item-picture.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): get_item_picture supports item_id (falls back to first active variant)"
```

---

### Task 5: `get_floorplan_bom` per-placement coordinates

**Files:**
- Modify: `backend/src/services/mcp/tools/get-floorplan-bom.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 5.1: Write failing test**

Append to `backend/tests/mcp/tools_test.ts`:

```ts
Deno.test('get_floorplan_bom — placement coordinates enrichment', async (t) => {
  await setupTestDatabase();

  await t.step('attaches per-placement coords to each BOM entry', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'coord@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Coord Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main', image_path: 'test.png',
    } as CreateFloorplanDTO);

    const db = getDb();
    const bomId = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL)
      RETURNING id
    `, [project.id, floorplan.id, 'CoordLamp', 0])[0]!.id;

    // Two placements pointing at the same BOM entry (quantity 2)
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
              VALUES (?, ?, 'item', 340, 220, 64, 64, 0)`, [bomId, floorplan.id]);
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
              VALUES (?, ?, 'item', 120, 50, 64, 64, 90)`, [bomId, floorplan.id]);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);
    const main = payload.groups?.[0]?.mainEntry;
    assert(Array.isArray(main?.placements), 'expected mainEntry.placements array');
    assertEquals(main.placements.length, 2);
    const first = main.placements.find((p: { x: number }) => p.x === 340);
    assertEquals(first.y, 220);
    assertEquals(first.width, 64);
    assertEquals(first.height, 64);
    assertEquals(first.rotation, 0);
    const second = main.placements.find((p: { x: number }) => p.x === 120);
    assertEquals(second.rotation, 90);
  });
});
```

- [ ] **Step 5.2: Run test to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "placement coordinates enrichment"
```

Expected: Fails because `mainEntry.placements` does not exist yet.

- [ ] **Step 5.3: Add placement fetch + decoration in `get-floorplan-bom.ts`**

In `backend/src/services/mcp/tools/get-floorplan-bom.ts`, expand the parallel dispatch (currently three calls on lines 46-63) to four and decorate BOM entries with placements.

Replace the `BomEntry` interface (lines 14-18) with:

```ts
interface PlacementInfo {
  placement_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  area_id: number | null;
  area_name?: string;
}

interface BomEntry {
  id?: number;
  area_id?: number | null;
  area_name?: string;
  placements?: PlacementInfo[];
  [key: string]: unknown;
}
```

Replace `decorateEntry` (lines 33-38) with:

```ts
function decorateEntry(
  entry: BomEntry,
  areasById: Map<number, string>,
  placementsByBomId: Map<number, PlacementInfo[]>,
): void {
  if (entry.area_id != null) {
    const name = areasById.get(entry.area_id);
    if (name) entry.area_name = name;
  }
  if (typeof entry.id === 'number') {
    const placements = placementsByBomId.get(entry.id);
    if (placements && placements.length > 0) entry.placements = placements;
  }
}
```

In the handler (replacing the parallel dispatch block on lines 46-63), add a fourth call:

```ts
    const [bomResult, areasResult, floorplanResult, placementsResult] = await Promise.all([
      dispatchToBackend(ctx.app, {
        method: 'GET',
        path: `/api/floorplans/${args.floorplan_id}/bom`,
        accessToken: ctx.accessToken,
      }),
      dispatchToBackend(ctx.app, {
        method: 'GET',
        path: '/api/areas',
        query: { floorplan_id: args.floorplan_id },
        accessToken: ctx.accessToken,
      }),
      dispatchToBackend(ctx.app, {
        method: 'GET',
        path: `/api/floorplans/${args.floorplan_id}`,
        accessToken: ctx.accessToken,
      }),
      dispatchToBackend(ctx.app, {
        method: 'GET',
        path: '/api/placements',
        query: { floorplan_id: args.floorplan_id },
        accessToken: ctx.accessToken,
      }),
    ]);
```

After the `areasById` map is built (currently lines 72-79), build the placements map:

```ts
    const placementsByBomId = new Map<number, PlacementInfo[]>();
    if (placementsResult.ok && Array.isArray(placementsResult.body?.data)) {
      for (const p of placementsResult.body.data as Array<{
        id: number; bom_id: number | null; x: number; y: number;
        width: number; height: number; rotation: number; area_id: number | null;
      }>) {
        if (p.bom_id == null) continue;
        const list = placementsByBomId.get(p.bom_id) ?? [];
        list.push({
          placement_id: p.id,
          x: p.x, y: p.y, width: p.width, height: p.height,
          rotation: p.rotation, area_id: p.area_id,
          area_name: p.area_id != null ? areasById.get(p.area_id) : undefined,
        });
        placementsByBomId.set(p.bom_id, list);
      }
    }
```

Update the existing decoration loop (lines 96-103) to pass the new map:

```ts
    if (Array.isArray(payload?.groups)) {
      for (const group of payload.groups) {
        if (group.mainEntry) decorateEntry(group.mainEntry, areasById, placementsByBomId);
        if (Array.isArray(group.children)) {
          for (const child of group.children) decorateEntry(child, areasById, placementsByBomId);
        }
      }
    }
```

(Note: removed the `areasById.size > 0` short-circuit so decoration runs even if areas are empty — placements still need to be attached.)

- [ ] **Step 5.4: Run test to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "placement coordinates enrichment"
```

Expected: Pass.

- [ ] **Step 5.5: Run full BOM-related tests to confirm no regression**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_floorplan_bom"
```

Expected: All `get_floorplan_bom` tests pass — original `tool`, original `enrichment`, and the new placement-coordinates step.

- [ ] **Step 5.6: Commit**

```bash
git add backend/src/services/mcp/tools/get-floorplan-bom.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): enrich get_floorplan_bom with per-placement coordinates"
```

---

### Task 6: `get_floorplan_bom` canvas dimensions

**Files:**
- Modify: `backend/src/services/mcp/tools/get-floorplan-bom.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 6.1: Write failing tests for canvas (happy path + graceful degradation)**

Append to `backend/tests/mcp/tools_test.ts`:

```ts
Deno.test('get_floorplan_bom — canvas dimensions', async (t) => {
  await setupTestDatabase();

  // Reuse the PNG builder from image_dimensions_test via copy — keep the test file self-contained.
  function makePng(width: number, height: number): Uint8Array {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const length = [0x00, 0x00, 0x00, 0x0d];
    const type = [0x49, 0x48, 0x44, 0x52];
    const w = [(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff];
    const h = [(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff];
    const rest = [0x08, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    return new Uint8Array([...signature, ...length, ...type, ...w, ...h, ...rest]);
  }

  await t.step('includes canvas.width/height when the image file is parseable', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'canvas@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Canvas Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);

    const subdir = `projects/${project.id}/floorplans`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/canvas.png`;
    await Deno.writeFile(fileStorageService.getFilePath(relPath), makePng(1920, 1080));

    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Canvas', image_path: relPath,
    } as CreateFloorplanDTO);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const payload = JSON.parse(result.content[0]!.text!);
      assertEquals(payload.canvas?.image_path, relPath);
      assertEquals(payload.canvas?.width, 1920);
      assertEquals(payload.canvas?.height, 1080);
      assert(typeof payload.canvas?.coordinate_system === 'string');
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('omits canvas width/height gracefully when file is missing', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'canvas2@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'NoCanvas Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'NoFile', image_path: 'does-not-exist.png',
    } as CreateFloorplanDTO);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);
    assertEquals(payload.canvas?.image_path, 'does-not-exist.png');
    assertEquals(payload.canvas?.width, undefined);
    assertEquals(payload.canvas?.height, undefined);
    assert(typeof payload.canvas?.coordinate_system === 'string');
  });
});
```

- [ ] **Step 6.2: Run tests to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "canvas dimensions"
```

Expected: Fails — `payload.canvas` is `undefined`.

- [ ] **Step 6.3: Add canvas enrichment in `get-floorplan-bom.ts`**

At the top of `backend/src/services/mcp/tools/get-floorplan-bom.ts`, add imports:

```ts
import { fileStorageService } from '../../file-storage.ts';
import { readImageDimensions } from '../image-dimensions.ts';
```

Extend `FloorplanBomPayload` (currently lines 26-31) with `canvas`:

```ts
interface FloorplanBomPayload {
  groups?: BomGroup[];
  floorplan_name?: string;
  version_name?: string;
  canvas?: {
    image_path?: string;
    width?: number;
    height?: number;
    coordinate_system: string;
  };
  [key: string]: unknown;
}
```

In the handler, after the floorplan response is parsed (currently around line 81 where `fp` is read), enrich the payload with canvas data. Add after the existing `if (fp?.name) payload.floorplan_name = fp.name;` line:

```ts
    if (fp?.image_path) {
      const canvas: NonNullable<FloorplanBomPayload['canvas']> = {
        image_path: fp.image_path,
        coordinate_system: 'image-pixel, origin top-left of canvas, rotation in degrees clockwise',
      };
      try {
        const absPath = fileStorageService.getFilePath(fp.image_path);
        const dims = await readImageDimensions(absPath);
        if (dims) {
          canvas.width = dims.width;
          canvas.height = dims.height;
        }
      } catch {
        // Best-effort enrichment — leave width/height undefined.
      }
      payload.canvas = canvas;
    }
```

Also update the local `fp` type narrowing (currently `{ name?: string; project_id?: number }` on line 81) to include `image_path`:

```ts
    const fp = floorplanResult.ok ? (floorplanResult.body?.data as { name?: string; project_id?: number; image_path?: string } | undefined) : undefined;
```

- [ ] **Step 6.4: Run tests to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "canvas dimensions"
```

Expected: Both steps pass.

- [ ] **Step 6.5: Run full BOM tests**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_floorplan_bom"
```

Expected: All `get_floorplan_bom` groups pass.

- [ ] **Step 6.6: Commit**

```bash
git add backend/src/services/mcp/tools/get-floorplan-bom.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): include floorplan canvas dimensions in get_floorplan_bom"
```

---

### Task 7: `get_floorplan_bom` areas summary + per-placement area_box

**Files:**
- Modify: `backend/src/services/mcp/tools/get-floorplan-bom.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 7.1: Write failing test**

Append to `backend/tests/mcp/tools_test.ts`:

```ts
Deno.test('get_floorplan_bom — areas summary and area_box on placements', async (t) => {
  await setupTestDatabase();

  await t.step('exposes areas[] at top level and area_box on each placement', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'area@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Area Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'WithAreas', image_path: 'na.png',
    } as CreateFloorplanDTO);

    const area = await areaRepository.create({
      floorplan_id: floorplan.id, x: 0, y: 0, width: 500, height: 300, name: 'Wohnzimmer',
    } as CreateAreaDTO);
    // A second area with no placements — must still appear in the areas summary.
    await areaRepository.create({
      floorplan_id: floorplan.id, x: 500, y: 0, width: 400, height: 300, name: 'Küche',
    } as CreateAreaDTO);

    const db = getDb();
    const bomId = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path, area_id
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL, ?)
      RETURNING id
    `, [project.id, floorplan.id, 'AreaLamp', 0, area.id])[0]!.id;
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, area_id, x, y, width, height, rotation)
              VALUES (?, ?, 'item', ?, 30, 30, 10, 10, 0)`, [bomId, floorplan.id, area.id]);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);

    // Top-level areas summary
    assert(Array.isArray(payload.areas), 'expected top-level areas array');
    assertEquals(payload.areas.length, 2);
    const wohn = payload.areas.find((a: { name: string }) => a.name === 'Wohnzimmer');
    assertEquals(wohn.x, 0);
    assertEquals(wohn.y, 0);
    assertEquals(wohn.width, 500);
    assertEquals(wohn.height, 300);

    // Per-placement area_box
    const placement = payload.groups[0].mainEntry.placements[0];
    assertEquals(placement.area_name, 'Wohnzimmer');
    assertEquals(placement.area_box.x, 0);
    assertEquals(placement.area_box.width, 500);
    assertEquals(placement.area_box.height, 300);
  });
});
```

- [ ] **Step 7.2: Run test to verify failure**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "areas summary and area_box on placements"
```

Expected: Fails — neither `payload.areas` nor `placement.area_box` exists.

- [ ] **Step 7.3: Add areas summary and area_box enrichment**

In `backend/src/services/mcp/tools/get-floorplan-bom.ts`, extend the area-related types.

Replace the `AreaSummary` interface (currently lines 9-12) with:

```ts
interface AreaBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface AreaSummary {
  id: number;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
```

Extend `PlacementInfo` (added in Task 5) with `area_box`:

```ts
interface PlacementInfo {
  placement_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  area_id: number | null;
  area_name?: string;
  area_box?: AreaBox;
}
```

Extend `FloorplanBomPayload` with `areas`:

```ts
interface FloorplanBomPayload {
  groups?: BomGroup[];
  floorplan_name?: string;
  version_name?: string;
  canvas?: {
    image_path?: string;
    width?: number;
    height?: number;
    coordinate_system: string;
  };
  areas?: Array<{ id: number; name: string; x?: number; y?: number; width?: number; height?: number }>;
  [key: string]: unknown;
}
```

In the handler, after the existing `areasById` map is built, also build an `areaBoxesById` map and emit the top-level `areas` summary. Replace the existing block (currently lines 72-79):

```ts
    const areasById = new Map<number, string>();
    const areaBoxesById = new Map<number, AreaBox>();
    const areasSummary: Array<{ id: number; name: string; x?: number; y?: number; width?: number; height?: number }> = [];
    if (areasResult.ok && Array.isArray(areasResult.body?.data)) {
      for (const area of areasResult.body.data as AreaSummary[]) {
        if (typeof area?.id !== 'number' || typeof area?.name !== 'string') continue;
        areasById.set(area.id, area.name);
        const summary: { id: number; name: string; x?: number; y?: number; width?: number; height?: number } = {
          id: area.id, name: area.name,
        };
        if (typeof area.x === 'number' && typeof area.y === 'number'
            && typeof area.width === 'number' && typeof area.height === 'number') {
          summary.x = area.x;
          summary.y = area.y;
          summary.width = area.width;
          summary.height = area.height;
          areaBoxesById.set(area.id, { x: area.x, y: area.y, width: area.width, height: area.height });
        }
        areasSummary.push(summary);
      }
    }
```

Update the placements decoration loop (added in Task 5) to attach `area_box`:

```ts
    const placementsByBomId = new Map<number, PlacementInfo[]>();
    if (placementsResult.ok && Array.isArray(placementsResult.body?.data)) {
      for (const p of placementsResult.body.data as Array<{
        id: number; bom_id: number | null; x: number; y: number;
        width: number; height: number; rotation: number; area_id: number | null;
      }>) {
        if (p.bom_id == null) continue;
        const list = placementsByBomId.get(p.bom_id) ?? [];
        list.push({
          placement_id: p.id,
          x: p.x, y: p.y, width: p.width, height: p.height,
          rotation: p.rotation, area_id: p.area_id,
          area_name: p.area_id != null ? areasById.get(p.area_id) : undefined,
          area_box: p.area_id != null ? areaBoxesById.get(p.area_id) : undefined,
        });
        placementsByBomId.set(p.bom_id, list);
      }
    }
```

After the existing `if (fp?.name) payload.floorplan_name = fp.name;` line (and after the `canvas` enrichment from Task 6), emit the areas summary:

```ts
    if (areasSummary.length > 0) {
      payload.areas = areasSummary;
    }
```

- [ ] **Step 7.4: Run test to verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "areas summary and area_box on placements"
```

Expected: Pass.

- [ ] **Step 7.5: Run all `get_floorplan_bom` tests**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts --filter "get_floorplan_bom"
```

Expected: Every `get_floorplan_bom` group passes — original tool, original enrichment, placement coords, canvas, areas+area_box.

- [ ] **Step 7.6: Commit**

```bash
git add backend/src/services/mcp/tools/get-floorplan-bom.ts \
        backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): expose floorplan areas + per-placement area_box in get_floorplan_bom"
```

---

### Task 8: Final lint + full-suite sweep

**Files:** none directly; just running checks.

- [ ] **Step 8.1: Lint backend**

```bash
cd backend && deno lint
```

Expected: 0 problems. If a warning fires on something this branch introduced, fix it before continuing — do not silence with comments.

- [ ] **Step 8.2: Run full backend test suite**

```bash
cd backend && deno task test
```

Expected: All tests pass. If a test outside `tests/mcp/` fails, investigate — none of the changes in this plan touch routes/repositories used by other tests, so any failure here is a regression worth tracing before merge.

- [ ] **Step 8.3: If any fix was needed, commit it**

```bash
git add -p
git commit -m "fix(mcp): <describe the regression you actually found>"
```

(Skip this step if Step 8.1 and Step 8.2 both passed cleanly.)

- [ ] **Step 8.4: Verify the branch is in a pushable state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean; commit history is one commit per Task 1–7 (plus optional Step 8.3 fix). Branch `feature/mcp-image-tools-honest` is ready for review or PR.

---

## Self-Review Summary

- **Spec coverage:** Change 1 → Task 1. Change 2 (variant_id) → Task 3. Change 2 (item_id) → Task 4. Change 3a (placement coords) → Task 5. Change 3b (canvas) → Tasks 2 + 6. Change 3c (areas + area_box) → Task 7. Test coverage matches the spec's "Testing" section item by item.
- **Type consistency:** `PlacementInfo` introduced in Task 5 and extended (with `area_box`) in Task 7 — extension is additive, no rename. `AreaSummary` extended in Task 7 from `{id, name}` to optionally include the bounding box — backward-compatible. `FloorplanBomPayload` extended in Tasks 6 + 7 only by adding optional fields. `ResolvedPicture` introduced in Task 3 and reused unchanged in Task 4.
- **No placeholders:** every code step contains the actual code to write, every test step shows the actual test, every commit step shows the commit command and message.
