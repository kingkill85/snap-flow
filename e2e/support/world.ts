import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { resolveRuntimeUrls } from './runtime-urls.ts';

const runtimeUrls = resolveRuntimeUrls(process.env);

export class SnapFlowWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  processes: ChildProcess[] = [];
  runtimeDirectory?: string;
  baseUrl = runtimeUrls.frontend;
  apiUrl = runtimeUrls.backend;

  constructor(options: IWorldOptions) { super(options); }
}

setWorldConstructor(SnapFlowWorld);
