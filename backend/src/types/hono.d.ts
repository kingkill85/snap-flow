import type { Context, Next } from 'hono';
import type { UploadResult } from '../middleware/upload.ts';

/**
 * Extended Context type with user variables
 */
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userEmail: string;
    userRole: 'admin' | 'user';
    uploadResult: UploadResult;
    formData: FormData;
  }
}
