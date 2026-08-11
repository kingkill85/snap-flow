import { createServer } from 'node:net';
import type { ChildProcess } from 'node:child_process';

export async function assertPortAvailable(host: string, port: number, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => reject(new Error(`${label} port ${host}:${port} is unavailable: ${error.message}`)));
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

export function assertOwnedResponse(response: Response, runId: string, label: string): void {
  const actual = response.headers.get('x-snapflow-e2e-run');
  if (actual !== runId) throw new Error(`${label} readiness came from an unowned runtime`);
}

export async function waitForOwnedRuntime(url: string, child: ChildProcess, label: string, runId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        assertOwnedResponse(response, runId, label);
        if (child.exitCode !== null) throw new Error(`${label} exited with ${child.exitCode}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${label} readiness timeout: ${lastError}`);
}
