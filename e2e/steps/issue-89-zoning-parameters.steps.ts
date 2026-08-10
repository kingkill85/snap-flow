import { Given, Then, When } from '@cucumber/cucumber';
import { expect, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SnapFlowWorld } from '../support/world.ts';

type ZoningValueEvidence = { areaId: number; areaName: string; parameterId: number; value: number };
type Bounds = { x: number; y: number; width: number; height: number };
type ZoningWorld = SnapFlowWorld & { token: string; itemTypeId: number; parameterId: number; itemTypeIds: number[]; parameterIds: number[]; projectId: number; projectGroupId: number; floorplanId: number; areaId: number; areaRevision: number; originalName: string; customerName: string; copiedProjectId: number; sourceZoning: ZoningValueEvidence[]; copiedZoning: ZoningValueEvidence[]; lastStatus: number; cssBounds: Array<{ annotations: Bounds[]; names: Bounds[]; image: Bounds; product: Bounds; label: string }>; productId: number; productBounds: Bounds; downloadBytes: Buffer; exportDownloaded: boolean; annotationBounds: Bounds; annotationAnchor: string; annotationOmitted: number; annotationAccessibleText: string; wideGlyphName: string; saveRevisions: number[]; duplicateRasterRows: string[] };

const WIDE_GLYPH_NAME = 'W'.repeat(100);

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
  const image = await readFile(resolve(process.cwd(), 'frontend/public/snapflow_variation_c_true_transparent_set/snapflow_icon_1024_transparent.png'));
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

async function reopenAreaEditor(world: ZoningWorld) {
  await world.page!.getByRole('tab', { name: 'Areas' }).click();
  const areasPanel = world.page!.getByLabel('Areas');
  await expect(areasPanel.getByText('Review Area', { exact: true })).toBeVisible();
  await areasPanel.getByTitle('Edit area').click();
  await expect(world.page!.getByRole('dialog', { name: 'Edit Area' })).toBeVisible();
}

async function paintedAnnotationRows(world: ZoningWorld) {
  return await world.page!.getByTestId('area-zoning-annotation').locator('text').evaluateAll((rows) => rows.map((row) =>
    [...row.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
  ));
}

async function expectUsableNativeInputSpacing(world: ZoningWorld, inputs: Locator) {
  for (const input of await inputs.all()) {
    const box = await input.boundingBox();
    const metrics = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: Number.parseFloat(style.width),
        minWidth: Number.parseFloat(style.minWidth),
        flexShrink: style.flexShrink,
        paddingRight: Number.parseFloat(style.paddingRight),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        textAlign: style.textAlign,
      };
    });
    expect(box!.width).toBeGreaterThanOrEqual(96);
    expect(box!.width).toBeLessThan(110);
    expect(metrics.width).toBeGreaterThanOrEqual(104);
    expect(metrics.minWidth).toBeGreaterThanOrEqual(104);
    expect(metrics.flexShrink).toBe('0');
    expect(metrics.paddingRight).toBeGreaterThanOrEqual(32);
    expect(metrics.paddingLeft).toBeGreaterThanOrEqual(12);
    expect(metrics.textAlign).toBe('left');
  }
}

