import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { SnapFlowWorld } from '../support/world.ts';

Given('the isolated SnapFlow runtime is ready', function (this: SnapFlowWorld) {
  expect(this.page).toBeDefined();
});

When('the tracer browser opens the SnapFlow login page', async function (this: SnapFlowWorld) {
  await this.page!.goto(`${this.baseUrl}/login`, { waitUntil: 'networkidle' });
});

Then('the real frontend renders the SnapFlow sign-in form', async function (this: SnapFlowWorld) {
  await expect(this.page!.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(this.page!.getByLabel('Email')).toBeVisible();
});

Then('the real backend health endpoint reports ready', async function (this: SnapFlowWorld) {
  const response = await this.page!.request.get(`${this.apiUrl}/health`);
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).status).toBe('ok');
});
