import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';
import { fileStorageService } from '../../file-storage.ts';
import { readImageDimensions } from '../image-dimensions.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

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

interface BomEntry {
  id?: number;
  area_id?: number | null;
  area_name?: string;
  placements?: PlacementInfo[];
  [key: string]: unknown;
}

interface BomGroup {
  mainEntry?: BomEntry;
  children?: BomEntry[];
  bomEntryIds?: number[];
  [key: string]: unknown;
}

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
  areas?: AreaSummary[];
  [key: string]: unknown;
}

/**
 * Returns true only when `p` is a non-empty relative path with no absolute-path
 * prefix and no `..` segments. Keeps path resolution safely inside uploadDir.
 */
function isSafeRelativeStoragePath(p: string): boolean {
  if (p.length === 0) return false;
  if (p.startsWith('/')) return false;
  if (p.startsWith('\\')) return false;
  // Reject any `..` path segment — handles both POSIX and Windows separators.
  return !p.split(/[\\/]/).some(seg => seg === '..');
}

function decorateEntry(
  entry: BomEntry,
  areasById: Map<number, string>,
  placementsByBomId: Map<number, PlacementInfo[]>,
  bomIds?: number[],
): void {
  if (entry.area_id != null) {
    const name = areasById.get(entry.area_id);
    if (name) entry.area_name = name;
  }
  // Groups merge identical item+variant BOM rows; each merged row has its own
  // placement. Gather placements across every BOM id in the group so quantity
  // and placements line up.
  const ids = bomIds && bomIds.length > 0
    ? bomIds
    : (typeof entry.id === 'number' ? [entry.id] : []);
  const placements: PlacementInfo[] = [];
  for (const id of ids) {
    const list = placementsByBomId.get(id);
    if (list) placements.push(...list);
  }
  if (placements.length > 0) entry.placements = placements;
}

export const getFloorplanBomTool = {
  name: 'get_floorplan_bom',
  description:
    'Get the bill of materials for a single floorplan. Returns item name, variant, quantity, unit price at placement time, and area name per BOM entry. Also includes spatial enrichment: per-placement pixel coordinates (x, y, width, height, rotation, area_id, area_box) on each entry, a top-level `canvas` object with the floorplan image dimensions and coordinate system, and a top-level `areas` summary listing every area with its bounding box — enough to reconstruct the layout without fetching the background image. Pass a floorplan_id from list_floorplans.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
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

    if (!bomResult.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get BOM for floorplan ${args.floorplan_id} (HTTP ${bomResult.status}): ${JSON.stringify(bomResult.body)}` }],
      };
    }

    const areasById = new Map<number, string>();
    const areaBoxesById = new Map<number, AreaBox>();
    const areasSummary: AreaSummary[] = [];
    if (areasResult.ok && Array.isArray(areasResult.body?.data)) {
      for (const area of areasResult.body.data as AreaSummary[]) {
        if (typeof area?.id !== 'number' || typeof area?.name !== 'string') continue;
        areasById.set(area.id, area.name);
        const summary: AreaSummary = { id: area.id, name: area.name };
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

    const placementsByBomId = new Map<number, PlacementInfo[]>();
    if (placementsResult.ok && Array.isArray(placementsResult.body?.data)) {
      for (const p of placementsResult.body.data as Array<{
        id: number; bom_id: number | null; x: number; y: number;
        width: number; height: number; rotation: number; area_id: number | null;
      }>) {
        // findByFloorplan INNER JOINs project_bom, so bom_id is non-null in practice.
        // The guard here is defensive against future schema changes.
        if (p.bom_id == null) continue;
        const list = placementsByBomId.get(p.bom_id) ?? [];
        const info: PlacementInfo = {
          placement_id: p.id,
          x: p.x, y: p.y, width: p.width, height: p.height,
          rotation: p.rotation, area_id: p.area_id,
        };
        if (p.area_id != null) {
          const areaName = areasById.get(p.area_id);
          if (areaName !== undefined) info.area_name = areaName;
          const areaBox = areaBoxesById.get(p.area_id);
          if (areaBox !== undefined) info.area_box = areaBox;
        }
        list.push(info);
        placementsByBomId.set(p.bom_id, list);
      }
    }

    const fp = floorplanResult.ok ? (floorplanResult.body?.data as { name?: string; project_id?: number; image_path?: string } | undefined) : undefined;
    let versionName: string | undefined;
    if (fp?.project_id) {
      const projectResult = await dispatchToBackend(ctx.app, {
        method: 'GET',
        path: `/api/projects/${fp.project_id}`,
        accessToken: ctx.accessToken,
      });
      if (projectResult.ok) {
        const project = projectResult.body?.data as { version_name?: string } | undefined;
        versionName = project?.version_name;
      }
    }

    const payload = bomResult.body.data as FloorplanBomPayload;
    if (Array.isArray(payload?.groups)) {
      for (const group of payload.groups) {
        if (group.mainEntry) {
          decorateEntry(group.mainEntry, areasById, placementsByBomId, group.bomEntryIds);
        }
        if (Array.isArray(group.children)) {
          // Children are addons attached to the main entry — they have no
          // placements of their own, so only enrich area info.
          for (const child of group.children) decorateEntry(child, areasById, placementsByBomId);
        }
      }
    }
    if (fp?.name) payload.floorplan_name = fp.name;
    if (versionName) payload.version_name = versionName;
    if (fp?.image_path && isSafeRelativeStoragePath(fp.image_path)) {
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
    if (areasSummary.length > 0) {
      payload.areas = areasSummary;
    }

    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
};