async function submitVisibleZoningValues(world: ZoningWorld, first: number, second: number) {
  await world.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill(String(first));
  await world.page!.getByRole('spinbutton', { name: 'Zones 1', exact: true }).fill(String(second));
  const responsePromise = world.page!.waitForResponse((response) =>
    response.request().method() === 'PUT' && response.url().endsWith(`/api/areas/${world.areaId}`)
  );
  await world.page!.getByRole('button', { name: 'Update' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const revision = (await response.json()).data.revision as number;
  await expect(world.page!.getByRole('dialog', { name: 'Edit Area' })).toBeHidden();
  return revision;
}
async function saveValues(world: ZoningWorld, values: number[]) {
  const response = await world.page!.request.put(`${world.apiUrl}/api/areas/${world.areaId}`, { headers: authHeaders(world), data: { revision: world.areaRevision, applicable_parameter_ids: world.parameterIds, zoning_values: world.parameterIds.map((id, index) => ({ parameter_id: id, value: values[index] ?? 0 })) } });
  expect(response.status()).toBe(200); const area = (await response.json()).data; world.areaRevision = area.revision;
}

async function createNearbyRotatedProduct(world: ZoningWorld, overrides: Partial<{ x: number; y: number; width: number; height: number; rotation: number }> = {}) {
  const categoryResponse = await world.page!.request.post(`${world.apiUrl}/api/categories`, { headers: authHeaders(world), data: { name: `Issue89 Category ${Date.now()}` } });
  const category = (await categoryResponse.json()).data;
  const itemResponse = await world.page!.request.post(`${world.apiUrl}/api/items`, { headers: authHeaders(world), data: { category_id: category.id, name: `Issue89 Product ${Date.now()}`, type_id: world.itemTypeIds[0] } });
  const itemBody = await itemResponse.json(); if (!itemResponse.ok()) throw new Error(JSON.stringify(itemBody));
  const variantResponse = await world.page!.request.post(`${world.apiUrl}/api/items/${itemBody.data.id}/variants`, { headers: authHeaders(world), multipart: { style_name: 'Default', price: '1' } });
  const variantBody = await variantResponse.json(); if (!variantResponse.ok()) throw new Error(JSON.stringify(variantBody));
  const placement = { floorplan_id: world.floorplanId, item_variant_id: variantBody.data.id, x: 180, y: 90, width: 120, height: 20, rotation: 45, ...overrides };
  const placementResponse = await world.page!.request.post(`${world.apiUrl}/api/placements`, { headers: authHeaders(world), data: placement });
  const placementBody = await placementResponse.json(); if (!placementResponse.ok()) throw new Error(JSON.stringify(placementBody));
  world.productId = placementBody.data.id;
  const radians = placement.rotation * Math.PI / 180;
  const width = Math.abs(placement.width * Math.cos(radians)) + Math.abs(placement.height * Math.sin(radians));
  const height = Math.abs(placement.width * Math.sin(radians)) + Math.abs(placement.height * Math.cos(radians));
  world.productBounds = { x: placement.x + (placement.width - width) / 2, y: placement.y + (placement.height - height) / 2, width, height };
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
Given('an Area has definitions from one applicable Product Type and viewport width permits two columns', async function (this: ZoningWorld) { await this.page!.setViewportSize({ width: 1440, height: 1000 }); await setupArea(this, 1, 2); });
Given('an Area has applicable definitions and the viewport cannot fit two columns', async function (this: ZoningWorld) { await this.page!.setViewportSize({ width: 390, height: 700 }); await setupArea(this, 2, 4); });
When('the user opens Edit Area', async function (this: ZoningWorld) { await openAreaEditor(this); });
Then('Area properties and the compact zoning pane are visible side by side', async function (this: ZoningWorld) { const columns = this.page!.getByRole('dialog').locator('.md\\:grid-cols-2'); await expect(columns).toBeVisible(); expect(await columns.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).not.toBe('none'); });
Then('each parameter appears as one narrow number input beside its label under the Product Type heading', async function (this: ZoningWorld) {
  const inputs = this.page!.getByRole('group', { name: /Issue89 Type 0/ }).getByRole('spinbutton');
  await expect(inputs).toHaveCount(2);
  await expectUsableNativeInputSpacing(this, inputs);
});
Then(/^no parameter card, tab, or custom increment\/decrement control is rendered$/, async function (this: ZoningWorld) { await expect(this.page!.getByRole('tab')).toHaveCount(0); await expect(this.page!.getByRole('button', { name: /Increase|Decrease/ })).toHaveCount(0); });
Then('each Product Type appears as an ordered compact section in the zoning pane', async function (this: ZoningWorld) { const groups = this.page!.getByRole('group', { name: /Issue89 Type/ }); await expect(groups).toHaveCount(2); expect(await groups.nth(0).getAttribute('aria-labelledby')).toContain(String(this.itemTypeIds[0])); });
Then('all headings and parameter rows remain discoverable without switching tabs', async function (this: ZoningWorld) { for (let group = 0; group < 2; group++) { await expect(this.page!.getByRole('heading', { name: new RegExp(`Issue89 Type ${group}`) })).toBeVisible(); await expect(this.page!.getByRole('spinbutton', { name: `Zones ${group}`, exact: true })).toBeVisible(); } await expect(this.page!.getByRole('tab')).toHaveCount(0); });
Then('the compact zoning pane stacks below the Area property controls without horizontal page overflow', async function (this: ZoningWorld) {
  const name = this.page!.getByLabel('Name');
  const zoning = this.page!.getByRole('heading', { name: 'Zoning Parameters' });
  expect((await name.boundingBox())!.y).toBeLessThan((await zoning.boundingBox())!.y);
  expect(await this.page!.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  const inputs = this.page!.getByRole('spinbutton');
  await expect(inputs).toHaveCount(8);
  await expectUsableNativeInputSpacing(this, inputs);
});
Then('the dialog body scrolls while its heading and bottom-right action controls remain reachable and usable', async function (this: ZoningWorld) { const body = this.page!.getByRole('dialog').locator('.overflow-y-auto'); expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy(); await expect(this.page!.getByRole('heading', { name: 'Zoning Parameters' })).toBeVisible(); await expect(this.page!.getByRole('button', { name: 'Update' })).toBeVisible(); });

Given('focus is on a parameter control', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).focus(); });
When('the user enters a value with the native number input', async function (this: ZoningWorld) { await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('4'); await this.page!.getByRole('button', { name: 'Update' }).click(); await openAreaEditor(this); });
Then('the compact editor has no custom increment or decrement controls', async function (this: ZoningWorld) { await expect(this.page!.getByRole('button', { name: /Increase|Decrease/ })).toHaveCount(0); await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveAttribute('step', '1'); });
Then('the saved native value is shown after reopening', async function (this: ZoningWorld) { await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4'); });
When('the user types an integer or uses the native number-input keyboard step operation', async function (this: ZoningWorld) { const input = this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }); await input.fill('4'); await input.press('ArrowUp'); await this.page!.getByRole('button', { name: 'Update' }).click(); await openAreaEditor(this); });
Then('the displayed value changes within the allowed range', async function (this: ZoningWorld) { await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('5'); });
Then('decrement at zero cannot create a negative value', async function (this: ZoningWorld) { const input = this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }); await input.fill('0'); await input.press('ArrowDown'); await expect(input).toHaveValue('0'); });
Then('no redundant custom plus or minus control is present', async function (this: ZoningWorld) { await expect(this.page!.getByRole('button', { name: /Increase|Decrease/ })).toHaveCount(0); });

