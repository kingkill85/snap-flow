import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import { fileStorageService } from '../../file-storage.ts';
import { encodeBase64 } from '@std/encoding/base64';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  bom_id: z.number().int().positive(),
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

export const getItemPictureTool = {
  name: 'get_item_picture',
  description:
    'Fetch the picture for a single placement (BOM entry) as an inline image. Pass a bom_id from get_floorplan_bom — e.g. mainEntry.id or one of bomEntryIds. Use this only when you need to actually see the item; for normal browsing the text BOM is cheaper.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const meta = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/bom-entries/${args.bom_id}`,
      accessToken: ctx.accessToken,
    });

    if (!meta.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to load BOM entry ${args.bom_id} (HTTP ${meta.status}): ${JSON.stringify(meta.body)}` }],
      };
    }

    const entry = meta.body?.data as { picture_path?: string | null; item_name?: string } | undefined;
    const picturePath = entry?.picture_path;
    if (!picturePath) {
      return {
        isError: true,
        content: [{ type: 'text', text: `BOM entry ${args.bom_id} has no picture_path` }],
      };
    }

    try {
      const bytes = await Deno.readFile(fileStorageService.getFilePath(picturePath));
      return {
        content: [
          { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(picturePath) },
          { type: 'text', text: `BOM #${args.bom_id} (${entry?.item_name ?? 'unknown'}): ${picturePath}` },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to read picture file for BOM ${args.bom_id} (${picturePath}): ${msg}` }],
      };
    }
  },
};
