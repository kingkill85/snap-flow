import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SnapFlowWorld } from '../support/world.ts';

type ZoningWorld = SnapFlowWorld & { token: string; itemTypeId: number; parameterId: number; itemTypeIds: number[]; parameterIds: number[]; projectId: number; floorplanId: number; areaId: number; areaRevision: number; originalName: string };

const authHeaders = (world: ZoningWorld) => ({ Authorization: `Bearer ${world.token}` });
async function login(world: ZoningWorld) {
  if (world.token) return;
  const response = await world.page!.request.post(`${world.apiUrl}/api/auth/login`, { data: { email: 'admin@snapflow.com', password: 'Issue89Admin!' } });
  const body = await response.json(); if (!response.ok()) throw new Error(JSON.stringify(body));
  world.token = body.data.accessToken;
  await world.page!.goto(world.baseUrl);
  await world.page!.evaluate(({ accessToken, refreshToken }) => { localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); }, body.data);
}
async function setupArea(world: ZoningWorld, groups = 2, parametersPerGroup = 1) {
  await login(world); world.itemTypeIds = []; world.parameterIds = [];
  for (let group = 0; group < groups; group++) {
    const typeResponse = await world.page!.request.post(`${world.apiUrl}/api/item-types`, { headers: authHeaders(world), data: { name: `Issue89 Type ${group} ${Date.now()}`, abbreviation: `I${group}X` } });
    const type = (await typeResponse.json()).data; world.itemTypeIds.push(type.id);
    for (let index = 0; index < parametersPerGroup; index++) {
      const parameterResponse = await world.page!.request.post(`${world.apiUrl}/api/item-types/${type.id}/zoning-parameters`, { headers: authHeaders(world), data: { name: index === 0 ? `Zones ${group}` : `Extremely long parameter wording ${group}-${index}`, sort_order: index } });
      world.parameterIds.push((await parameterResponse.json()).data.id);
    }
  }
  const projectResponse = await world.page!.request.post(`${world.apiUrl}/api/projects`, { headers: authHeaders(world), data: { customer_name: `Issue89 ${Date.now()}`, item_type_ids: world.itemTypeIds } });
  world.projectId = (await projectResponse.json()).data.id;
  const image = await readFile(resolve(process.cwd(), 'frontend/public/snapflow-logo.png'));
  const floorplanResponse = await world.page!.request.post(`${world.apiUrl}/api/floorplans`, { headers: authHeaders(world), multipart: { project_id: String(world.projectId), name: 'Issue 89 Plan', image: { name: 'plan.png', mimeType: 'image/png', buffer: image } } });
  const floorplanBody = await floorplanResponse.json(); if (!floorplanResponse.ok()) throw new Error(`floorplan ${floorplanResponse.status()}: ${JSON.stringify(floorplanBody)}`);
  world.floorplanId = floorplanBody.data.id;
  const areaResponse = await world.page!.request.post(`${world.apiUrl}/api/areas`, { headers: authHeaders(world), data: { floorplan_id: world.floorplanId, x: 30, y: 30, width: 500, height: 300, name: 'Review Area' } });
  const area = (await areaResponse.json()).data; world.areaId = area.id; world.areaRevision = area.revision; world.originalName = area.name;
}
async function openAreaEditor(world: ZoningWorld) {
  await world.page!.goto(`${world.baseUrl}/projects/${world.projectId}`, { waitUntil: 'domcontentloaded' });
  await world.page!.getByRole('tab', { name: 'Areas' }).click();
  const areasPanel = world.page!.getByLabel('Areas');
  await expect(areasPanel.getByText('Review Area', { exact: true })).toBeVisible();
  await areasPanel.getByTitle('Edit area').click();
  await expect(world.page!.getByRole('dialog', { name: 'Edit Area' })).toBeVisible();
}
async function saveValues(world: ZoningWorld, values: number[]) {
  const response = await world.page!.request.put(`${world.apiUrl}/api/areas/${world.areaId}`, { headers: authHeaders(world), data: { revision: world.areaRevision, applicable_parameter_ids: world.parameterIds, zoning_values: world.parameterIds.map((id, index) => ({ parameter_id: id, value: values[index] ?? 0 })) } });
  expect(response.status()).toBe(200); const area = (await response.json()).data; world.areaRevision = area.revision;
}

Given('an existing Product Type and an authenticated administrator', async function (this: ZoningWorld) {
  const loginResponse = await this.page!.request.post(`${this.apiUrl}/api/auth/login`, { data: { email: 'admin@snapflow.com', password: 'Issue89Admin!' } });
  const loginBody = await loginResponse.json();
  if (!loginResponse.ok()) throw new Error(`login ${loginResponse.status()}: ${JSON.stringify(loginBody)}`); const auth = loginBody.data; this.token = auth.accessToken;
  const created = await this.page!.request.post(`${this.apiUrl}/api/item-types`, { headers: { Authorization: `Bearer ${this.token}` }, data: { name: `Issue 89 Lighting ${Date.now()}`, abbreviation: 'I89' } });
  expect(created.ok()).toBeTruthy(); this.itemTypeId = (await created.json()).data.id;
  await this.page!.goto(this.baseUrl); await this.page!.evaluate(({ accessToken, refreshToken }) => { localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); }, auth);
});

