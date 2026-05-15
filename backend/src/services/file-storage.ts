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
   * Copy a file from source to destination
   * @param sourceRelativePath - Relative path of source file (e.g., "items/image.jpg")
   * @param destinationSubdirectory - Destination subdirectory (e.g., "projects/123/bom-images")
   * @param newFilename - Optional new filename (if not provided, generates unique name)
   * @returns Relative path of the copied file, or original path if copy fails
   */
  async copyFile(
    sourceRelativePath: string,
    destinationSubdirectory: string,
    newFilename?: string
  ): Promise<string> {
    try {
      const sourceFullPath = `${this.uploadDir}/${sourceRelativePath}`;
      
      // Check if source file exists
      try {
        await Deno.stat(sourceFullPath);
      } catch {
        // Source file doesn't exist, return original path as fallback
        return sourceRelativePath;
      }
      
      const destDir = await this.ensureDirectory(destinationSubdirectory);
      
      // Generate unique filename if not provided
      const finalFilename = newFilename 
        ? newFilename 
        : this.generateUniqueFilename(sourceRelativePath.split('/').pop() || 'image.jpg');
      
      const destFullPath = `${destDir}/${finalFilename}`;
      
      // Read source file and write to destination
      const fileContent = await Deno.readFile(sourceFullPath);
      await Deno.writeFile(destFullPath, fileContent);
      
      return `${destinationSubdirectory}/${finalFilename}`;
    } catch (error) {
      console.error('Failed to copy file:', error);
      // Return original path as fallback
      return sourceRelativePath;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(relativePath: string): Promise<boolean> {
    const fullPath = `${this.uploadDir}/${relativePath}`;
    console.log(`[FileStorage] Attempting to delete: ${fullPath}`);
    
    try {
      // Check if file exists first
      const exists = await this.fileExists(relativePath);
      if (!exists) {
        console.log(`[FileStorage] File not found (already deleted?): ${fullPath}`);
        return false;
      }
      
      await Deno.remove(fullPath);
      console.log(`[FileStorage] Successfully deleted: ${fullPath}`);
      return true;
    } catch (error) {
      // File might not exist, which is fine
      if (error instanceof Deno.errors.NotFound) {
        console.log(`[FileStorage] File not found during deletion: ${fullPath}`);
        return false;
      }
      console.error(`[FileStorage] Error deleting file ${fullPath}:`, error);
      throw error;
    }
  }

  /**
   * Get file path
   */
  getFilePath(relativePath: string): string {
    return `${this.uploadDir}/${relativePath}`;
  }

  /**
   * Remove a directory only if it is empty. Returns true on success, false if
   * the directory is missing or still has contents.
   */
  async removeDirectoryIfEmpty(relativePath: string): Promise<boolean> {
    const fullPath = `${this.uploadDir}/${relativePath}`;
    try {
      await Deno.remove(fullPath);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      // Non-empty directories raise Deno.errors.PermissionDenied on some
      // platforms and a plain Error elsewhere; either way we treat the
      // dir as "leave it alone".
      return false;
    }
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
