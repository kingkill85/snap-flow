/**
 * Environment configuration
 * Loads and validates environment variables
 */

// Load .env file - try multiple locations
const possibleEnvPaths = [
  new URL('../../.env', import.meta.url),  // backend/.env
  new URL('../../../.env', import.meta.url), // root/.env
  new URL('.env', `file://${Deno.cwd()}/`), // cwd/.env
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    const envContent = await Deno.readTextFile(envPath);
    console.log(`Loading env from: ${envPath.pathname}`);
    
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();
          // Remove quotes if present
          value = value.replace(/^["']|["']$/g, '');
          if (!Deno.env.get(key)) {
            Deno.env.set(key, value);
          }
        }
      }
    }
    envLoaded = true;
    break;
  } catch {
    // Try next path
  }
}

if (!envLoaded) {
  console.log('Warning: No .env file found, using environment variables only');
}

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
  JWT_SECRET: getEnvVar('JWT_SECRET'),
  UPLOAD_DIR: getEnvVar('UPLOAD_DIR', './uploads'),
  CORS_ORIGIN: getEnvVar('CORS_ORIGIN', 'http://localhost:5173'),
  NODE_ENV: (getEnvVar('NODE_ENV', 'development') as Env['NODE_ENV']),
};

export default env;
