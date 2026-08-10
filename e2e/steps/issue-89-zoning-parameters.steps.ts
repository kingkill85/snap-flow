import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SnapFlowWorld } from '../support/world.ts';

type ZoningValueEvidence = { areaId: number; areaName: string; parameterId: number; value: number };
type ZoningWorld = SnapFlowWorld & { token: string; itemTypeId: number; parameterId: number; itemTypeIds: number[]; parameterIds: number[]; projectId: number; projectGroupId: number; floorplanId: number; areaId: number; areaRevision: number; originalName: string; customerName: string; copiedProjectId: number; sourceZoning: ZoningValueEvidence[]; copiedZoning: ZoningValueEvidence[]; lastStatus: number; cssBounds: Array<{ width: number; height: number }> };

const authHeaders = (world: ZoningWorld) => ({ Authorization: `Bearer ${world.token}` });
let cachedAdminAuth: { accessToken: string; refreshToken: string } | undefined;
async function login(world: ZoningWorld) {
  if (world.token) return;
  if (!cachedAdminAuth) {
    const response = await world.page!.request.post(`${world.apiUrl}/api/auth/login`, { data: { email: 'admin@snapflow.com', password: 'Issue89Admin!' } });
    const body = await response.json(); if (!response.ok()) throw new Error(JSON.stringify(body));
    cachedAdminAuth = body.data;
  }
  const auth = cachedAdminAuth!;
  world.token = auth.accessToken;
  await world.page!.goto(world.baseUrl);
  await world.page!.evaluate(({ accessToken, refreshToken }) => { localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); }, auth);
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
  world.customerName = `Issue89 ${Date.now()}`;
  const projectResponse = await world.page!.request.post(`${world.apiUrl}/api/projects`, { headers: authHeaders(world), data: { customer_name: world.customerName, item_type_ids: world.itemTypeIds } });
  const project = (await projectResponse.json()).data;
  world.projectId = project.id; world.projectGroupId = project.project_group_id;
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

async function readProjectZoning(world: ZoningWorld, projectId: number): Promise<ZoningValueEvidence[]> {
  const floorplansResponse = await world.page!.request.get(`${world.apiUrl}/api/floorplans?project_id=${projectId}`, { headers: authHeaders(world) });
  expect(floorplansResponse.ok()).toBeTruthy();
  const floorplans = (await floorplansResponse.json()).data as Array<{ id: number }>;
  const evidence: ZoningValueEvidence[] = [];
  for (const floorplan of floorplans) {
    const areasResponse = await world.page!.request.get(`${world.apiUrl}/api/areas?floorplan_id=${floorplan.id}`, { headers: authHeaders(world) });
    expect(areasResponse.ok()).toBeTruthy();
    const areas = (await areasResponse.json()).data as Array<{ id: number; name: string; zoning_groups: Array<{ parameters: Array<{ id: number; value: number }> }> }>;
    for (const area of areas) for (const group of area.zoning_groups) for (const parameter of group.parameters) {
      if (parameter.value > 0) evidence.push({ areaId: area.id, areaName: area.name, parameterId: parameter.id, value: parameter.value });
    }
  }
  return evidence.sort((left, right) => left.areaName.localeCompare(right.areaName) || left.parameterId - right.parameterId);
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
When('the floorplan renders at any supported zoom', async function (this: ZoningWorld) {
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); this.cssBounds = [];
  const sequence = [
    { target: 50, action: async () => { await this.page!.getByTitle('Zoom out').click(); await this.page!.getByTitle('Zoom out').click(); } },
    { target: 100, action: async () => { await this.page!.getByTitle('Reset zoom (Ctrl+0)').click(); } },
    { target: 150, action: async () => { await this.page!.getByTitle('Zoom in').click(); await this.page!.getByTitle('Zoom in').click(); } },
  ];
  for (const { target, action } of sequence) {
    await action(); await expect(this.page!.getByText(`${target}%`, { exact: true })).toBeVisible();
    const box = await this.page!.getByTestId('area-zoning-summary-bounds').boundingBox(); expect(box).not.toBeNull(); this.cssBounds.push({ width: box!.width, height: box!.height });
  }
});
Then('visible rows stay within the bounded summary', async function (this: ZoningWorld) { for (const box of this.cssBounds) { expect(box.width).toBeLessThanOrEqual(150.5); expect(Math.abs(box.width - this.cssBounds[0].width)).toBeLessThan(1); expect(Math.abs(box.height - this.cssBounds[0].height)).toBeLessThan(1); } });
Then('truncated content exposes full text accessibly', async function (this: ZoningWorld) { const summary = this.page!.getByLabel('Zoning summary'); expect(await summary.locator('title').count()).toBeGreaterThan(0); const box = await summary.boundingBox(); expect(box).not.toBeNull(); const hitSummary = await this.page!.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="area-zoning-summary"]') !== null, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }); expect(hitSummary).toBe(false); });
Then('a `+N more` row reports the omitted positive values', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zoning summary')).toContainText(/\+2 more/); });

Given('two editors loaded the same Area revision and applicability set', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); });
When('the first update succeeds and the second submits its stale revision', async function (this: ZoningWorld) { const first = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { revision: this.areaRevision, name: 'Winning Area', applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 4 }] } }); expect(first.status()).toBe(200); await this.page!.getByLabel('Name').fill('Losing Area'); await this.page!.getByRole('button', { name: 'Update' }).click(); });
Then('the second update receives `409 Conflict`', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/changed|reload/i); });
Then('the first update remains unchanged', async function (this: ZoningWorld) { await this.page!.getByRole('button', { name: 'Reload Area' }).click(); await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area'); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4'); });

