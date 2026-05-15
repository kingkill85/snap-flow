import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

export const listAreasTool = {
  name: 'list_areas',
  description:
    'List the named areas/zones (e.g., "Kitchen", "Living Room") defined on a floorplan. Each area has an id, name, and polygon coordinates. Useful for future placement operations where you want to target a specific room.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: '/api/areas',
      query: { floorplan_id: args.floorplan_id },
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list areas for floorplan ${args.floorplan_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
