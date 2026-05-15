import type { Hono } from 'hono';
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';

export interface ToolContext {
  app: Hono;
  accessToken: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const inputSchema = z.object({
  query: z.string().optional(),
});

export const listProjectsTool = {
  name: 'list_projects',
  description:
    'List SnapFlow projects in your workspace. Each entry includes the customer info, status (active/completed/cancelled), and the list of versions (versions are saved revisions of the same project — use a version_id with get_version_total). Use `query` to filter by customer name or project version name.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const dispatchInput: Parameters<typeof dispatchToBackend>[1] = {
      method: 'GET',
      path: '/api/project-groups',
      accessToken: ctx.accessToken,
    };
    if (args.query !== undefined) {
      dispatchInput.query = { search: args.query };
    }
    const result = await dispatchToBackend(ctx.app, dispatchInput);
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list projects (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