Given('an authorized user selects a source version with multiple floorplans and copied Areas having positive zoning values', async function (this: ZoningWorld) {
  await setupArea(this, 1, 1);
  await saveValues(this, [2]);
  const image = await readFile(resolve(process.cwd(), 'frontend/public/snapflow-logo.png'));
  const floorplanResponse = await this.page!.request.post(`${this.apiUrl}/api/floorplans`, { headers: authHeaders(this), multipart: { project_id: String(this.projectId), name: 'Issue 89 Second Plan', image: { name: 'second-plan.png', mimeType: 'image/png', buffer: image } } });
  const secondFloorplan = (await floorplanResponse.json()).data;
  const areaResponse = await this.page!.request.post(`${this.apiUrl}/api/areas`, { headers: authHeaders(this), data: { floorplan_id: secondFloorplan.id, x: 40, y: 40, width: 400, height: 250, name: 'Second Review Area' } });
  const secondArea = (await areaResponse.json()).data;
  const saved = await this.page!.request.put(`${this.apiUrl}/api/areas/${secondArea.id}`, { headers: authHeaders(this), data: { revision: secondArea.revision, applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 5 }] } });
  expect(saved.status()).toBe(200);
  this.sourceZoning = await readProjectZoning(this, this.projectId);
  expect(this.sourceZoning).toHaveLength(2);
});

