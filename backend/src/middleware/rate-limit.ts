import type { Context, Next } from 'hono';

/**
 * Simple in-memory rate limiting middleware
 * For production, consider using Redis or a database
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Store rate limit data in memory
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_REQUESTS = 5; // 5 requests per window

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Get client identifier (IP address or custom key)
 */
function getClientIdentifier(c: Context, key?: string): string {
  if (key) {
    return key;
  }
  // Get IP from various headers
  const forwarded = c.req.header('x-forwarded-for');
  const realIp = c.req.header('x-real-ip');
  return forwarded || realIp || 'unknown';
}

/**
 * Rate limiting middleware
 * @param maxRequests Maximum number of requests allowed in the window
 * @param windowMs Time window in milliseconds
 * @param key Custom key function to identify clients
 */
export function rateLimit(
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
  key?: string
) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const clientId = getClientIdentifier(c, key);
    const now = Date.now();
    
    const existingEntry = rateLimitStore.get(clientId);
    
    if (existingEntry) {
      // Check if window has reset
      if (now > existingEntry.resetTime) {
        // Reset the counter
        rateLimitStore.set(clientId, {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        // Check if limit exceeded
        if (existingEntry.count >= maxRequests) {
          const retryAfter = Math.ceil((existingEntry.resetTime - now) / 1000);
          c.header('Retry-After', retryAfter.toString());
          c.header('X-RateLimit-Limit', maxRequests.toString());
          c.header('X-RateLimit-Remaining', '0');
          c.header('X-RateLimit-Reset', Math.ceil(existingEntry.resetTime / 1000).toString());
          return c.json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          }, 429);
        }
        
        // Increment counter
        existingEntry.count++;
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', (maxRequests - existingEntry.count).toString());
        c.header('X-RateLimit-Reset', Math.ceil(existingEntry.resetTime / 1000).toString());
      }
    } else {
      // New entry
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - 1).toString());
      c.header('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000).toString());
    }
    
    await next();
  };
}

/**
 * Rate limit specifically for login attempts
 * 10 attempts per 5 minutes - prevents brute force but allows for typos
 */
export function loginRateLimit() {
  return rateLimit(10, 5 * 60 * 1000);
}

/**
 * Rate limit for refresh token endpoint
 * Less strict: 10 attempts per minute
 */
export function refreshRateLimit() {
  return rateLimit(10, 60 * 1000);
}

/**
 * Clear all rate limit entries (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