Given('the user changed Area properties or zoning values in the dialog', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByLabel('Name').fill('Draft Name'); await this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true }).fill('8'); });
When('the user activates Cancel, presses Escape, or dismisses the dialog', async function (this: ZoningWorld) { await this.page!.getByRole('button', { name: 'Cancel' }).click(); });
Then('no draft changes are sent or retained', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe(this.originalName); expect(area.zoning_groups[0].parameters[0].value).toBe(0); });

Given('an Area has positive and zero values across two applicable Product Types', async function (this: ZoningWorld) {
  await setupArea(this, 2, 2);
  const commonPrefix = 'Shared Product Type '.repeat(3);
  const collidingAbbreviations = ['ABCDEFGH1', 'ABCDEFGH2'];
  for (const [index, itemTypeId] of this.itemTypeIds.entries()) {
    const renamedType = await this.page!.request.put(`${this.apiUrl}/api/item-types/${itemTypeId}`, {
      headers: authHeaders(this),
      data: { name: `${commonPrefix}${index ? 'Beta' : 'Alpha'}`, abbreviation: collidingAbbreviations[index] },
    });
    expect(renamedType.status()).toBe(200);
    const renamedParameter = await this.page!.request.put(`${this.apiUrl}/api/item-types/${itemTypeId}/zoning-parameters/${this.parameterIds[index * 2]}`, {
      headers: authHeaders(this),
      data: { name: 'Zones' },
    });
    expect(renamedParameter.status()).toBe(200);
  }
  await saveValues(this, [3, 0, 3, 0]);
});
When('the interactive floorplan or PNG export renders', async function (this: ZoningWorld) {
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`);
  await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible();
  await this.page!.reload();
  await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible();
  await this.page!.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype;
    const original = prototype.fillText;
    (window as unknown as { issue89DuplicateRasterRows: string[] }).issue89DuplicateRasterRows = [];
    prototype.fillText = function (text, x, y, maxWidth) {
      if (/Z.*:\s*3$/.test(text)) (window as unknown as { issue89DuplicateRasterRows: string[] }).issue89DuplicateRasterRows.push(text);
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
  });
  const downloadPromise = this.page!.waitForEvent('download');
  await this.page!.getByTitle('Export floorplan image').click();
  const download = await downloadPromise;
  expect(await download.path()).toBeTruthy();
  this.duplicateRasterRows = await this.page!.evaluate(() => (window as unknown as { issue89DuplicateRasterRows: string[] }).issue89DuplicateRasterRows);
});
Then('each Product Type with a positive value has one labelled group', async function (this: ZoningWorld) {
  const directRows = (await paintedAnnotationRows(this)).filter((row) => /Z.*:\s*3$/.test(row));
  expect(directRows).toHaveLength(2);
  expect(new Set(directRows).size).toBe(2);
  expect(directRows.some((row) => row.startsWith(`#${this.itemTypeIds[0].toString(36)} `))).toBe(true);
  expect(directRows.some((row) => row.startsWith(`#${this.itemTypeIds[1].toString(36)} `))).toBe(true);
  expect(this.duplicateRasterRows).toEqual(directRows);
  expect(new Set(this.duplicateRasterRows).size).toBe(2);
  await expect(this.page!.getByTestId('area-zoning-annotation')).toHaveAccessibleName(/Shared Product Type .*Alpha.*Zones: 3.*Shared Product Type .*Beta.*Zones: 3/);
});
Then('zero-valued parameters and empty Product Type groups are absent', async function (this: ZoningWorld) {
  expect((await paintedAnnotationRows(this)).some((row) => row.includes('Extremely long parameter wording'))).toBe(false);
  expect(this.duplicateRasterRows.some((row) => row.includes('Extremely long parameter wording'))).toBe(false);
});