When('the user creates a new version through the existing Create Version flow', async function (this: ZoningWorld) {
  await this.page!.goto(`${this.baseUrl}/projects`, { waitUntil: 'domcontentloaded' });
  const groupRow = this.page!.getByRole('row').filter({ hasText: this.customerName });
  await expect(groupRow).toBeVisible();
  await groupRow.click();
  await this.page!.getByRole('button', { name: 'Copy' }).last().click();
  const dialog = this.page!.getByRole('dialog', { name: 'Create Version' });
  await dialog.getByLabel('Version Name *').fill('Issue 89 copied version');
  const responsePromise = this.page!.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/project-groups/${this.projectGroupId}/versions`));
  await dialog.getByRole('button', { name: 'Create' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  this.copiedProjectId = (await response.json()).data.id;
  this.copiedZoning = await readProjectZoning(this, this.copiedProjectId);
});

Then('every source zoning value is reproduced exactly once for its corresponding new Area', function (this: ZoningWorld) {
  expect(this.copiedZoning.map(({ areaName, parameterId, value }) => ({ areaName, parameterId, value }))).toEqual(
    this.sourceZoning.map(({ areaName, parameterId, value }) => ({ areaName, parameterId, value })),
  );
});

Then('every copied value references a new-version Area ID, never a source Area ID', function (this: ZoningWorld) {
  const sourceAreaIds = new Set(this.sourceZoning.map((entry) => entry.areaId));
  expect(this.copiedZoning.every((entry) => !sourceAreaIds.has(entry.areaId))).toBeTruthy();
});

Then("each copied value retains the source row's positive integer value and stable parameter identity", function (this: ZoningWorld) {
  expect(this.copiedZoning.every((entry) => Number.isInteger(entry.value) && entry.value > 0)).toBeTruthy();
  expect(this.copiedZoning.map((entry) => entry.parameterId)).toEqual(this.sourceZoning.map((entry) => entry.parameterId));
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

Given('an authenticated user without administrator privileges', async function (this: ZoningWorld) {
  await login(this);
  const email = `issue89-user-${Date.now()}@example.com`;
  const created = await this.page!.request.post(`${this.apiUrl}/api/users`, { headers: authHeaders(this), data: { email, password: 'Issue89User!', role: 'user' } });
  expect(created.status()).toBe(201);
  const response = await this.page!.request.post(`${this.apiUrl}/api/auth/login`, { data: { email, password: 'Issue89User!' } });
  this.token = (await response.json()).data.accessToken;
});
When('the user attempts to create, update, reorder, deactivate, reactivate, or delete a definition', async function (this: ZoningWorld) {
  const response = await this.page!.request.post(`${this.apiUrl}/api/item-types/1/zoning-parameters`, { headers: authHeaders(this), data: { name: 'Forbidden definition' } });
  this.lastStatus = response.status();
});
Then('the system MUST reject the request with `403 Forbidden`', async function (this: ZoningWorld) { expect(this.lastStatus).toBe(403); });
Then('MUST NOT change any definition or Area value', async function (this: ZoningWorld) { expect(this.lastStatus).toBe(403); });

Given('an authenticated non-global user supplies an Area or floorplan identifier belonging to another tenant', async function (this: ZoningWorld) {
  await setupArea(this, 1, 1);
  const tenantResponse = await this.page!.request.post(`${this.apiUrl}/api/tenants`, { headers: authHeaders(this), data: { name: `Foreign ${Date.now()}` } });
  const tenantId = (await tenantResponse.json()).data.id;
  const email = `foreign-${Date.now()}@example.com`;
  await this.page!.request.post(`${this.apiUrl}/api/users`, { headers: authHeaders(this), data: { email, password: 'Issue89Foreign!', role: 'user', tenant_id: tenantId } });
  const loginResponse = await this.page!.request.post(`${this.apiUrl}/api/auth/login`, { data: { email, password: 'Issue89Foreign!' } });
  this.token = (await loginResponse.json()).data.accessToken;
});
When('the request is processed', async function (this: ZoningWorld) { const response = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { name: 'Cross tenant mutation' } }); this.lastStatus = response.status(); });
Then('the system returns the same not-found response used for an inaccessible Area', async function (this: ZoningWorld) { expect(this.lastStatus).toBe(404); });
Then('performs no read disclosure or mutation', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); expect(response.status()).toBe(404); });

Given('an Area edit changes its name and includes several parameter values', async function (this: ZoningWorld) { await setupArea(this, 1, 2); await openAreaEditor(this); await this.page!.getByLabel('Name').fill('Retained Draft'); await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('7'); });
When('any submitted value or definition identity is invalid', async function (this: ZoningWorld) {
  const response = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { revision: this.areaRevision, applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 4 }, { parameter_id: this.parameterIds[1], value: 10000 }] } });
  this.lastStatus = response.status();
  expect(JSON.stringify(await response.json())).toMatch(/value|9999/i);
});
Then('the system rejects the request with field-level details', async function (this: ZoningWorld) { expect(this.lastStatus).toBe(400); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('7'); });
Then('neither the name nor any parameter value changes', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe('Review Area'); expect(area.zoning_groups[0].parameters.every((entry: { value: number }) => entry.value === 0)).toBeTruthy(); });

Given('a deactivated definition retains Area values', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [6]); const response = await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/deactivate`, { headers: authHeaders(this) }); expect(response.status()).toBe(200); });
When('an administrator reactivates it', async function (this: ZoningWorld) { const response = await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/activate`, { headers: authHeaders(this) }); expect(response.status()).toBe(200); });
Then('it reappears for applicable projects in configured order', async function (this: ZoningWorld) { await openAreaEditor(this); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toBeVisible(); });
Then('each Area exposes its retained value', async function (this: ZoningWorld) { await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('6'); });

Given("a Product Type was removed from a project's selected Product Types without deleting its values", async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [8]); const response = await this.page!.request.put(`${this.apiUrl}/api/projects/${this.projectId}`, { headers: authHeaders(this), data: { item_type_ids: [] } }); expect(response.status()).toBe(200); });
When('the active Product Type is selected again', async function (this: ZoningWorld) { const response = await this.page!.request.put(`${this.apiUrl}/api/projects/${this.projectId}`, { headers: authHeaders(this), data: { item_type_ids: this.itemTypeIds } }); expect(response.status()).toBe(200); });
Then('its active definitions become applicable', async function (this: ZoningWorld) { await openAreaEditor(this); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toBeVisible(); });
Then('the Area editor exposes retained values', async function (this: ZoningWorld) { await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('8'); });

Given('a user opened an Area editor', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); });
When('an administrator changes the applicable definition set before the user saves', async function (this: ZoningWorld) { await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('3'); await this.page!.getByLabel('Name').fill('Must not persist'); await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/deactivate`, { headers: authHeaders(this) }); await this.page!.getByRole('button', { name: 'Update' }).click(); });
Then('the save receives `409 Conflict`', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/changed|reload/i); });
Then('no Area property or value from that request is persisted', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); expect((await response.json()).data.name).toBe('Review Area'); await this.page!.getByRole('button', { name: 'Reload Area' }).click(); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveCount(0); });
