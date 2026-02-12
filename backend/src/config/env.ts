/**
 * Environment configuration
 * Loads and validates environment variables
 */

interface Env {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  UPLOAD_DIR: string;
  CORS_ORIGIN: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = Deno.env.get(name);
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvVarAsNumber(name: string, defaultValue?: number): number {
  const value = Deno.env.get(name);
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return num;
}

export const env: Env = {
  PORT: getEnvVarAsNumber('PORT', 8000),
  DATABASE_URL: getEnvVar('DATABASE_URL', './data/database.sqlite'),
  JWT_SECRET: getEnvVar('JWT_SECRET', 'development-secret-change-in-production'),
  UPLOAD_DIR: getEnvVar('UPLOAD_DIR', './uploads'),
  CORS_ORIGIN: getEnvVar('CORS_ORIGIN', 'http://localhost:5173'),
  NODE_ENV: (getEnvVar('NODE_ENV', 'development') as Env['NODE_ENV']),
};

export default env;
