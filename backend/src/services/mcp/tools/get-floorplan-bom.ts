import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';
import { fileStorageService } from '../../file-storage.ts';
import { readImageDimensions } from '../image-dimensions.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

interface AreaSummary {
  id: number;
  name: string;
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
  [key: string]: unknown;
}

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

export const getFloorplanBomTool = {
  name: 'get_floorplan_bom',
  description:
    'Get the bill of materials (items placed) for a single floorplan — each entry includes the item name, variant (if any), quantity, unit price at placement time, and the human-readable area name when the placement is inside one. Pass a floorplan_id from list_floorplans.',
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
    if (areasResult.ok && Array.isArray(areasResult.body?.data)) {
      for (const area of areasResult.body.data as AreaSummary[]) {
        if (typeof area?.id === 'number' && typeof area?.name === 'string') {
          areasById.set(area.id, area.name);
        }
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
        const areaName = p.area_id != null ? areasById.get(p.area_id) : undefined;
        const info: PlacementInfo = {
          placement_id: p.id,
          x: p.x, y: p.y, width: p.width, height: p.height,
          rotation: p.rotation, area_id: p.area_id,
        };
        if (areaName !== undefined) info.area_name = areaName;
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
        if (group.mainEntry) decorateEntry(group.mainEntry, areasById, placementsByBomId);
        if (Array.isArray(group.children)) {
          for (const child of group.children) decorateEntry(child, areasById, placementsByBomId);
        }
      }
    }
    if (fp?.name) payload.floorplan_name = fp.name;
    if (versionName) payload.version_name = versionName;
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

    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
};
