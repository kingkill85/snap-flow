import { env } from '../config/env.ts';

/**
 * File Storage Service
 * Handles file uploads and storage operations
 */
export class FileStorageService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR || './uploads';
  }

  /**
   * Ensure the upload directory exists
   */
  async ensureDirectory(relativePath: string): Promise<string> {
    const fullPath = `${this.uploadDir}/${relativePath}`;
    
    try {
      await Deno.mkdir(fullPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    return fullPath;
  }

  /**
   * Generate a unique filename
   */
  generateUniqueFilename(originalFilename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = originalFilename.split('.').pop() || 'jpg';
    return `${timestamp}-${random}.${extension}`;
  }

  /**
   * Sanitize filename for safe storage
   */
  sanitizeFilename(filename: string): string {
    // Remove path traversal attempts and unsafe characters
    return filename
      .replace(/[<>\"|?*]/g, '')
      .replace(/\.\./g, '')
      .replace(/\//g, '-')
      .replace(/\\/g, '-');
  }

  /**
   * Save file buffer to disk
   */
  async saveFile(
    buffer: Uint8Array,
    filename: string,
    subdirectory: string
  ): Promise<string> {
    const dir = await this.ensureDirectory(subdirectory);
    const safeFilename = this.sanitizeFilename(filename);
    const uniqueFilename = this.generateUniqueFilename(safeFilename);
    const filePath = `${dir}/${uniqueFilename}`;

    await Deno.writeFile(filePath, buffer);

    return `${subdirectory}/${uniqueFilename}`;
  }

  /**
   * Delete a file
   */
  async deleteFile(relativePath: string): Promise<void> {
    try {
      const fullPath = `${this.uploadDir}/${relativePath}`;
      await Deno.remove(fullPath);
    } catch (error) {
      // File might not exist, which is fine
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  /**
   * Get file path
   */
  getFilePath(relativePath: string): string {
    return `${this.uploadDir}/${relativePath}`;
  }

  /**
   * Check if file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = `${this.uploadDir}/${relativePath}`;
      await Deno.stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const fileStorageService = new FileStorageService();
