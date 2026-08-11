const FRONTEND_PORT = 4173;
const BACKEND_PORT = 18000;

export const RUNTIME_URLS = Object.freeze({ frontend: `http://127.0.0.1:${FRONTEND_PORT}`, backend: `http://127.0.0.1:${BACKEND_PORT}` });
export interface RuntimeUrls { frontend: string; backend: string }

export function resolveRuntimeUrls(environment: NodeJS.ProcessEnv): Readonly<RuntimeUrls> {
  if (environment.E2E_BASE_URL !== undefined || environment.E2E_API_URL !== undefined) {
    throw new Error('URL overrides are forbidden; use the fixed runtime spawned by the harness');
  }
  const rawOffset = environment.E2E_PORT_OFFSET ?? '0';
  if (!/^\d{1,4}$/.test(rawOffset)) throw new Error('E2E_PORT_OFFSET must be an integer from 0 to 9999');
  const offset = Number(rawOffset);
  return Object.freeze({ frontend: `http://127.0.0.1:${FRONTEND_PORT + offset}`, backend: `http://127.0.0.1:${BACKEND_PORT + offset}` });
}
