import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

export const getFloorplanBomTool = {
  name: 'get_floorplan_bom',
  description:
    'Get the bill of materials (items placed) for a single floorplan — each entry includes the item name, variant (if any), quantity, and unit price at placement time. Pass a floorplan_id from list_floorplans.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/floorplans/${args.floorplan_id}/bom`,
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get BOM for floorplan ${args.floorplan_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
