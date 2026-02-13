import type { Context, Next } from 'hono';
import { fileStorageService } from '../services/file-storage.ts';

/**
 * Allowed image MIME types
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Maximum file size (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Upload result interface
 */
export interface UploadResult {
  success: boolean;
  filePath?: string;
  originalName?: string;
  error?: string;
}

/**
 * Parse multipart form data and handle file upload
 * Returns the upload result and adds it to context
 */
export function uploadMiddleware(
  subdirectory: string = 'items'
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    try {
      const contentType = c.req.header('content-type') || '';
      
      if (!contentType.includes('multipart/form-data')) {
        // No file upload, continue without error
        c.set('uploadResult', { success: false, error: 'No file uploaded' });
        await next();
        return;
      }

      const formData = await c.req.formData();
      const file = formData.get('image');

      if (!file || !(file instanceof File)) {
        c.set('uploadResult', { success: false, error: 'No image file provided' });
        await next();
        return;
      }

      // Validate file type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        c.set('uploadResult', {
          success: false,
          error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        });
        await next();
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        c.set('uploadResult', {
          success: false,
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        });
        await next();
        return;
      }

      // Read file buffer
      const buffer = new Uint8Array(await file.arrayBuffer());

      // Save file
      const filePath = await fileStorageService.saveFile(
        buffer,
        file.name,
        subdirectory
      );

      c.set('uploadResult', {
        success: true,
        filePath,
        originalName: file.name,
      });

      // Also attach form data for other fields
      c.set('formData', formData);

      await next();
    } catch (error) {
      console.error('Upload middleware error:', error);
      c.set('uploadResult', {
        success: false,
        error: 'Failed to process upload',
      });
      await next();
    }
  };
}

/**
 * Middleware to serve uploaded files statically
 * This should be mounted at /uploads route
 */
export async function serveUploadsMiddleware(c: Context) {
  const filePath = c.req.path.replace('/uploads/', '');
  const fullPath = fileStorageService.getFilePath(filePath);

  try {
    const file = await Deno.open(fullPath);
    const stat = await file.stat();
    
    // Determine content type
    const ext = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
    }

    c.header('Content-Type', contentType);
    c.header('Content-Length', stat.size.toString());
    
    return c.body(file.readable);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return c.json({ error: 'File not found' }, 404);
    }
    console.error('Serve uploads error:', error);
    return c.json({ error: 'Failed to serve file' }, 500);
  }
}
