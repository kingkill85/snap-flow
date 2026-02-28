import sharp from 'sharp';

/**
 * Image Processing Service
 * Handles image resizing and compression for uploaded files
 * Preserves transparency for PNG files
 */

export interface ProcessOptions {
  maxWidth: number;
  maintainAspectRatio?: boolean;
}

export interface ProcessResult {
  buffer: Uint8Array;
  originalSize: number;
  processedSize: number;
  format: string;
}

/**
 * Check if a buffer is an image by inspecting magic bytes
 */
function isImage(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return false;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return true;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return true;
  }

  // WebP: RIFF....WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return true;
  }

  return false;
}

/**
 * Get image format from buffer magic bytes
 */
function getImageFormat(buffer: Uint8Array): string | null {
  if (buffer.length < 4) return null;

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }

  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }

  // WebP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'webp';
  }

  return null;
}

/**
 * Process an image: resize to max width and compress
 * Preserves transparency for PNG files
 * @param buffer - Original image buffer
 * @param options - Processing options
 * @returns Processed image buffer and metadata
 */
export async function processImage(
  buffer: Uint8Array,
  options: ProcessOptions
): Promise<ProcessResult> {
  const { maxWidth, maintainAspectRatio = true } = options;
  const originalSize = buffer.length;

  // Check if it's an image
  if (!isImage(buffer)) {
    throw new Error('Buffer is not a valid image');
  }

  const format = getImageFormat(buffer);
  if (!format) {
    throw new Error('Unsupported image format');
  }

  try {
    // Create sharp instance from buffer
    let sharpInstance = sharp(buffer, {
      unlimited: true,
      sequentialRead: true,
    });

    // Get metadata to check current dimensions
    const metadata = await sharpInstance.metadata();

    // Only resize if the image is larger than maxWidth
    if (metadata.width && metadata.width > maxWidth) {
      sharpInstance = sharpInstance.resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: maintainAspectRatio ? 'inside' : 'fill',
      });
    }

    // Apply format-specific compression
    switch (format) {
      case 'png':
        // Fast PNG compression for slow CPU devices
        // Preserves transparency with level 3 (good balance of speed vs size)
        sharpInstance = sharpInstance.png({
          compressionLevel: 3, // Fast compression (0-9), level 3 = ~10x faster decode than level 9
          adaptiveFiltering: true,
          palette: false, // Keep full color depth for quality
          effort: 4, // Balance between speed and compression
        });
        break;

      case 'jpeg':
        // JPEG with good quality and baseline encoding for fast decode
        // Baseline (progressive: false) renders instantly on slow CPUs
        sharpInstance = sharpInstance.jpeg({
          quality: 80, // Slightly lower for smaller files (barely perceptible difference)
          progressive: false, // Baseline encoding renders instantly
          mozjpeg: true,
        });
        break;

      case 'webp':
        // WebP with good quality and fast encoding
        sharpInstance = sharpInstance.webp({
          quality: 80, // Slightly lower for smaller files
          effort: 4, // Reduced from 6 for faster encoding (0-6)
        });
        break;
    }

    // Process the image
    const processedBuffer = await sharpInstance.toBuffer();

    return {
      buffer: new Uint8Array(processedBuffer),
      originalSize,
      processedSize: processedBuffer.length,
      format,
    };
  } catch (error) {
    console.error('Image processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to process image: ${errorMessage}`);
  }
}

/**
 * Process an image buffer if it's an image, otherwise return original
 * Safe wrapper that doesn't throw on non-images
 * @param buffer - File buffer
 * @param options - Processing options
 * @returns Processed buffer or original buffer if not an image
 */
export async function processImageSafe(
  buffer: Uint8Array,
  options: ProcessOptions
): Promise<ProcessResult> {
  try {
    return await processImage(buffer, options);
  } catch (error) {
    // If it's not an image, return the original buffer
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage === 'Buffer is not a valid image' ||
        errorMessage === 'Unsupported image format') {
      return {
        buffer,
        originalSize: buffer.length,
        processedSize: buffer.length,
        format: 'unknown',
      };
    }
    throw error;
  }
}
