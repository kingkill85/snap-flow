# MCP Image Tools — Honest Rendering & Spatial Context

**Date:** 2026-05-16
**Status:** Design

## Problem

SnapFlow's MCP server exposes two image tools — `get_floorplan_image` and `get_item_picture` — that return inline base64 `ImageContent`. The image bytes reach Claude's vision context so the model can analyze them, but Claude Desktop's chat UI does not render MCP tool-result images back to the user. The model, unable to distinguish "I see it" from "the user sees it", routinely claims "here is the picture" while the user sees nothing.

A URL-based approach is rejected: any URL Claude Desktop fetches goes out as an anonymous HTTP request without the MCP connection's JWT, so a URL approach forces the resource to be either public or signed-with-a-leakable-token. SnapFlow images are private user data; neither is acceptable.

In addition, two gaps in the current tool surface limit the model's usefulness:

1. `get_item_picture` only takes `bom_id`, so the model cannot see catalog products that have not yet been placed.
2. `get_floorplan_bom` returns grouped quantities and prices but no per-placement coordinates, so the model cannot reconstruct the spatial layout of a floorplan from text alone.

## Goals

- Stop the model from falsely claiming it displayed images that the UI never renders.
- Let the model fetch pictures of catalog items and variants, not just placed BOM entries.
- Give the model enough spatial data — per-placement coordinates, canvas dimensions, area bounding boxes — to mentally reconstruct a floorplan layout without seeing the background image.

## Non-Goals

- Inline image rendering in Claude Desktop via external URLs (rejected — auth cannot be forwarded).
- Signed-URL endpoints or any other public/leakable URL scheme.
- Changes to the SnapFlow web UI, catalog ingestion, or BOM business logic.
- A new "show me everything" tool — discoverability stays on the existing tool descriptions.

## Design

### Change 1 — Honest descriptions on both image tools

Both tools continue to return inline base64 `ImageContent` blocks plus a text block. The base64 path is the only auth-correct option (image bytes stay within the authenticated MCP channel; no separate fetch by the UI), so the data flow does not change. What changes is the framing presented to the model.

**`get_floorplan_image` description (new):**
> "Load a floorplan's background image into your visual context for analysis. The image bytes go to Claude's vision so you can describe the layout, identify rooms, estimate scale, and reason about placements. The Claude Desktop UI does NOT render this image back to the user. Never say 'here is the floorplan' or 'as you can see' — the user sees nothing. Instead, describe what you observe."

**`get_item_picture` description (new — see also Change 2 for input schema):**
> "Load a product picture into your visual context for analysis. The image bytes go to Claude's vision so you can describe the item's appearance. The Claude Desktop UI does NOT render this image back to the user — describe what you see rather than claiming the picture was shown. Accepts exactly one of `bom_id` (a placed BOM entry), `variant_id` (a catalog variant/style), or `item_id` (a catalog product; uses the first active variant's image)."

**Text content block:** the breadcrumb-style label (`"Floorplan #5 (Main Floor): path.png"`) is replaced with an instruction-shaped string that the model is more likely to follow:
> "Image of "Main Floor" loaded for your analysis only. The user cannot see it — describe its contents in your reply."

The error paths (`isError: true` with explanatory text) are unchanged.

### Change 2 — `get_item_picture` accepts catalog IDs

The Zod input schema becomes a tagged union: exactly one of `bom_id`, `variant_id`, `item_id` is required. Validation rejects "none" and "more than one" with a clear error message.

```ts
const inputSchema = z.object({
  bom_id: z.number().int().positive().optional(),
  variant_id: z.number().int().positive().optional(),
  item_id: z.number().int().positive().optional(),
}).refine(
  v => [v.bom_id, v.variant_id, v.item_id].filter(x => x !== undefined).length === 1,
  { message: 'Pass exactly one of bom_id, variant_id, or item_id' },
);
```

Resolution:
- **`bom_id`** — unchanged. Dispatch `GET /api/bom-entries/:id`, read `picture_path`.
- **`variant_id`** — read `item_variants.image_path` via `itemVariantRepository.findById(variantId)`. Catalog tables are not tenant-scoped, so a direct repository read is safe and avoids a needless HTTP roundtrip.
- **`item_id`** — call `itemVariantRepository.findByItemId(itemId)`, take the first variant with `is_active = true` and a non-null `image_path`, ordered by `sort_order ASC, id ASC` (matches the existing `preview_image` SQL in `item.ts:85`). Return `isError` with a clear message if no active variant has an image.

The image-loading branch (`Deno.readFile` + `encodeBase64`) and the surrounding error handling are extracted into a small helper so all three code paths share one implementation, keeping the handler readable.

### Change 3 — `get_floorplan_bom` spatial enrichment

The tool's response stays a single `text` content block containing a JSON-serialized payload, but the payload grows three new pieces of context.

