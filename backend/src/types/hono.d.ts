import type { Context, Next } from 'hono';

/**
 * Extended Context type with user variables
 */
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userEmail: string;
    userRole: 'admin' | 'user';
  }
}
