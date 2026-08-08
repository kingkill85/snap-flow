export const RUNTIME_URLS = Object.freeze({
  frontend: 'http://127.0.0.1:4173',
  backend: 'http://127.0.0.1:18000',
});

export function resolveRuntimeUrls(environment: NodeJS.ProcessEnv): typeof RUNTIME_URLS {
  if (environment.E2E_BASE_URL !== undefined || environment.E2E_API_URL !== undefined) {
    throw new Error('URL overrides are forbidden; use the fixed runtime spawned by the harness');
  }
  return RUNTIME_URLS;
}