**3a. Canvas dimensions.** Top-level field:
```json
"canvas": {
  "image_path": "projects/12/floorplans/main.png",
  "width": 1920,
  "height": 1080,
  "coordinate_system": "image-pixel, origin top-left of canvas, rotation in degrees clockwise"
}
```
Width/height are read from the image file's header bytes by a small format-sniffing helper (~40 lines) living at `backend/src/services/mcp/image-dimensions.ts`. The helper handles PNG (IHDR chunk) and JPEG (walk SOF0/SOF2 markers) — the two formats that account for essentially all uploaded floorplans. For WebP/GIF (or unrecognized headers), `width`/`height` are omitted. If parsing fails, the file is missing, or any I/O error occurs, the `canvas` object is still emitted with `image_path` and `coordinate_system` so the model knows what the coordinates refer to; only `width`/`height` are absent. The enrichment is best-effort and never causes the tool to fail.

**3b. Per-placement coordinates on every BOM entry.** Each `mainEntry` and each `children[]` entry inside `groups[]` gains a `placements` array:
```json
"placements": [
  { "placement_id": 17, "x": 340, "y": 220, "width": 64, "height": 64,
    "rotation": 0, "area_id": 3, "area_name": "Wohnzimmer",
    "area_box": { "x": 0, "y": 0, "width": 500, "height": 300 } },
  ...
]
```
The MCP tool fetches placements once for the floorplan via `GET /api/placements?floorplan_id=X`, groups them by `bom_id`, and decorates each BOM entry with its matching subset. The quantity reported by the BOM service should equal `placements.length` for the main entry; if it does not (legacy data, addons), both fields are emitted and the discrepancy is verifiable by the model.

**3c. Areas summary and per-placement `area_box`.** A top-level `areas` array exposes every area on the floorplan (`GET /api/areas?floorplan_id=X`):
```json
"areas": [
  { "id": 3, "name": "Wohnzimmer", "x": 0, "y": 0, "width": 500, "height": 300 },
  ...
]
```
Each placement's `area_box` is taken from the same source — this lets the model phrase "the TV is in the upper-left quadrant of the Wohnzimmer" without needing a second tool call.

### Data flow

```
get_floorplan_bom(floorplan_id)
  ├─ GET /api/floorplans/:id/bom           (existing — groups)
  ├─ GET /api/areas?floorplan_id=X         (existing — names + boxes)
  ├─ GET /api/floorplans/:id               (existing — image_path, project_id)
  ├─ GET /api/projects/:pid                (existing — version_name)
  └─ GET /api/placements?floorplan_id=X    (NEW — per-placement coords)
  + read image header bytes for canvas dimensions (NEW)
  → enrich → JSON.stringify → single text content block
```

The image-header read is a local `Deno.readFile` on the same path resolved through `fileStorageService.getFilePath()`. No new HTTP route is added. All five backend calls fan out via the existing parallel-dispatch pattern in `get-floorplan-bom.ts`.

### Error handling

- **Image-tool resolution failures** (no picture for the requested ID, file missing on disk): return `isError: true` with a specific text message — same shape as today, no new error semantics.
- **Validation failures** (no ID or multiple IDs to `get_item_picture`): Zod's refine produces a clear message; the MCP framework already converts these to tool errors.
- **Enrichment failures** in `get_floorplan_bom` (image header parse error, areas endpoint 500, placements endpoint 500): the tool degrades gracefully — emit what data is available, omit what is not. The text payload always contains the original BOM groups even if every enrichment step fails. Failures are surfaced as missing fields, not as a tool-level error, because the BOM itself is still useful without coordinates.

## Testing

All tests are Deno tests under `backend/tests/mcp/tools_test.ts`, using the in-memory SQLite + `setupTestDatabase()` / `clearDatabase()` pattern already in place.

**`get_floorplan_image` / `get_item_picture` descriptions:**
- Assert each tool's `description` string contains the phrase "user cannot see" (or equivalent guardrail wording). One-line sanity test — prevents accidental regression of the framing.

**`get_item_picture` extension:**
- Existing `bom_id` test path stays. New tests:
  - `variant_id` returns image content + correct mime type.
  - `item_id` falls back to first-active-variant image (verify by creating two variants in known order).
  - `item_id` with no active variant returns `isError`.
  - Schema validation: passing zero or two IDs returns `isError` with the "exactly one" message.

**`get_floorplan_bom` enrichment:**
- New step under the existing `'get_floorplan_bom enrichment'` test: create a floorplan with a 100×60 PNG fixture, one area, one BOM entry, two placements. Assert the payload contains:
  - `canvas.width`, `canvas.height`, `canvas.coordinate_system`
  - `groups[0].mainEntry.placements` with two entries, each carrying `x`, `y`, `width`, `height`, `rotation`, `area_id`, `area_name`, `area_box`
  - `areas` array containing the created area with its bounding box
- Graceful-degradation test: floorplan whose `image_path` file does not exist on disk. Assert the BOM payload is still returned, `canvas.image_path` is present, `canvas.width`/`canvas.height` are absent, no tool error.

Run `deno lint` and `deno task test` after implementation.

## Migration / Compatibility

- **No database migrations.** All schema needed is already in place (`placements.x/y/width/height/rotation`, `areas.x/y/width/height`, `item_variants.image_path`).
- **No breaking changes to existing tool inputs.** `bom_id`-only calls to `get_item_picture` keep working. `get_floorplan_bom` callers only see *added* fields in the payload.
- **No new HTTP routes.** All MCP enrichment dispatches against routes that already exist.

## Open Questions

None. Both design decisions raised during brainstorming (canvas + area boxes; single-tool discriminated input) were resolved with the user.
