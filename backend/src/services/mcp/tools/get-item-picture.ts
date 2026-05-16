import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import { fileStorageService } from '../../file-storage.ts';
import { encodeBase64 } from '@std/encoding/base64';
import { itemVariantRepository } from '../../../repositories/item-variant.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  bom_id: z.number().int().positive().optional(),
  variant_id: z.number().int().positive().optional(),
  item_id: z.number().int().positive().optional(),
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

interface ResolvedPicture {
  relPath: string;
  label: string;     // human-readable subject, used in the text content block
  subjectTag: string; // e.g. "BOM #5", "Variant #2", "Item #7"
}

async function loadAndReturn(resolved: ResolvedPicture): Promise<ToolResult> {
  try {
    const bytes = await Deno.readFile(fileStorageService.getFilePath(resolved.relPath));
    return {
      content: [
        { type: 'image', data: encodeBase64(bytes), mimeType: mimeTypeForPath(resolved.relPath) },
        { type: 'text', text: `Image of "${resolved.label}" (${resolved.subjectTag}) loaded for your analysis only. The user cannot see it — describe its contents in your reply.` },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to read picture file (${resolved.relPath}): ${msg}` }],
    };
  }
}

async function resolveBom(args: { bom_id: number }, ctx: ToolContext): Promise<ResolvedPicture | ToolResult> {
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
  if (!entry?.picture_path) {
    return {
      isError: true,
      content: [{ type: 'text', text: `BOM entry ${args.bom_id} has no picture_path` }],
    };
  }
  return {
    relPath: entry.picture_path,
    label: entry.item_name ?? 'unknown',
    subjectTag: `BOM #${args.bom_id}`,
  };
}

async function resolveVariant(variantId: number): Promise<ResolvedPicture | ToolResult> {
  const variant = await itemVariantRepository.findById(variantId);
  if (!variant) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Variant ${variantId} not found` }],
    };
  }
  if (!variant.image_path) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Variant ${variantId} has no image_path` }],
    };
  }
  return {
    relPath: variant.image_path,
    label: variant.style_name,
    subjectTag: `Variant #${variantId}`,
  };
}

export const getItemPictureTool = {
  name: 'get_item_picture',
  description:
    "Load a product picture into your visual context for analysis. The image bytes go to Claude's vision so you can describe the item's appearance. The Claude Desktop UI does NOT render this image back to the user — describe what you see rather than claiming the picture was shown. Pass exactly one of: `bom_id` (a placed BOM entry), `variant_id` (a catalog variant/style), or `item_id` (a catalog product; uses the first active variant's image).",
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const provided = [args.bom_id, args.variant_id, args.item_id].filter(v => v !== undefined);
    if (provided.length !== 1) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Pass exactly one of bom_id, variant_id, or item_id' }],
      };
    }

    let resolved: ResolvedPicture | ToolResult;
    if (args.bom_id !== undefined) {
      resolved = await resolveBom({ bom_id: args.bom_id }, ctx);
    } else if (args.variant_id !== undefined) {
      resolved = await resolveVariant(args.variant_id);
    } else {
      // item_id branch is implemented in Task 4
      return {
        isError: true,
        content: [{ type: 'text', text: 'item_id input is not yet supported' }],
      };
    }

    if ('isError' in resolved) return resolved as ToolResult;
    return loadAndReturn(resolved as ResolvedPicture);
  },
};