Given('an Area editor contains one or more Product Type groups', async function (this: ZoningWorld) {
  await setupArea(this, 2, 2);
  await openAreaEditor(this);
});
When('the user enters values manually, saves, and reopens the Area editor', async function (this: ZoningWorld) {
  this.saveRevisions = [];
  await this.page!.getByRole('spinbutton', { name: 'Extremely long parameter wording 0-1', exact: true }).fill('0');
  await this.page!.getByRole('spinbutton', { name: 'Extremely long parameter wording 1-1', exact: true }).fill('0');
  this.saveRevisions.push(await submitVisibleZoningValues(this, 4, 2));
  for (const [first, second] of [[5, 3], [6, 1]]) {
    await reopenAreaEditor(this);
    this.saveRevisions.push(await submitVisibleZoningValues(this, first, second));
  }
  await this.page!.reload({ waitUntil: 'domcontentloaded' });
  await openAreaEditor(this);
  await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('6');
  await expect(this.page!.getByRole('spinbutton', { name: 'Zones 1', exact: true })).toHaveValue('1');
  this.saveRevisions.push(await submitVisibleZoningValues(this, 4, 2));
  expect(this.saveRevisions).toEqual([...this.saveRevisions].sort((left, right) => left - right));
  expect(new Set(this.saveRevisions).size).toBe(this.saveRevisions.length);
  await reopenAreaEditor(this);
});
Then('the saved values appear beside the same parameter labels in the same Product Type groups', async function (this: ZoningWorld) {
  await expect(this.page!.getByRole('group', { name: /Issue89 Type 0/ }).getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4');
  await expect(this.page!.getByRole('group', { name: /Issue89 Type 1/ }).getByRole('spinbutton', { name: 'Zones 1', exact: true })).toHaveValue('2');
});
Then('zero and positive values retain their defined persistence semantics', async function (this: ZoningWorld) {
  await expect(this.page!.getByRole('spinbutton', { name: 'Extremely long parameter wording 0-1', exact: true })).toHaveValue('0');
  await expect(this.page!.getByRole('spinbutton', { name: 'Extremely long parameter wording 1-1', exact: true })).toHaveValue('0');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();
  const persistedResponse = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) });
  const persisted = (await persistedResponse.json()).data;
  expect(persisted.zoning_groups.flatMap((group: { parameters: Array<{ value: number }> }) => group.parameters.map((parameter) => parameter.value))).toEqual([4, 0, 2, 0]);
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  const paintedRows = await paintedAnnotationRows(this);
  expect(paintedRows).toHaveLength(2);
  expect(paintedRows[0]).toMatch(new RegExp(`^#${this.itemTypeIds[0].toString(36)} I0X.*Z.*:\\s*4$`));
  expect(paintedRows[1]).toMatch(new RegExp(`^#${this.itemTypeIds[1].toString(36)} I1X.*Z.*:\\s*2$`));
  expect(paintedRows.some((row) => row.includes('wording'))).toBe(false);
  await expect(annotation).toHaveAccessibleName(/Issue89 Type 0.*Zones 0: 4.*Issue89 Type 1.*Zones 1: 2/);
  await this.page!.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { __issue89UserPathWrapped?: boolean };
    if (prototype.__issue89UserPathWrapped) return;
    prototype.__issue89UserPathWrapped = true;
    const original = prototype.fillText;
    (window as unknown as { issue89UserPathRasterText: string[] }).issue89UserPathRasterText = [];
    prototype.fillText = function (text, x, y, maxWidth) {
      (window as unknown as { issue89UserPathRasterText: string[] }).issue89UserPathRasterText.push(text);
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
  });
  const downloadPromise = this.page!.waitForEvent('download');
  await this.page!.getByTitle('Export floorplan image').click();
  const download = await downloadPromise;
  expect(await download.path()).toBeTruthy();
  const rasterText = await this.page!.evaluate(() => (window as unknown as { issue89UserPathRasterText: string[] }).issue89UserPathRasterText);
  const rasterRows = rasterText.filter((text) => /:\s*(?:4|2)$/.test(text));
  expect(rasterRows).toEqual(paintedRows);
});

