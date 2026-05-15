import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

interface AreaSummary {
  id: number;
  name: string;
}

interface BomEntry {
  area_id?: number | null;
  area_name?: string;
  [key: string]: unknown;
}

interface BomGroup {
  mainEntry?: BomEntry;
  children?: BomEntry[];
  [key: string]: unknown;
}

interface FloorplanBomPayload {
  groups?: BomGroup[];
  [key: string]: unknown;
}

function decorateEntry(entry: BomEntry, areasById: Map<number, string>): void {
  if (entry.area_id != null) {
    const name = areasById.get(entry.area_id);
    if (name) entry.area_name = name;
  }
}

export const getFloorplanBomTool = {
  name: 'get_floorplan_bom',
  description:
    'Get the bill of materials (items placed) for a single floorplan — each entry includes the item name, variant (if any), quantity, unit price at placement time, and the human-readable area name when the placement is inside one. Pass a floorplan_id from list_floorplans.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const [bomResult, areasResult] = await Promise.all([
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

    const payload = bomResult.body.data as FloorplanBomPayload;
    if (areasById.size > 0 && Array.isArray(payload?.groups)) {
      for (const group of payload.groups) {
        if (group.mainEntry) decorateEntry(group.mainEntry, areasById);
        if (Array.isArray(group.children)) {
          for (const child of group.children) decorateEntry(child, areasById);
        }
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
};
