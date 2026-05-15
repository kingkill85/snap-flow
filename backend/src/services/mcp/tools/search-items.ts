import { z } from 'zod';
import { dispatchToBackend, type DispatchInput } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  query: z.string().optional(),
  category_id: z.number().int().positive().optional(),
  type_id: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const searchItemsTool = {
  name: 'search_items',
  description:
    'Search the SnapFlow product catalog. Filter by name (`query`), `category_id`, or `type_id`. Limit defaults to 20, max 100.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const query: Record<string, string | number> = {};
    if (args.query !== undefined) query.search = args.query;
    if (args.category_id !== undefined) query.category_id = args.category_id;
    if (args.type_id !== undefined) query.type_id = args.type_id;
    if (args.limit !== undefined) query.limit = args.limit;

    const dispatchInput: DispatchInput = {
      method: 'GET',
      path: '/api/items',
      accessToken: ctx.accessToken,
    };
    if (Object.keys(query).length > 0) {
      dispatchInput.query = query;
    }

    const result = await dispatchToBackend(ctx.app, dispatchInput);
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to search items (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
