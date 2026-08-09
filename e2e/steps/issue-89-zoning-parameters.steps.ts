import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { SnapFlowWorld } from '../support/world.ts';

type ZoningWorld = SnapFlowWorld & { token: string; itemTypeId: number; parameterId: number };

Given('an existing Product Type and an authenticated administrator', async function (this: ZoningWorld) {
  const login = await this.page!.request.post(`${this.apiUrl}/api/auth/login`, { data: { email: 'admin@snapflow.com', password: 'Issue89Admin!' } });
  const loginBody = await login.json();
  if (!login.ok()) throw new Error(`login ${login.status()}: ${JSON.stringify(loginBody)}`); const auth = loginBody.data; this.token = auth.accessToken;
  const created = await this.page!.request.post(`${this.apiUrl}/api/item-types`, { headers: { Authorization: `Bearer ${this.token}` }, data: { name: `Issue 89 Lighting ${Date.now()}`, abbreviation: 'I89' } });
  expect(created.ok()).toBeTruthy(); this.itemTypeId = (await created.json()).data.id;
  await this.page!.goto(this.baseUrl); await this.page!.evaluate(({ accessToken, refreshToken }) => { localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); }, auth);
});

When('the administrator creates a parameter with a valid name and order', async function (this: ZoningWorld) {
  await this.page!.goto(`${this.baseUrl}/catalog/item-types`, { waitUntil: 'domcontentloaded' });
  await expect(this.page!).toHaveURL(`${this.baseUrl}/catalog/item-types`);
  await expect(this.page!.getByRole('heading', { name: 'Product Type Management' })).toBeVisible();
  await this.page!.getByRole('button', { name: /Expand Issue 89 Lighting.*zoning parameters/ }).click();
  await this.page!.getByRole('button', { name: 'Create' }).click();
  const dialog = this.page!.getByRole('dialog', { name: 'Create Zoning Parameter' });
  await dialog.getByLabel('Name').fill('Relay zones');
  const responsePromise = this.page!.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/item-types/${this.itemTypeId}/zoning-parameters`));
  await dialog.getByRole('button', { name: 'Create' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  await expect(this.page!.getByText('Relay zones')).toBeVisible();
});

Then('the system persists a new stable identity owned by that Product Type', async function (this: ZoningWorld) {
  const response = await this.page!.request.get(`${this.apiUrl}/api/item-types/${this.itemTypeId}/zoning-parameters`, { headers: { Authorization: `Bearer ${this.token}` } });
  expect(response.ok()).toBeTruthy(); const parameters = (await response.json()).data; this.parameterId = parameters[0].id;
  expect(this.parameterId).toBeGreaterThan(0); expect(parameters[0].item_type_id).toBe(this.itemTypeId);
});

Then("returns the definition in the Product Type's ordered parameter collection", async function (this: ZoningWorld) {
  const response = await this.page!.request.get(`${this.apiUrl}/api/item-types/${this.itemTypeId}/zoning-parameters`, { headers: { Authorization: `Bearer ${this.token}` } });
  expect((await response.json()).data.map((entry: { name: string }) => entry.name)).toEqual(['Relay zones']);
});
