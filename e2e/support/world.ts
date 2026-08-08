import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

export class SnapFlowWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  processes: ChildProcess[] = [];
  runtimeDirectory?: string;
  baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
  apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:18000';

  constructor(options: IWorldOptions) { super(options); }
}

setWorldConstructor(SnapFlowWorld);