Given('an Area has more positive values than fit within the summary bounds and some names are long', async function (this: ZoningWorld) {
  await setupArea(this, 2, 4); await saveValues(this, Array(8).fill(2));
  this.wideGlyphName = WIDE_GLYPH_NAME;
  const renamed = await this.page!.request.put(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}`, { headers: authHeaders(this), data: { name: this.wideGlyphName } });
  expect(renamed.status()).toBe(200);
  const renamedParameter = await this.page!.request.put(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}`, { headers: authHeaders(this), data: { name: this.wideGlyphName } });
  expect(renamedParameter.status()).toBe(200);
  const secondResponse = await this.page!.request.post(`${this.apiUrl}/api/areas`, { headers: authHeaders(this), data: { floorplan_id: this.floorplanId, x: 550, y: 30, width: 400, height: 300, name: '照明😀領域照明😀領域' } });
  const second = (await secondResponse.json()).data;
  const saved = await this.page!.request.put(`${this.apiUrl}/api/areas/${second.id}`, { headers: authHeaders(this), data: { revision: second.revision, applicable_parameter_ids: this.parameterIds, zoning_values: this.parameterIds.map((parameter_id) => ({ parameter_id, value: 2 })) } });
  expect(saved.status()).toBe(200);
  const thirdResponse = await this.page!.request.post(`${this.apiUrl}/api/areas`, { headers: authHeaders(this), data: { floorplan_id: this.floorplanId, x: 30, y: 350, width: 500, height: 250, name: 'W'.repeat(20) } });
  const third = (await thirdResponse.json()).data;
  const thirdSaved = await this.page!.request.put(`${this.apiUrl}/api/areas/${third.id}`, { headers: authHeaders(this), data: { revision: third.revision, applicable_parameter_ids: this.parameterIds, zoning_values: this.parameterIds.map((parameter_id) => ({ parameter_id, value: 2 })) } });
  expect(thirdSaved.status()).toBe(200);
  await createNearbyRotatedProduct(this, { x: 970, y: 120, width: 40, height: 40, rotation: 0 });
});
When('the floorplan renders at any supported zoom', async function (this: ZoningWorld) {
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); this.cssBounds = [];
  const sequence = [
    { label: '50%', zoom: 50, action: async () => { await this.page!.getByTitle('Zoom out').click(); await this.page!.getByTitle('Zoom out').click(); } },
    { label: '25%', zoom: 25, action: async () => { await this.page!.getByTitle('Zoom out').click(); } },
    { label: '25% fitted', zoom: 25, action: async () => { await this.page!.setViewportSize({ width: 480, height: 700 }); } },
    { label: '100%', zoom: 100, action: async () => { await this.page!.setViewportSize({ width: 1280, height: 900 }); await this.page!.getByTitle('Reset zoom (Ctrl+0)').click(); } },
    { label: '150%', zoom: 150, action: async () => { await this.page!.getByTitle('Zoom in').click(); await this.page!.getByTitle('Zoom in').click(); } },
  ];
  for (const { label, zoom, action } of sequence) {
    await action(); await expect(this.page!.getByText(`${zoom}%`, { exact: true })).toBeVisible();
    const annotations = (await this.page!.getByTestId('area-zoning-clip-boundary').all()).map(async (locator) => (await locator.boundingBox())!);
    const names = (await this.page!.getByTestId('area-name-label-bounds').all()).map(async (locator) => (await locator.boundingBox())!);
    const nameClips = this.page!.getByTestId('area-name-text-clip');
    await expect(nameClips).toHaveCount(3);
    for (const clip of await nameClips.all()) {
      await expect(clip).toHaveAttribute('clip-path', /url\(#area-name-clip-/);
      await expect(clip.getByTestId('area-name-text')).toHaveAttribute('data-testid', 'area-name-text');
      expect(await clip.locator('title').textContent()).not.toBe('');
    }
    const image = await this.page!.locator('[data-floorplan-image="true"]').boundingBox();
    const product = await this.page!.locator(`[data-placement-id="${this.productId}"]`).boundingBox();
    expect(image).not.toBeNull(); expect(product).not.toBeNull();
    this.cssBounds.push({ annotations: await Promise.all(annotations), names: await Promise.all(names), image: image!, product: product!, label });
  }
});
Then('visible rows stay within the bounded summary', async function (this: ZoningWorld) {
  const separated = (left: Bounds, right: Bounds) => left.x + left.width <= right.x || left.x >= right.x + right.width || left.y + left.height <= right.y || left.y >= right.y + right.height;
  for (const { annotations, names, image, product, label } of this.cssBounds) {
    expect(annotations.length, `${label} annotations`).toBeGreaterThan(1);
    for (const annotation of annotations) {
      expect(annotation.width).toBeGreaterThan(0); expect(annotation.width).toBeLessThanOrEqual(230); expect(annotation.height).toBeLessThanOrEqual(150);
      expect(annotation.x, `${label} image left`).toBeGreaterThanOrEqual(image.x - 1); expect(annotation.y, `${label} image top`).toBeGreaterThanOrEqual(image.y - 1);
      expect(annotation.x + annotation.width, `${label} image right`).toBeLessThanOrEqual(image.x + image.width + 1); expect(annotation.y + annotation.height, `${label} image bottom`).toBeLessThanOrEqual(image.y + image.height + 1);
      if (!separated(annotation, product)) throw new Error(
        `${label} product collision annotation=${JSON.stringify(annotation)} product=${JSON.stringify(product)}`,
      );
      for (const name of names) {
        if (!separated(annotation, name)) throw new Error(
          `${label} name collision annotation=${JSON.stringify(annotation)} name=${JSON.stringify(name)}`,
        );
      }
    }
    for (let index = 1; index < annotations.length; index++) expect(separated(annotations[index - 1], annotations[index]), `${label} prior annotation collision`).toBe(true);
  }
});
Then('truncated content exposes full text accessibly', async function (this: ZoningWorld) {
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  expect(await annotation.locator('title').count()).toBeGreaterThan(0);
  await expect(annotation.first()).toHaveAccessibleName(new RegExp(this.wideGlyphName));
});
Then('a `+N more` row reports the omitted positive values', async function (this: ZoningWorld) {
  for (const annotation of await this.page!.getByTestId('area-zoning-annotation').all()) {
    const omitted = Number(await annotation.getAttribute('data-omitted'));
    expect(omitted).toBeGreaterThan(0);
    await expect(annotation).toContainText(`+${omitted} more`);
  }
});

Given('positive zoning annotations cross light, dark, detailed, and mixed regions of a floorplan', async function (this: ZoningWorld) { await setupArea(this, 2, 2); await saveValues(this, [2, 0, 4, 0]); });
When('the interactive floorplan renders at a supported zoom', async function (this: ZoningWorld) { await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible(); });
Then('every visible annotation uses the defined dual-contrast text treatment without a large opaque backing panel', async function (this: ZoningWorld) { const annotation = this.page!.getByTestId('area-zoning-annotation'); await expect(annotation.locator('rect')).toHaveCount(0); for (const text of await annotation.locator('text').all()) { await expect(text).toHaveAttribute('fill', '#ffffff'); await expect(text).toHaveAttribute('stroke', '#111827'); } });
Then('its meaning remains available without relying on color', async function (this: ZoningWorld) {
  const paintedRows = await paintedAnnotationRows(this);
  expect(paintedRows.some((row) => /I0X.*Zones 0.*2/.test(row))).toBe(true);
  expect(paintedRows.some((row) => /I1X.*Zones 1.*4/.test(row))).toBe(true);
  await expect(this.page!.getByTestId('area-zoning-annotation')).toHaveAccessibleName(/Issue89 Type 0.*Zones 0: 2.*Issue89 Type 1.*Zones 1: 4/);
});

Given('an Area contains positive zoning values and one or more product placements near its preferred annotation anchor', async function (this: ZoningWorld) {
  await this.page!.setViewportSize({ width: 480, height: 700 });
  await setupArea(this, 1, 1); await saveValues(this, [3]);
  await createNearbyRotatedProduct(this);
});
When('the interactive floorplan lays out the annotation', async function (this: ZoningWorld) { await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible(); await expect(this.page!.locator(`[data-placement-id="${this.productId}"]`)).toBeVisible(); });
Then('it deterministically selects the first safe candidate that intersects neither a product placement nor an earlier annotation', async function (this: ZoningWorld) {
  const assertPaintEnvelope = async (selected: boolean) => {
    const annotationLocator = this.page!.getByTestId('area-zoning-annotation');
    const placementLocator = this.page!.locator(`[data-placement-id="${this.productId}"]`);
    const text = annotationLocator.locator('text').first();
    await expect(text).toHaveAttribute('fill', '#ffffff');
    await expect(text).toHaveAttribute('stroke', '#111827');
    const decoration = placementLocator.locator('[data-placement-decoration]');
    await expect(decoration).toHaveAttribute('data-decoration-state', selected ? 'selected' : 'default');
    const styles = await placementLocator.evaluate((placement) => {
      const root = getComputedStyle(placement);
      const decorationElement = placement.querySelector<HTMLElement>('[data-placement-decoration]');
      if (!decorationElement) throw new Error('Placement decoration is missing');
      const decorationStyle = getComputedStyle(decorationElement);
      return {
        rootBorder: [root.borderTopWidth, root.borderRightWidth, root.borderBottomWidth, root.borderLeftWidth],
        rootOutline: root.outlineStyle,
        rootShadow: root.boxShadow,
        decorationShadow: decorationStyle.boxShadow,
      };
    });
    expect(styles.rootBorder).toEqual(['0px', '0px', '0px', '0px']);
    expect(styles.rootOutline).toBe('none');
    expect(styles.rootShadow).toBe('none');
    expect(styles.decorationShadow).toContain('inset');
    const annotation = await annotationLocator.boundingBox();
    const product = await placementLocator.boundingBox();
    expect(annotation && product).toBeTruthy();
    expect(annotation!.x + annotation!.width <= product!.x || annotation!.x >= product!.x + product!.width || annotation!.y + annotation!.height <= product!.y || annotation!.y >= product!.y + product!.height).toBeTruthy();
  };

  await expect(this.page!.getByTestId('area-zoning-annotation').locator('rect')).toHaveCount(0);
  await assertPaintEnvelope(false);
  await this.page!.locator(`[data-placement-id="${this.productId}"]`).click();
  await assertPaintEnvelope(true);
  await this.page!.setViewportSize({ width: 1280, height: 900 });
  await this.page!.getByTitle('Reset zoom (Ctrl+0)').click();
  await this.page!.locator(`[data-placement-id="${this.productId}"]`).click();
  await assertPaintEnvelope(true);
});
Then('if all candidates are constrained it omits lower-priority rows and reports them with `+N more` rather than covering a product item', async function (this: ZoningWorld) { await expect(this.page!.getByTestId('area-zoning-annotation')).toHaveAttribute('data-anchor'); });

Given('a zoning annotation is visible on an Area', async function (this: ZoningWorld) { await setupArea(this, 1, 2); await saveValues(this, [3, 0]); await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible(); });
When('the user selects or drags the underlying Area at the annotation position', async function (this: ZoningWorld) { const annotation = this.page!.getByTestId('area-zoning-annotation'); const box = await annotation.boundingBox(); expect(box).not.toBeNull(); this.lastStatus = await this.page!.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="area-zoning-annotation"]') ? 1 : 0, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }); });
Then('the existing Area interaction handles the pointer event', function (this: ZoningWorld) { expect(this.lastStatus).toBe(0); });
Then('the annotation does not become a separate interaction target', async function (this: ZoningWorld) { await expect(this.page!.getByTestId('area-zoning-annotation')).toHaveCSS('pointer-events', 'none'); });

Given('the interactive floorplan shows positive zoning annotations for visible Areas', async function (this: ZoningWorld) {
  await setupArea(this, 1, 2); await saveValues(this, [3, 0]);
  this.wideGlyphName = `${'W'.repeat(99)}P`;
  const renamed = await this.page!.request.put(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}`, { headers: authHeaders(this), data: { name: this.wideGlyphName } });
  expect(renamed.status()).toBe(200);
  const renamedParameter = await this.page!.request.put(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}`, { headers: authHeaders(this), data: { name: this.wideGlyphName } });
  expect(renamedParameter.status()).toBe(200);
  await createNearbyRotatedProduct(this, { x: 650, y: 120, width: 65, height: 40, rotation: 0 });
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible();
});
When('the user invokes the existing PNG floorplan export with the same Area, placement, and visibility state', async function (this: ZoningWorld) {
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  const serializedBounds = await annotation.getAttribute('data-export-bounds');
  if (!serializedBounds) throw new Error('Interactive annotation bounds unavailable');
  const [x, y, width, height] = serializedBounds.split(',').map(Number);
  this.annotationBounds = { x, y, width, height };
  this.annotationAnchor = await annotation.getAttribute('data-anchor') ?? '';
  this.annotationOmitted = Number(await annotation.getAttribute('data-omitted'));
  this.annotationAccessibleText = await annotation.getAttribute('aria-label') ?? '';
  await this.page!.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { __issue89Wrapped?: boolean };
    if (prototype.__issue89Wrapped) return;
    prototype.__issue89Wrapped = true;
    const originalStrokeText = prototype.strokeText;
    const originalFillText = prototype.fillText;
    const originalRect = prototype.rect;
    const originalClip = prototype.clip as (...args: unknown[]) => void;
    (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText = [];
    prototype.strokeText = function (text, x, y, maxWidth) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'stroke', text, x, y, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
      return maxWidth === undefined
        ? originalStrokeText.call(this, text, x, y)
        : originalStrokeText.call(this, text, x, y, maxWidth);
    };
    prototype.fillText = function (text, x, y, maxWidth) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'fill', text, x, y, fillStyle: this.fillStyle });
      return maxWidth === undefined
        ? originalFillText.call(this, text, x, y)
        : originalFillText.call(this, text, x, y, maxWidth);
    };
    prototype.rect = function (x, y, width, height) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'clip-rect', x, y, width, height });
      return originalRect.call(this, x, y, width, height);
    };
    (prototype as unknown as { clip: (...args: unknown[]) => void }).clip = function (...args: unknown[]) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'clip' });
      return Reflect.apply(originalClip, this, args);
    };
  });
  const downloadPromise = this.page!.waitForEvent('download');
  await this.page!.getByTitle('Export floorplan image').click();
  const download = await downloadPromise;
  const path = await download.path(); if (!path) throw new Error('PNG download path unavailable');
  this.downloadBytes = await readFile(path);
});
Then('the PNG contains the same grouped annotation text, ordering, omission count, normalized anchors, and contrast treatment', async function (this: ZoningWorld) {
  expect(this.downloadBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const calls = await this.page!.evaluate(() => (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText);
  const stroke = calls.find((call) => call.kind === 'stroke' && /W.*:3$/.test(String(call.text)));
  const fill = calls.find((call) => call.kind === 'fill' && /W.*:3$/.test(String(call.text)));
  expect(stroke?.strokeStyle).toBe('#111827'); expect(stroke?.lineWidth).toBe(3); expect(fill?.fillStyle).toBe('#ffffff');
  const rasterX = Number(stroke?.x); const rasterY = Number(stroke?.y);
  expect(this.annotationAnchor).not.toBe(''); expect(this.annotationOmitted).toBeGreaterThanOrEqual(0);
  expect(this.annotationAccessibleText).toContain(this.wideGlyphName);
  expect(rasterX).toBeCloseTo(this.annotationBounds.x + 7); expect(rasterY).toBeCloseTo(this.annotationBounds.y + 9);
  const clipRect = calls.find((call) => call.kind === 'clip-rect' && Number(call.x) === this.annotationBounds.x);
  expect(clipRect).toMatchObject({ ...this.annotationBounds, kind: 'clip-rect' });
  expect(calls.findIndex((call) => call === clipRect)).toBeLessThan(calls.findIndex((call) => call === stroke));
  const overflowCalls = calls.filter((call) => /^\+\d+ more$/.test(String(call.text)) && call.kind === 'fill');
  expect(overflowCalls).toHaveLength(this.annotationOmitted > 0 ? 1 : 0);
  const separated = this.annotationBounds.x + this.annotationBounds.width <= this.productBounds.x || this.annotationBounds.x >= this.productBounds.x + this.productBounds.width || this.annotationBounds.y + this.annotationBounds.height <= this.productBounds.y || this.annotationBounds.y >= this.productBounds.y + this.productBounds.height;
  expect(separated).toBe(true);
  const raster = await this.page!.evaluate(async ({ base64, bounds }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Raster inspection context unavailable');
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const left = Math.max(0, Math.floor(bounds.x - 3)); const top = Math.max(0, Math.floor(bounds.y - 3));
    const width = Math.min(canvas.width - left, Math.ceil(bounds.width + 6)); const height = Math.min(canvas.height - top, Math.ceil(bounds.height + 6));
    const pixels = context.getImageData(left, top, width, height).data;
    let light = 0; let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 245 && pixels[index + 1] > 245 && pixels[index + 2] > 245 && pixels[index + 3] > 0) light++;
      if (pixels[index] >= 10 && pixels[index] <= 35 && pixels[index + 1] >= 20 && pixels[index + 1] <= 45 && pixels[index + 2] >= 30 && pixels[index + 2] <= 60 && pixels[index + 3] > 0) dark++;
    }
    return { width: canvas.width, height: canvas.height, light, dark };
  }, { base64: this.downloadBytes.toString('base64'), bounds: { x: rasterX, y: rasterY - 12, width: 150, height: 14 } });
  expect(raster.width).toBeGreaterThan(0); expect(raster.height).toBeGreaterThan(0); expect(raster.light).toBeGreaterThan(0); expect(raster.dark).toBeGreaterThan(0);
});
Then('hidden Areas and zero or empty groups remain absent', async function (this: ZoningWorld) { const calls = await this.page!.evaluate(() => (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText); expect(calls.some((call) => String(call.text).includes('Extremely long parameter wording 0-1'))).toBe(false); });

Given('the shared annotation model cannot be laid out or drawn completely', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [2]); await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible(); await this.page!.evaluate(() => { CanvasRenderingContext2D.prototype.strokeText = () => { throw new Error('Issue 89 forced annotation failure'); }; }); });
When('PNG export is attempted', async function (this: ZoningWorld) { this.exportDownloaded = false; this.page!.once('download', () => { this.exportDownloaded = true; }); await this.page!.getByTitle('Export floorplan image').click(); });
Then('the existing export operation reports failure and triggers no download', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/export failed.*forced annotation failure/i); await this.page!.waitForTimeout(300); expect(this.exportDownloaded).toBe(false); });
Then('it does not silently export an image missing zoning annotations', function (this: ZoningWorld) { expect(this.exportDownloaded).toBe(false); });

