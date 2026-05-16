import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import { fileStorageService } from '../../file-storage.ts';
import { encodeBase64 } from '@std/encoding/base64';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  floorplan_id: z.number().int().positive(),
});

function mimeTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

export const getFloorplanImageTool = {
  name: 'get_floorplan_image',
  description:
    "Load a floorplan's background image into your visual context for analysis. The image bytes go to Claude's vision so you can describe the layout, identify rooms, estimate scale, and reason about placements. The Claude Desktop UI does NOT render this image back to the user — never say 'here is the floorplan' or 'as you can see'. Instead, describe what you observe.",
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const meta = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/floorplans/${args.floorplan_id}`,
      accessToken: ctx.accessToken,
    });

    if (!meta.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to load floorplan ${args.floorplan_id} (HTTP ${meta.status}): ${JSON.stringify(meta.body)}` }],
      };
    }

    const fp = meta.body?.data as { image_path?: string | null; name?: string } | undefined;
    const imagePath = fp?.image_path;
    if (!imagePath) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Floorplan ${args.floorplan_id} has no image_path` }],
      };
    }

    try {
      const bytes = await Deno.readFile(fileStorageService.getFilePath(imagePath));
      return {
        content: [
          { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(imagePath) },
          { type: 'text', text: `Image of floorplan "${fp?.name ?? 'unnamed'}" (#${args.floorplan_id}) loaded for your analysis only. The user cannot see it — describe its contents in your reply.` },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to read floorplan image (${imagePath}): ${msg}` }],
      };
    }
  },
};
