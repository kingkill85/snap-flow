import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  version_id: z.number().int().positive(),
});

export const getVersionTotalTool = {
  name: 'get_version_total',
  description:
    'Get the itemized total/pricing summary for a SnapFlow project version — list price, discounts, tax, grand total. Pass the version_id from a project\'s versions array (returned by list_projects or get_project).',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/projects/${args.version_id}/total`,
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get total for version ${args.version_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
