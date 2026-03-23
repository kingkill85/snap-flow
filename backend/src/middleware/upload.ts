import type { Context, Next } from 'hono';
import { fileStorageService } from '../services/file-storage.ts';
import { processImageSafe } from '../services/image-processing.ts';
import { validateMagicBytes } from '../utils/magic-bytes.ts';

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
 * Maximum file size for images (5MB)
 */
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

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
    maxImageWidth?: number;
  } = {}
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    const {
      fieldName = 'image',
      allowedTypes = ALLOWED_IMAGE_MIME_TYPES,
      maxSize = MAX_IMAGE_FILE_SIZE,
      skipValidation = false,
      maxImageWidth,
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

      // Read file buffer (needed for magic byte validation and saving)
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // Validate magic bytes regardless of skipValidation
      const magicType = skipValidation ? 'excel' : 'image';
      if (!validateMagicBytes(fileBytes, magicType)) {
        c.set('uploadResult', {
          success: false,
          error: 'Invalid file format',
        });
        await next();
        return;
      }

      let buffer: Uint8Array;

      // Process image if maxImageWidth is specified
      if (maxImageWidth && maxImageWidth > 0) {
        try {
          const processResult = await processImageSafe(fileBytes, {
            maxWidth: maxImageWidth,
          });
          if (processResult.format !== 'unknown') {
            buffer = processResult.buffer;
            console.log(`Image processed: ${processResult.originalSize} bytes → ${processResult.processedSize} bytes (${Math.round((1 - processResult.processedSize / processResult.originalSize) * 100)}% reduction)`);
          } else {
            buffer = fileBytes;
          }
        } catch (error) {
          console.warn('Image processing failed, saving original:', error);
          buffer = fileBytes;
        }
      } else {
        buffer = fileBytes;
      }

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
