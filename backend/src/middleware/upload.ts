import type { Context, Next } from 'hono';
import { fileStorageService } from '../services/file-storage.ts';

/**
 * Allowed image MIME types
 */
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Allowed Excel MIME types
 */
const ALLOWED_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

/**
 * Maximum file size for images (5MB)
 */
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Maximum file size for Excel files (15MB)
 */
const MAX_EXCEL_FILE_SIZE = 15 * 1024 * 1024;

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
  subdirectory: string = 'items',
  options: {
    fieldName?: string;
    allowedTypes?: string[];
    maxSize?: number;
    skipValidation?: boolean;
  } = {}
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    const {
      fieldName = 'image',
      allowedTypes = ALLOWED_IMAGE_MIME_TYPES,
      maxSize = MAX_IMAGE_FILE_SIZE,
      skipValidation = false,
    } = options;

    try {
      const contentType = c.req.header('content-type') || '';
      
      if (!contentType.includes('multipart/form-data')) {
        // No multipart form data, continue without setting formData
        c.set('uploadResult', { success: false, error: 'No file uploaded' });
        await next();
        return;
      }

      // Always parse formData for multipart requests
      const formData = await c.req.formData();
      c.set('formData', formData);
      
      const file = formData.get(fieldName);

      if (!file || !(file instanceof File)) {
        c.set('uploadResult', { success: false, error: `No ${fieldName} file provided` });
        await next();
        return;
      }

      // Skip validation for Excel files (we'll validate by extension)
      if (!skipValidation) {
        // Validate file type
        if (!allowedTypes.includes(file.type)) {
          c.set('uploadResult', {
            success: false,
            error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
          });
          await next();
          return;
        }

        // Validate file size
        if (file.size > maxSize) {
          c.set('uploadResult', {
            success: false,
            error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`,
          });
          await next();
          return;
        }
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
