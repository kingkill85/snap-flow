const EMAIL = 'preview-restart@example.test';
const PASSWORD = 'preview-restart-password-123';

export interface RestartableBackend {
  login(): Promise<string>;
  request(path: string, options?: {
    method?: string;
    token?: string;
    body?: unknown;
  }): Promise<Response>;
  restart(): Promise<void>;
  stop(): Promise<void>;
}

function reservePort(): number {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

export async function startRestartableBackend(): Promise<RestartableBackend> {
  const fixtureRoot = await Deno.makeTempDir({ prefix: 'snapflow-preview-restart-' });
  const port = reservePort();
  const origin = `http://127.0.0.1:${port}`;
  let child: Deno.ChildProcess | undefined;

  async function start(): Promise<void> {
    child = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/main.ts'],
      cwd: new URL('../', import.meta.url),
      env: {
        PORT: String(port),
        DATABASE_URL: `${fixtureRoot}/database.sqlite`,
        UPLOAD_DIR: `${fixtureRoot}/uploads`,
        JWT_SECRET: 'preview-restart-jwt-secret-at-least-32-characters',
        ADMIN_EMAIL: EMAIL,
        ADMIN_PASSWORD: PASSWORD,
        NODE_ENV: 'test',
        CORS_ORIGIN: origin,
        BUILD_SHA: '0123456789abcdef0123456789abcdef01234567',
      },
      stdout: 'null',
      stderr: 'null',
    }).spawn();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await Promise.race([
        child.status.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25)),
      ]))) throw new Error('isolated backend exited before becoming healthy');
      try {
        if ((await fetch(`${origin}/health`)).status === 200) return;
      } catch {
        // The isolated listener is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('isolated backend did not become healthy');
  }

  async function stopProcess(): Promise<void> {
    if (!child) return;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    await child.status;
    child = undefined;
  }

  await start();
  return {
    async login() {
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      });
      if (response.status !== 200) throw new Error('isolated preview login failed');
      return (await response.json()).data.accessToken;
    },
    request(path, options = {}) {
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      const init: RequestInit = { headers };
      if (options.method !== undefined) init.method = options.method;
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
      return fetch(`${origin}${path}`, init);
    },
    async restart() {
      await stopProcess();
      await start();
    },
    async stop() {
      await stopProcess();
      await Deno.remove(fixtureRoot, { recursive: true });
    },
  };
}
