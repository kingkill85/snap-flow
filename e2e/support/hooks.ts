import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { SnapFlowWorld } from './world.ts';
import { resolveRuntimeUrls } from './runtime-urls.ts';
import { assertPortAvailable, waitForOwnedRuntime } from './runtime-ownership.ts';

setDefaultTimeout(30_000);
const root = resolve(import.meta.dirname, '../..');
const results = join(root, 'e2e/results');
const runtimeUrls = resolveRuntimeUrls(process.env);
let browser: Awaited<ReturnType<typeof chromium.launch>>;
let runtimeDirectory = '';
let processes: ChildProcess[] = [];

function start(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32' });
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); }
  catch { return; }
  await Promise.race([
    new Promise<void>((done) => child.once('exit', () => done())),
    new Promise<void>((done) => setTimeout(done, 5_000)),
  ]);
  if (child.exitCode === null) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); }
    catch { /* already exited */ }
  }
}

BeforeAll(async function () {
  await mkdir(results, { recursive: true });
  runtimeDirectory = await mkdtemp(join(tmpdir(), 'snapflow-e2e-'));
  const backendPort = new URL(runtimeUrls.backend).port;
  const frontendPort = new URL(runtimeUrls.frontend).port;
  const runId = randomUUID();
  await assertPortAvailable('127.0.0.1', Number(backendPort), 'backend');
  await assertPortAvailable('127.0.0.1', Number(frontendPort), 'frontend');
  const backend = start('deno', ['run', '--allow-all', 'src/main.ts'], join(root, 'backend'), {
    ...process.env, NODE_ENV: 'test', PORT: backendPort,
    DATABASE_URL: join(runtimeDirectory, 'e2e.sqlite'), UPLOAD_DIR: join(runtimeDirectory, 'uploads'),
    CORS_ORIGIN: runtimeUrls.frontend,
    JWT_SECRET: 'e2e-local-ephemeral-key-not-a-production-secret-32',
    E2E_ADMIN_PASSWORD: 'Issue89Admin!', E2E_RUN_ID: runId,
  });
  processes.push(backend);
  await waitForOwnedRuntime(`${runtimeUrls.backend}/health`, backend, 'backend', runId);
  const frontendEnvironment: NodeJS.ProcessEnv = { ...process.env,
    VITE_API_URL: `${runtimeUrls.backend}/api`, VITE_E2E_RUN_ID: runId };
  delete frontendEnvironment.NODE_OPTIONS;
  const frontend = start('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', frontendPort,
    '--strictPort'], join(root, 'frontend'), frontendEnvironment);
  processes.push(frontend);
  await waitForOwnedRuntime(`${runtimeUrls.frontend}/__e2e/ownership`, frontend, 'frontend', runId);
  browser = await chromium.launch({ headless: true });
});

Before(async function (this: SnapFlowWorld, scenario) {
  this.browser = browser;
  this.processes = processes;
  this.runtimeDirectory = runtimeDirectory;
  this.context = await browser.newContext();
  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  this.page = await this.context.newPage();
  this.attach(`scenario=${scenario.pickle.name}`, 'text/plain');
});

After(async function (this: SnapFlowWorld, scenario) {
  if (!this.context || !this.page) return;
  const name = scenario.pickle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (scenario.result?.status !== Status.PASSED) {
    const image = await this.page.screenshot({ path: join(results, `${name}.png`), fullPage: true });
    await this.attach(image, 'image/png');
  }
  await this.context.tracing.stop({ path: join(results, `${name}-trace.zip`) });
  await this.context.close();
});

AfterAll(async function () {
  await browser?.close();
  await Promise.all(processes.reverse().map(stop));
  if (runtimeDirectory) await rm(runtimeDirectory, { recursive: true, force: true });
});
