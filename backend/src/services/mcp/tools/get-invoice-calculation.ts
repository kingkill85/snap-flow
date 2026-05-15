import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  version_id: z.number().int().positive(),
});

export const getInvoiceCalculationTool = {
  name: 'get_invoice_calculation',
  description:
    'Get the full itemized invoice calculation for a project version — list price, discount (percentage and absolute), services charge, subtotal, tax, grand total, and currency conversion if applicable. More detailed than get_version_total. Pass a version_id.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/projects/${args.version_id}/invoice-calculation`,
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get invoice calculation for version ${args.version_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