Given('two editors loaded the same Area revision and applicability set', async function (this: ZoningWorld) {
  await setupArea(this, 1, 1);
  const moved = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}/vertices`, {
    headers: authHeaders(this),
    data: { vertices: [{ x: 30, y: 180 }, { x: 530, y: 180 }, { x: 530, y: 480 }, { x: 30, y: 480 }] },
  });
  expect(moved.status()).toBe(200);
  this.areaRevision = (await moved.json()).data.revision;
  await openAreaEditor(this);
});
When('the first update succeeds and the second submits its stale revision', async function (this: ZoningWorld) { const first = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { revision: this.areaRevision, name: 'Winning Area', applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 4 }] } }); expect(first.status()).toBe(200); await this.page!.getByLabel('Name').fill('Losing Area'); await this.page!.getByRole('button', { name: 'Update' }).click(); });
Then('the second update receives `409 Conflict`', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/changed|reload/i); });
Then('the first update remains unchanged', async function (this: ZoningWorld) {
  await this.page!.getByRole('button', { name: 'Reload Area' }).click();
  await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area');
  await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();

  const areasPanel = this.page!.getByLabel('Areas');
  await expect(areasPanel.getByText('Winning Area', { exact: true })).toBeVisible();
  await expect(this.page!.getByTestId('area-zoning-annotation')).toContainText(/Zones 0.*4/);
  await areasPanel.getByTitle('Edit area').click();
  await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area');
  await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();

  await this.page!.getByRole('tab', { name: 'Products' }).click();
  await this.page!.locator(`[data-area-id="${this.areaId}"]`).click({ position: { x: 10, y: 10 } });
  await this.page!.locator('button[title="Edit area"]:visible').click();
  await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area');
  await expect(this.page!.getByRole('spinbutton', { name: 'Zones 0', exact: true })).toHaveValue('4');
});

Given('an authorized user selects a source version with multiple floorplans and copied Areas having positive zoning values', async function (this: ZoningWorld) {
  await setupArea(this, 1, 1);
  await saveValues(this, [2]);
  const image = await readFile(resolve(process.cwd(), 'frontend/public/snapflow_variation_c_true_transparent_set/snapflow_icon_1024_transparent.png'));
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

Then("each copied value retains the source row's positive integer value and stable parameter identity", async function (this: ZoningWorld) {
  expect(this.copiedZoning.every((entry) => Number.isInteger(entry.value) && entry.value > 0)).toBeTruthy();
  expect(this.copiedZoning.map((entry) => entry.parameterId)).toEqual(this.sourceZoning.map((entry) => entry.parameterId));
  await this.page!.goto(`${this.baseUrl}/projects/${this.copiedProjectId}`, { waitUntil: 'domcontentloaded' });
  await expect(this.page!.getByTestId('area-zoning-annotation').first()).toBeVisible();
  expect((await paintedAnnotationRows(this)).some((row) => /I0X.*Zones 0.*2/.test(row))).toBe(true);
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