Given('at least one Area value row references a definition, including a zero value if such a row exists', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [2]); this.itemTypeId = this.itemTypeIds[0]; this.parameterId = this.parameterIds[0]; });
When('an administrator attempts to delete the definition', async function (this: ZoningWorld) { await this.page!.goto(`${this.baseUrl}/catalog/item-types`); await this.page!.getByRole('button', { name: /Expand Issue89 Type 0 .* zoning parameters/ }).click(); await this.page!.getByLabel(/Issue89 Type 0 .* zoning parameters/).getByRole('button', { name: 'Delete' }).click(); await this.page!.getByRole('dialog', { name: 'Delete Zoning Parameter' }).getByRole('button', { name: 'Delete' }).click(); });
Then('the system returns `409 Conflict`', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/in use|deactivate/i); });
Then('preserves the definition and all values', async function (this: ZoningWorld) { await expect(this.page!.getByRole('dialog', { name: 'Delete Zoning Parameter' })).toBeVisible(); const area = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); expect((await area.json()).data.zoning_groups[0].parameters[0].value).toBe(2); });

Given('an Area has definitions from multiple applicable Product Types and viewport width permits two columns', async function (this: ZoningWorld) { await this.page!.setViewportSize({ width: 1440, height: 1000 }); await setupArea(this, 2, 1); });
Given('an Area has applicable definitions and the viewport cannot fit two columns', async function (this: ZoningWorld) { await this.page!.setViewportSize({ width: 390, height: 700 }); await setupArea(this, 2, 4); });
When('the user opens Edit Area', async function (this: ZoningWorld) { await openAreaEditor(this); });
Then('Area properties and the zoning column are visible side by side', async function (this: ZoningWorld) { const columns = this.page!.getByRole('dialog').locator('.md\\:grid-cols-2'); await expect(columns).toBeVisible(); expect(await columns.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).not.toBe('none'); });
Then('all Product Type headings remain discoverable without switching tabs', async function (this: ZoningWorld) { for (let group = 0; group < 2; group++) await expect(this.page!.getByRole('button', { name: new RegExp(`Issue89 Type ${group}`) })).toBeVisible(); await expect(this.page!.getByRole('tab')).toHaveCount(0); });
Then('the zoning sections stack below the Area property controls', async function (this: ZoningWorld) { const name = this.page!.getByLabel('Name'); const zoning = this.page!.getByRole('heading', { name: 'Zoning Parameters' }); expect((await name.boundingBox())!.y).toBeLessThan((await zoning.boundingBox())!.y); });
Then('the dialog body scrolls while its title and action controls remain usable', async function (this: ZoningWorld) { const body = this.page!.getByRole('dialog').locator('.overflow-y-auto'); expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy(); await expect(this.page!.getByRole('button', { name: 'Update' })).toBeVisible(); });

Given('focus is on a parameter control', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).focus(); });
When('the user types an integer or activates its labelled plus or minus button by keyboard', async function (this: ZoningWorld) { await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('4'); await this.page!.getByRole('button', { name: 'Increase Zones 0' }).press('Enter'); await this.page!.getByRole('button', { name: 'Update' }).click(); await openAreaEditor(this); });
Then('the displayed value changes within the allowed range', async function (this: ZoningWorld) { await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('5'); });
Then('decrement at zero cannot create a negative value', async function (this: ZoningWorld) { await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('0'); await expect(this.page!.getByRole('button', { name: 'Decrease Zones 0' })).toBeDisabled(); });

Given('the user changed Area properties or zoning values in the dialog', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByLabel('Name').fill('Draft Name'); await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('8'); });
When('the user activates Cancel, presses Escape, or dismisses the dialog', async function (this: ZoningWorld) { await this.page!.getByRole('button', { name: 'Cancel' }).click(); });
Then('no draft changes are sent or retained', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe(this.originalName); expect(area.zoning_groups[0].parameters[0].value).toBe(0); });

Given('an Area has positive and zero values across two applicable Product Types', async function (this: ZoningWorld) { await setupArea(this, 2, 1); await saveValues(this, [3, 0]); });
When('the floorplan renders', async function (this: ZoningWorld) { await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByLabel('Zoning summary')).toBeVisible(); await this.page!.reload(); await expect(this.page!.getByLabel('Zoning summary')).toBeVisible(); });
Then('each Product Type with a positive value has one labelled group', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zoning summary')).toContainText(/Issue89 Type 0.*Zones 0: 3/); });
Then('zero-valued parameters and empty Product Type groups are absent', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zoning summary')).not.toContainText('Issue89 Type 1'); });

Given('an Area has more positive values than fit within the summary bounds and some names are long', async function (this: ZoningWorld) { await setupArea(this, 2, 4); await saveValues(this, Array(8).fill(2)); });
When('the floorplan renders at any supported zoom', async function (this: ZoningWorld) { await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByLabel('Zoning summary')).toBeVisible(); });
Then('visible rows stay within the bounded summary', async function (this: ZoningWorld) { const rect = this.page!.getByTestId('area-zoning-summary-bounds'); expect(Number(await rect.getAttribute('width'))).toBeLessThanOrEqual(150); });
Then('truncated content exposes full text accessibly', async function (this: ZoningWorld) { expect(await this.page!.getByLabel('Zoning summary').locator('title').count()).toBeGreaterThan(0); });
Then('a `+N more` row reports the omitted positive values', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zoning summary')).toContainText(/\+2 more/); });

Given('two editors loaded the same Area revision and applicability set', async function (this: ZoningWorld) { await setupArea(this, 1, 1); });
When('the first update succeeds and the second submits its stale revision', async function (this: ZoningWorld) { const payload = { revision: this.areaRevision, applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 1 }] }; const first = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: payload }); expect(first.status()).toBe(200); this.areaRevision = (await first.json()).data.revision; const stale = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { ...payload, name: 'Stale loser', zoning_values: [{ parameter_id: this.parameterIds[0], value: 9 }] } }); expect(stale.status()).toBe(409); });
Then('the second update receives `409 Conflict`', async function (this: ZoningWorld) { expect(this.areaRevision).toBe(1); });
Then('the first update remains unchanged', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe('Review Area'); expect(area.zoning_groups[0].parameters[0].value).toBe(1); });

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
