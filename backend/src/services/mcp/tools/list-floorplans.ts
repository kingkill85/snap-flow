import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  version_id: z.number().int().positive(),
});

export const listFloorplansTool = {
  name: 'list_floorplans',
  description:
    'List the floorplans (e.g., "Ground Floor", "Upstairs") in a specific project version. Pass a version_id from a project\'s versions array (returned by list_projects or get_project).',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: '/api/floorplans',
      query: { project_id: args.version_id },
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list floorplans for version ${args.version_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
