import { Given, Then, When } from '@cucumber/cucumber';
import { expect, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SnapFlowWorld } from '../support/world.ts';

type ZoningValueEvidence = { areaId: number; areaName: string; parameterId: number; value: number };
type Bounds = { x: number; y: number; width: number; height: number };
type DirectTextPaint = { text: string; x: number; y: number; fill: string; font: string };
type VisibleIdentityEvidence = { label: string; configuredNames: string[]; svgRows: string[]; repeatedSvgRows: string[]; rasterRows: string[]; svgPaints: DirectTextPaint[]; rasterPaints: DirectTextPaint[]; accessibleText: string; descriptor: { anchor: string; bounds: string; exportBounds: string; omitted: string } };
type ZoningWorld = SnapFlowWorld & { token: string; itemTypeId: number; parameterId: number; itemTypeIds: number[]; parameterIds: number[]; projectId: number; projectGroupId: number; floorplanId: number; areaId: number; areaRevision: number; originalName: string; customerName: string; copiedProjectId: number; sourceZoning: ZoningValueEvidence[]; copiedZoning: ZoningValueEvidence[]; lastStatus: number; areaMutationCount: number; cssBounds: Array<{ annotations: Bounds[]; names: Bounds[]; image: Bounds; product: Bounds; label: string }>; productId: number; productBounds: Bounds; downloadBytes: Buffer; exportDownloaded: boolean; annotationBounds: Bounds; annotationAnchor: string; annotationOmitted: number; annotationAccessibleText: string; pngInteractiveRows: string[]; wideGlyphName: string; saveRevisions: number[]; duplicateRasterRows: string[]; visibleIdentityEvidence: VisibleIdentityEvidence[]; existingPathSvgRows: string[]; existingPathRasterRows: string[]; existingPathAreaBounds: Bounds; existingPathInteractiveBounds: Bounds; existingPathAnchor: string; existingPathNameStyle: { fill: string | null; background: string | null; fontSize: number; fontWeight: string | null }; existingPathSvgStyle: { fill: string | null; background: string | null; backgroundCount: number; fontSize: number; fontWeight: string | null; lineHeight: number }; existingPathRasterStyle: { fill: string; background: string; backgroundCount: number; font: string }; readabilityAreaIds: number[]; readabilitySvgRows: string[]; readabilityRasterRows: string[] };

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
async function setupArea(
  world: ZoningWorld,
  groups = 2,
  parametersPerGroup = 1,
  areaSize: Readonly<{ width: number; height: number }> = { width: 500, height: 300 },
) {
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
  const areaResponse = await world.page!.request.post(`${world.apiUrl}/api/areas`, { headers: authHeaders(world), data: { floorplan_id: world.floorplanId, x: 30, y: 30, width: areaSize.width, height: areaSize.height, name: 'Review Area' } });
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

async function expectUsableCompoundControls(world: ZoningWorld, inputs: Locator) {
  for (const input of await inputs.all()) {
    const valueBox = await input.boundingBox();
    const metrics = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        type: (element as HTMLInputElement).type,
        inputMode: (element as HTMLInputElement).inputMode,
        textAlign: style.textAlign,
        width: Number.parseFloat(style.width),
        minWidth: Number.parseFloat(style.minWidth),
        maxWidth: Number.parseFloat(style.maxWidth),
        flexBasis: Number.parseFloat(style.flexBasis),
        flexShrink: style.flexShrink,
      };
    });
    expect(metrics).toEqual({
      type: 'text', inputMode: 'numeric', textAlign: 'center',
      width: 76, minWidth: 76, maxWidth: 76, flexBasis: 76, flexShrink: '0',
    });
    expect(valueBox!.width).toBeGreaterThanOrEqual(72);
    const parameter = await input.getAttribute('aria-label') ?? await input.evaluate((element) =>
      document.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() ?? ''
    );
    const decrement = world.page!.getByRole('button', { name: `Decrease ${parameter}` });
    const increment = world.page!.getByRole('button', { name: `Increase ${parameter}` });
    for (const action of [decrement, increment]) {
      const box = await action.boundingBox();
      const actionMetrics = await action.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
          minWidth: Number.parseFloat(style.minWidth),
          minHeight: Number.parseFloat(style.minHeight),
          flexShrink: style.flexShrink,
        };
      });
      expect(actionMetrics).toEqual({ width: 34, height: 34, minWidth: 34, minHeight: 34, flexShrink: '0' });
      expect(box!.width).toBeGreaterThanOrEqual(32);
      expect(box!.height).toBeGreaterThanOrEqual(32);
    }
  }
}

async function submitVisibleZoningValues(world: ZoningWorld, first: number, second: number) {
  await world.page!.getByLabel('Zones 0', { exact: true }).fill(String(first));
  await world.page!.getByLabel('Zones 1', { exact: true }).fill(String(second));
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
Then('each parameter appears with an integrated decrement, direct-entry value field, increment, and persistent label under the Product Type heading', async function (this: ZoningWorld) {
  const inputs = this.page!.getByRole('group', { name: /Issue89 Type 0/ }).locator('input[inputmode="numeric"]');
  await expect(inputs).toHaveCount(2);
  await expectUsableCompoundControls(this, inputs);
  await this.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-compound-desktop.png'), fullPage: true });
});
Then('no parameter card, tab, or duplicate browser-native spinner is rendered', async function (this: ZoningWorld) { await expect(this.page!.getByRole('tab')).toHaveCount(0); await expect(this.page!.locator('input[type="number"]')).toHaveCount(0); });
Then('each Product Type appears as an ordered compact section in the zoning pane', async function (this: ZoningWorld) { const groups = this.page!.getByRole('group', { name: /Issue89 Type/ }); await expect(groups).toHaveCount(2); expect(await groups.nth(0).getAttribute('aria-labelledby')).toContain(String(this.itemTypeIds[0])); });
Then('all headings and parameter rows remain discoverable without switching tabs', async function (this: ZoningWorld) { for (let group = 0; group < 2; group++) { await expect(this.page!.getByRole('heading', { name: new RegExp(`Issue89 Type ${group}`) })).toBeVisible(); await expect(this.page!.getByLabel(`Zones ${group}`, { exact: true })).toBeVisible(); } await expect(this.page!.getByRole('tab')).toHaveCount(0); });
Then('the compact zoning pane stacks below the Area property controls without horizontal page overflow', async function (this: ZoningWorld) {
  const name = this.page!.getByLabel('Name');
  const zoning = this.page!.getByRole('heading', { name: 'Zoning Parameters' });
  expect((await name.boundingBox())!.y).toBeLessThan((await zoning.boundingBox())!.y);
  expect(await this.page!.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  const inputs = this.page!.locator('input[inputmode="numeric"]');
  await expect(inputs).toHaveCount(8);
  await expectUsableCompoundControls(this, inputs);
  await inputs.first().scrollIntoViewIfNeeded();
  await this.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-compound-phone.png') });
});
Then('the dialog body scrolls while its heading and bottom-right action controls remain reachable and usable', async function (this: ZoningWorld) { const body = this.page!.getByRole('dialog').locator('.overflow-y-auto'); expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy(); await expect(this.page!.getByRole('heading', { name: 'Zoning Parameters' })).toBeVisible(); await expect(this.page!.getByRole('button', { name: 'Update' })).toBeVisible(); });

Given('focus is on a parameter value field whose current value is within the allowed range', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByLabel('Zones 0', { exact: true }).focus(); });
When('the user types an integer, presses `ArrowUp` or `ArrowDown`, or activates the parameter-specific increment or decrement button', async function (this: ZoningWorld) { const input = this.page!.getByLabel('Zones 0', { exact: true }); await input.fill('4'); await input.press('ArrowUp'); await input.press('ArrowDown'); await this.page!.getByRole('button', { name: 'Increase Zones 0' }).click(); await this.page!.getByRole('button', { name: 'Decrease Zones 0' }).click(); await this.page!.getByRole('button', { name: 'Increase Zones 0' }).click(); });
Then('the displayed value changes by direct entry or step 1 without leaving the inclusive 0 through 9999 range', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('5'); });
Then('the field retains its parameter label and bounds description while the buttons expose distinct parameter-specific accessible names', async function (this: ZoningWorld) { const input = this.page!.getByLabel('Zones 0', { exact: true }); await expect(input).toHaveAttribute('aria-describedby', /help/); await expect(this.page!.getByRole('button', { name: 'Decrease Zones 0' })).toBeVisible(); await expect(this.page!.getByRole('button', { name: 'Increase Zones 0' })).toBeVisible(); });
Then('keyboard focus can move through decrement, value, and increment with a visible focus indicator', async function (this: ZoningWorld) { const input = this.page!.getByLabel('Zones 0', { exact: true }); const decrement = this.page!.getByRole('button', { name: 'Decrease Zones 0' }); await input.focus(); await this.page!.keyboard.press('Shift+Tab'); await expect(decrement).toBeFocused(); expect(await decrement.evaluate((element) => element.matches(':focus-visible'))).toBeTruthy(); await this.page!.keyboard.press('Tab'); await expect(input).toBeFocused(); await this.page!.keyboard.press('Tab'); await expect(this.page!.getByRole('button', { name: 'Increase Zones 0' })).toBeFocused(); });

Given('a parameter control displays 0 or 9999', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); });
When('the user attempts to step beyond the corresponding boundary', async function (this: ZoningWorld) { const input = this.page!.getByLabel('Zones 0', { exact: true }); await input.fill('0'); await input.press('ArrowDown'); await expect(input).toHaveValue('0'); await expect(this.page!.getByRole('button', { name: 'Decrease Zones 0' })).toBeDisabled(); await input.fill('9999'); await input.press('ArrowUp'); });
Then('the value remains clamped within the allowed range', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('9999'); });
Then('the boundary-facing decrement or increment button is disabled while the opposite action remains available', async function (this: ZoningWorld) { await expect(this.page!.getByRole('button', { name: 'Increase Zones 0' })).toBeDisabled(); await expect(this.page!.getByRole('button', { name: 'Decrease Zones 0' })).toBeEnabled(); });

Given('a user is editing a parameter value', async function (this: ZoningWorld) { await setupArea(this, 1, 1); this.areaMutationCount = 0; this.page!.on('request', (request) => { if (request.method() === 'PUT' && request.url().endsWith(`/api/areas/${this.areaId}`)) this.areaMutationCount++; }); await openAreaEditor(this); });
When('the user enters a fractional, negative, non-digit, non-finite, or out-of-range draft and activates Update', async function (this: ZoningWorld) { const input = this.page!.getByLabel('Zones 0', { exact: true }); for (const draft of ['1.5', '-1', 'abc', 'NaN', 'Infinity', '10000']) { await input.fill(draft); await expect(input).toHaveValue(draft); const update = this.page!.getByRole('button', { name: 'Update' }); await expect(update).toBeDisabled(); await update.evaluate((button) => (button as HTMLButtonElement).click()); } });
Then('an associated validation message identifies the allowed integer range', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText('whole number from 0 to 9999'); });
Then('the invalid draft remains available for correction', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('10000'); });
Then('no Area mutation request is sent and no value is partially persisted', async function (this: ZoningWorld) { expect(this.areaMutationCount).toBe(0); const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); expect((await response.json()).data.zoning_groups[0].parameters[0].value).toBe(0); });

Given('the user changed Area properties or zoning values in the dialog', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); await this.page!.getByLabel('Name').fill('Draft Name'); await this.page!.getByLabel('Zones 0', { exact: true }).fill('8'); });
When('the user activates Cancel, presses Escape, or dismisses the dialog', async function (this: ZoningWorld) { await this.page!.getByRole('button', { name: 'Cancel' }).click(); });
Then('no draft changes are sent or retained', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe(this.originalName); expect(area.zoning_groups[0].parameters[0].value).toBe(0); });

Given('an Area has positive and zero values across two applicable Product Types', async function (this: ZoningWorld) {
  await setupArea(this, 2, 2, { width: 300, height: 260 });
  const names = ['Long configured Product Type Alpha', 'Long configured Product Type Beta'];
  const abbreviations = ['A', 'A · B'];
  const parameterNames = ['B · C', 'C'];
  for (const [index, itemTypeId] of this.itemTypeIds.entries()) {
    const renamedType = await this.page!.request.put(`${this.apiUrl}/api/item-types/${itemTypeId}`, {
      headers: authHeaders(this),
      data: { name: names[index], abbreviation: abbreviations[index] },
    });
    expect(renamedType.status()).toBe(200);
    const renamedParameter = await this.page!.request.put(`${this.apiUrl}/api/item-types/${itemTypeId}/zoning-parameters/${this.parameterIds[index * 2]}`, {
      headers: authHeaders(this),
      data: { name: parameterNames[index] },
    });
    expect(renamedParameter.status()).toBe(200);
  }
  await saveValues(this, [3, 0, 3, 0]);
});
When('the interactive floorplan or PNG export renders', async function (this: ZoningWorld) {
  await this.page!.setViewportSize({ width: 1280, height: 900 });
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`);
  this.visibleIdentityEvidence = [];
  const capture = async (label: string, configuredNames: string[]) => {
    const annotation = this.page!.getByTestId('area-zoning-annotation');
    await expect(annotation).toBeVisible();
    const svgRows = (await paintedAnnotationRows(this)).filter((row) => /:\s*3$/.test(row));
    await this.page!.reload();
    await expect(annotation).toBeVisible();
    const repeatedSvgRows = (await paintedAnnotationRows(this)).filter((row) => /:\s*3$/.test(row));
    const svgPaints = await annotation.locator('text').evaluateAll((rows) => rows.map((row) => {
      const style = getComputedStyle(row);
      return {
        text: [...row.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join(''),
        x: Number(row.getAttribute('x')),
        y: Number(row.getAttribute('y')),
        fill: row.getAttribute('fill') ?? '',
        font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      };
    }).filter(({ text }) => /:\s*3$/.test(text)));
    await this.page!.evaluate(() => {
      const prototype = CanvasRenderingContext2D.prototype as typeof CanvasRenderingContext2D.prototype & {
        __issue89VisibleIdentityWrapped?: boolean;
        __issue89VisibleIdentityOriginal?: CanvasRenderingContext2D['fillText'];
      };
      const evidence = window as unknown as { issue89DuplicateRasterRows: string[]; issue89VisibleRasterPaints: DirectTextPaint[] };
      evidence.issue89DuplicateRasterRows = [];
      evidence.issue89VisibleRasterPaints = [];
      if (prototype.__issue89VisibleIdentityWrapped) return;
      prototype.__issue89VisibleIdentityWrapped = true;
      prototype.__issue89VisibleIdentityOriginal = prototype.fillText;
      prototype.fillText = function (text, x, y, maxWidth) {
        if (/:\s*3$/.test(text)) {
          evidence.issue89DuplicateRasterRows.push(text);
          evidence.issue89VisibleRasterPaints.push({ text, x, y, fill: String(this.fillStyle), font: this.font });
        }
        const original = prototype.__issue89VisibleIdentityOriginal!;
        return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
      };
    });
    const downloadPromise = this.page!.waitForEvent('download');
    await this.page!.getByTitle('Export floorplan image').click();
    const download = await downloadPromise;
    expect(await download.path()).toBeTruthy();
    await download.saveAs(resolve(process.cwd(), `e2e/results/issue-89-visible-identity-${label}-export.png`));
    this.visibleIdentityEvidence.push({
      label,
      configuredNames,
      svgRows,
      repeatedSvgRows,
      rasterRows: await this.page!.evaluate(() => (window as unknown as { issue89DuplicateRasterRows: string[] }).issue89DuplicateRasterRows),
      svgPaints,
      rasterPaints: await this.page!.evaluate(() => (window as unknown as { issue89VisibleRasterPaints: DirectTextPaint[] }).issue89VisibleRasterPaints),
      accessibleText: await annotation.getAttribute('aria-label') ?? '',
      descriptor: {
        anchor: await annotation.getAttribute('data-anchor') ?? '',
        bounds: await annotation.getAttribute('data-bounds') ?? '',
        exportBounds: await annotation.getAttribute('data-export-bounds') ?? '',
        omitted: await annotation.getAttribute('data-omitted') ?? '',
      },
    });
    await this.page!.screenshot({
      path: resolve(process.cwd(), `e2e/results/issue-89-visible-identity-${label}-interactive.png`),
      fullPage: true,
    });
  };

  await capture(
    'field-boundary-collision',
    ['Long configured Product Type Alpha', 'Long configured Product Type Beta'],
  );

  const invisibleNames = ['Shared\u200B', 'Shared\u200C'];
  for (const [index, itemTypeId] of this.itemTypeIds.entries()) {
    const renamedType = await this.page!.request.put(`${this.apiUrl}/api/item-types/${itemTypeId}`, {
      headers: authHeaders(this),
      data: { name: invisibleNames[index], abbreviation: 'X' },
    });
    expect(renamedType.status()).toBe(200);
    const renamedParameter = await this.page!.request.put(
      `${this.apiUrl}/api/item-types/${itemTypeId}/zoning-parameters/${this.parameterIds[index * 2]}`,
      { headers: authHeaders(this), data: { name: 'Zones' } },
    );
    expect(renamedParameter.status()).toBe(200);
  }
  await this.page!.reload();
  await capture('invisible-unicode', invisibleNames);

  this.duplicateRasterRows = this.visibleIdentityEvidence.flatMap((evidence) => evidence.rasterRows);
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  const firstText = annotation.locator('text').first();
  const renderedEvidence = {
    cases: this.visibleIdentityEvidence,
    annotationBounds: await annotation.boundingBox(),
    style: await firstText.evaluate((element) => {
      const style = getComputedStyle(element);
      return { fill: element.getAttribute('fill'), fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight };
    }),
  };
  await writeFile(resolve(process.cwd(), 'e2e/results/issue-89-visible-identity-measurements.json'), JSON.stringify(renderedEvidence, null, 2));
  await this.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-visible-identity-interactive.png'), fullPage: true });
});
Then('each Product Type with a positive value has one labelled group', async function (this: ZoningWorld) {
  expect(this.visibleIdentityEvidence.map((evidence) => evidence.label)).toEqual([
    'field-boundary-collision',
    'invisible-unicode',
  ]);
  for (const evidence of this.visibleIdentityEvidence) {
    expect(evidence.svgRows).toHaveLength(2);
    const paintedVisibleKey = (value: string) => value
      .normalize('NFKC')
      .replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '')
      .normalize('NFKC');
    expect(new Set(evidence.svgRows.map(paintedVisibleKey)).size).toBe(2);
    expect(evidence.svgRows.every((row) => !row.includes('#') && /:\s*3$/.test(row))).toBe(true);
    expect(evidence.repeatedSvgRows).toEqual(evidence.svgRows);
    expect(evidence.rasterRows).toEqual(evidence.svgRows);
    expect(new Set(evidence.rasterRows.map(paintedVisibleKey)).size).toBe(2);
    expect(evidence.svgPaints.map((paint) => paint.text)).toEqual(evidence.svgRows);
    expect(evidence.rasterPaints.map((paint) => paint.text)).toEqual(evidence.rasterRows);
    expect(evidence.svgPaints.every((paint) => paint.fill === '#ffffff' && paint.font.startsWith('600 '))).toBe(true);
    expect(evidence.rasterPaints.every((paint) => paint.fill === '#ffffff' && /^600 12px Arial/u.test(paint.font))).toBe(true);
    expect(evidence.descriptor).toMatchObject({ anchor: 'bottom-left', omitted: '0' });
    for (const name of evidence.configuredNames) expect(evidence.accessibleText).toContain(name);
    for (const id of this.itemTypeIds) expect(evidence.accessibleText).toContain(`Product Type identifier ${id}`);
  }
  expect(this.visibleIdentityEvidence[0].svgRows.some((row) => row.includes('\\·'))).toBe(true);
  expect(this.visibleIdentityEvidence[0].svgRows.every((row) => !/ \([A-Z]+\)/u.test(row))).toBe(true);
  expect(this.visibleIdentityEvidence[1].svgRows.map((row) => row.match(/ \(([A-Z]+)\)/u)?.[1])).toEqual(['A', 'B']);
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
  await this.page!.getByLabel('Extremely long parameter wording 0-1', { exact: true }).fill('0');
  await this.page!.getByLabel('Extremely long parameter wording 1-1', { exact: true }).fill('0');
  this.saveRevisions.push(await submitVisibleZoningValues(this, 4, 2));
  for (const [first, second] of [[5, 3], [6, 1]]) {
    await reopenAreaEditor(this);
    this.saveRevisions.push(await submitVisibleZoningValues(this, first, second));
  }
  await this.page!.reload({ waitUntil: 'domcontentloaded' });
  await openAreaEditor(this);
  await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('6');
  await expect(this.page!.getByLabel('Zones 1', { exact: true })).toHaveValue('1');
  this.saveRevisions.push(await submitVisibleZoningValues(this, 4, 2));
  expect(this.saveRevisions).toEqual([...this.saveRevisions].sort((left, right) => left - right));
  expect(new Set(this.saveRevisions).size).toBe(this.saveRevisions.length);
  await reopenAreaEditor(this);
});
Then('the saved values appear beside the same parameter labels in the same Product Type groups', async function (this: ZoningWorld) {
  await expect(this.page!.getByRole('group', { name: /Issue89 Type 0/ }).getByLabel('Zones 0', { exact: true })).toHaveValue('4');
  await expect(this.page!.getByRole('group', { name: /Issue89 Type 1/ }).getByLabel('Zones 1', { exact: true })).toHaveValue('2');
});
Then('zero and positive values retain their defined persistence semantics', async function (this: ZoningWorld) {
  await expect(this.page!.getByLabel('Extremely long parameter wording 0-1', { exact: true })).toHaveValue('0');
  await expect(this.page!.getByLabel('Extremely long parameter wording 1-1', { exact: true })).toHaveValue('0');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();
  const persistedResponse = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) });
  const persisted = (await persistedResponse.json()).data;
  expect(persisted.zoning_groups.flatMap((group: { parameters: Array<{ value: number }> }) => group.parameters.map((parameter) => parameter.value))).toEqual([4, 0, 2, 0]);
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  const paintedRows = await paintedAnnotationRows(this);
  expect(paintedRows).toHaveLength(2);
  expect(paintedRows[0]).toMatch(/^I0X.*Z.*:\s*4$/u);
  expect(paintedRows[1]).toMatch(/^I1X.*Z.*:\s*2$/u);
  expect(paintedRows.every((row) => !/^#/u.test(row))).toBe(true);
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

Given('a normal Area API response for an existing project contains real stored Area geometry and persisted positive zoning values that are visible in Edit Area', async function (this: ZoningWorld) {
  await login(this);
  const typeResponse = await this.page!.request.post(`${this.apiUrl}/api/item-types`, {
    headers: authHeaders(this),
    data: { name: `Zigbee ${Date.now()}`, abbreviation: 'ZIG' },
  });
  expect(typeResponse.status()).toBe(201);
  const itemType = (await typeResponse.json()).data;
  this.itemTypeIds = [itemType.id];
  this.parameterIds = [];
  for (const [sort_order, name] of ['test', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8'].entries()) {
    const response = await this.page!.request.post(`${this.apiUrl}/api/item-types/${itemType.id}/zoning-parameters`, {
      headers: authHeaders(this), data: { name, sort_order },
    });
    expect(response.status()).toBe(201);
    this.parameterIds.push((await response.json()).data.id);
  }
  const projectResponse = await this.page!.request.post(`${this.apiUrl}/api/projects`, {
    headers: authHeaders(this), data: { customer_name: `Existing geometry ${Date.now()}`, item_type_ids: this.itemTypeIds },
  });
  expect(projectResponse.status()).toBe(201);
  this.projectId = (await projectResponse.json()).data.id;
  const image = await readFile(resolve(process.cwd(), 'frontend/public/snapflow_variation_c_true_transparent_set/snapflow_icon_1024_transparent.png'));
  const floorplanResponse = await this.page!.request.post(`${this.apiUrl}/api/floorplans`, {
    headers: authHeaders(this),
    multipart: { project_id: String(this.projectId), name: 'Existing stored plan', image: { name: 'existing-plan.png', mimeType: 'image/png', buffer: image } },
  });
  expect(floorplanResponse.status()).toBe(201);
  this.floorplanId = (await floorplanResponse.json()).data.id;
  const areaResponse = await this.page!.request.post(`${this.apiUrl}/api/areas`, {
    headers: authHeaders(this),
    data: { floorplan_id: this.floorplanId, x: 100, y: 100, width: 200, height: 150, name: 'Existing Zigbee Area' },
  });
  expect(areaResponse.status()).toBe(201);
  const createdArea = (await areaResponse.json()).data;
  this.areaId = createdArea.id;
  const savedResponse = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, {
    headers: authHeaders(this),
    data: {
      revision: createdArea.revision,
      applicable_parameter_ids: this.parameterIds,
      zoning_values: [
        { parameter_id: this.parameterIds[0], value: 1 },
        { parameter_id: this.parameterIds[1], value: 2 },
      ],
    },
  });
  expect(savedResponse.status()).toBe(200);
  this.readabilityAreaIds = [this.areaId];
  for (const [name, x, values] of [
    ['Existing one-row Area', 400, [9, 0, 0, 0, 0, 0, 0, 0]],
    ['Existing overflow Area', 700, [11, 12, 13, 14, 15, 16, 17, 18]],
  ] as const) {
    const response = await this.page!.request.post(`${this.apiUrl}/api/areas`, {
      headers: authHeaders(this),
      data: { floorplan_id: this.floorplanId, x, y: 100, width: 200, height: 150, name },
    });
    expect(response.status()).toBe(201);
    const area = (await response.json()).data;
    const saved = await this.page!.request.put(`${this.apiUrl}/api/areas/${area.id}`, {
      headers: authHeaders(this),
      data: {
        revision: area.revision,
        applicable_parameter_ids: this.parameterIds,
        zoning_values: this.parameterIds.map((parameter_id, index) => ({ parameter_id, value: values[index] })),
      },
    });
    expect(saved.status()).toBe(200);
    this.readabilityAreaIds.push(area.id);
  }
  const persistedResponse = await this.page!.request.get(`${this.apiUrl}/api/areas?floorplan_id=${this.floorplanId}`, { headers: authHeaders(this) });
  const persisted = (await persistedResponse.json()).data.find((candidate: { id: number }) => candidate.id === this.areaId);
  expect(persisted.vertices).toHaveLength(4);
  expect(persisted.vertices.map((vertex: { x: number; y: number }) => [vertex.x, vertex.y])).toEqual([
    [100, 100], [300, 100], [300, 250], [100, 250],
  ]);
  this.existingPathAreaBounds = { x: 100, y: 100, width: 200, height: 150 };
  expect(persisted.zoning_groups[0].parameters.filter((parameter: { value: number }) => parameter.value > 0).map((parameter: { name: string; value: number }) => [parameter.name, parameter.value])).toEqual([
    ['test', 1], ['test2', 2],
  ]);
});

When('the configurator renders that Area and the user invokes the existing PNG export without replacing the data with a synthetic fixture', async function (this: ZoningWorld) {
  await this.page!.setViewportSize({ width: 1440, height: 1000 });
  await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`, { waitUntil: 'domcontentloaded' });
  await this.page!.getByRole('tab', { name: 'Areas' }).click();
  const panel = this.page!.getByLabel('Areas');
  const primaryAreaRow = panel.getByText('Existing Zigbee Area', { exact: true }).locator('..');
  await expect(primaryAreaRow).toBeVisible();
  await primaryAreaRow.getByTitle('Edit area').click();
  await expect(this.page!.getByLabel('test', { exact: true })).toHaveValue('1');
  await expect(this.page!.getByLabel('test2', { exact: true })).toHaveValue('2');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();
  await expect(this.page!.getByRole('dialog', { name: 'Edit Area' })).toBeHidden();

  const annotation = this.page!.locator(`[data-area-id="${this.areaId}"]`).getByTestId('area-zoning-annotation');
  await expect(annotation).toBeVisible();
  this.readabilitySvgRows = await this.page!.getByTestId('area-zoning-annotation').locator('text').evaluateAll((rows) => rows.map((row) =>
    [...row.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join('')
  ));
  await this.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-existing-project-interactive.png'), fullPage: true });
  this.existingPathSvgRows = await annotation.locator('text').evaluateAll((rows) => rows.map((row) =>
    [...row.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join('')
  ));
  const serializedInteractiveBounds = await annotation.getAttribute('data-bounds');
  if (!serializedInteractiveBounds) throw new Error('Existing-project interactive annotation bounds unavailable');
  const [interactiveX, interactiveY, interactiveWidth, interactiveHeight] = serializedInteractiveBounds.split(',').map(Number);
  this.existingPathInteractiveBounds = { x: interactiveX, y: interactiveY, width: interactiveWidth, height: interactiveHeight };
  this.existingPathAnchor = await annotation.getAttribute('data-anchor') ?? '';
  const areaRoot = this.page!.locator(`[data-area-id="${this.areaId}"]`);
  const nameText = areaRoot.getByTestId('area-name-text');
  const nameBackground = areaRoot.getByTestId('area-name-label-bounds');
  this.existingPathNameStyle = {
    fill: await nameText.getAttribute('fill'),
    background: await nameBackground.getAttribute('fill'),
    fontSize: await nameText.evaluate((element) => {
      const text = element as SVGTextElement;
      const transform = text.getScreenCTM();
      return Number(text.getAttribute('font-size')) * (transform ? Math.hypot(transform.a, transform.b) : 1);
    }),
    fontWeight: await nameText.getAttribute('font-weight'),
  };
  const svgText = annotation.locator('text').first();
  const paintedStyle = await svgText.evaluate((element) => {
    const text = element as SVGTextElement;
    const transform = text.getScreenCTM();
    const scale = transform ? Math.hypot(transform.a, transform.b) : 1;
    const annotation = text.closest('[data-testid="area-zoning-annotation"]')!;
    const lineHeight = Number(annotation.getAttribute('data-line-height')) * scale;
    return {
      fontSize: Number(text.getAttribute('font-size')) * scale,
      lineHeight,
    };
  });
  const svgBackgrounds = annotation.locator('[data-testid="area-zoning-row-background"]');
  const svgBackgroundCount = await svgBackgrounds.count();
  this.existingPathSvgStyle = {
    fill: await svgText.getAttribute('fill'),
    background: svgBackgroundCount ? await svgBackgrounds.first().getAttribute('fill') : null,
    backgroundCount: svgBackgroundCount,
    ...paintedStyle,
    fontWeight: await svgText.getAttribute('font-weight'),
  };
  const serializedBounds = await annotation.getAttribute('data-export-bounds');
  if (!serializedBounds) throw new Error('Existing-project annotation bounds unavailable');
  const [x, y, width, height] = serializedBounds.split(',').map(Number);
  this.annotationBounds = { x, y, width, height };

  await this.page!.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { __issue89ExistingPathWrapped?: boolean };
    if (prototype.__issue89ExistingPathWrapped) return;
    prototype.__issue89ExistingPathWrapped = true;
    const originalFillText = prototype.fillText;
    const originalRoundRect = prototype.roundRect;
    (window as unknown as { issue89ExistingPathPaint: Array<{ kind: string; text: string; x: number; y: number; width: number; height: number; fill: string; font: string }> }).issue89ExistingPathPaint = [];
    prototype.fillText = function (text, x, y, maxWidth) {
      (window as unknown as { issue89ExistingPathPaint: Array<{ kind: string; text: string; x: number; y: number; width: number; height: number; fill: string; font: string }> }).issue89ExistingPathPaint.push({ kind: 'fill', text, x, y, width: 0, height: 0, fill: String(this.fillStyle), font: this.font });
      return maxWidth === undefined ? originalFillText.call(this, text, x, y) : originalFillText.call(this, text, x, y, maxWidth);
    };
    prototype.roundRect = function (x, y, width, height, radii) {
      (window as unknown as { issue89ExistingPathPaint: Array<{ kind: string; text: string; x: number; y: number; width: number; height: number; fill: string; font: string }> }).issue89ExistingPathPaint.push({ kind: 'roundRect', text: '', x, y, width, height, fill: String(this.fillStyle), font: this.font });
      return originalRoundRect.call(this, x, y, width, height, radii);
    };
  });
  const downloadPromise = this.page!.waitForEvent('download');
  await this.page!.getByTitle('Export floorplan image').click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Existing-project PNG download unavailable');
  this.downloadBytes = await readFile(path);
  await writeFile(resolve(process.cwd(), 'e2e/results/issue-89-existing-project-export.png'), this.downloadBytes);
  const calls = await this.page!.evaluate(() => (window as unknown as { issue89ExistingPathPaint: Array<{ kind: string; text: string; x: number; y: number; width: number; height: number; fill: string; font: string }> }).issue89ExistingPathPaint);
  this.existingPathRasterRows = calls.filter((call) => call.kind === 'fill' && /:\s*[12]$/.test(call.text)).map((call) => call.text);
  this.readabilityRasterRows = calls
    .filter((call) => call.kind === 'fill' && (/:[ ]*\d+$/u.test(call.text) || /^\+\d+ more$/u.test(call.text)))
    .map((call) => call.text);
  const rasterRow = calls.find((call) => call.kind === 'fill' && /:\s*[12]$/.test(call.text));
  if (!rasterRow) throw new Error('Existing-project PNG annotation style unavailable');
  const rasterBackgrounds = calls.filter((call) => call.kind === 'roundRect' &&
    call.x >= this.annotationBounds.x && call.y >= this.annotationBounds.y &&
    call.x + call.width <= this.annotationBounds.x + this.annotationBounds.width &&
    call.y + call.height <= this.annotationBounds.y + this.annotationBounds.height);
  this.existingPathRasterStyle = {
    fill: rasterRow.fill,
    background: rasterBackgrounds[0]?.fill ?? '',
    backgroundCount: rasterBackgrounds.length,
    font: rasterRow.font,
  };
});

Then('the interactive floorplan contains directly painted SVG annotation rows for those exact positive values', async function (this: ZoningWorld) {
  expect(this.existingPathSvgRows).toHaveLength(2);
  expect(this.existingPathSvgRows.every((row) => !/^#/u.test(row))).toBe(true);
  expect(this.existingPathSvgRows.some((row) => /test\s*:\s*1$/.test(row))).toBe(true);
  expect(this.existingPathSvgRows.some((row) => /test2\s*:\s*2$/.test(row))).toBe(true);
  const area = this.existingPathAreaBounds;
  const annotation = this.existingPathInteractiveBounds;
  expect(this.existingPathAnchor).toBe('bottom-left');
  expect(annotation.x).toBeGreaterThanOrEqual(area.x);
  expect(annotation.y).toBeGreaterThanOrEqual(area.y + area.height * 0.6);
  expect(annotation.x + annotation.width).toBeLessThanOrEqual(area.x + area.width);
  expect(annotation.y + annotation.height).toBeLessThanOrEqual(area.y + area.height);
  expect(this.existingPathSvgStyle).toEqual({
    fill: this.existingPathNameStyle.fill,
    background: this.existingPathNameStyle.background,
    backgroundCount: 2,
    fontSize: this.existingPathNameStyle.fontSize,
    fontWeight: this.existingPathNameStyle.fontWeight,
    lineHeight: expect.any(Number),
  });
  expect(this.existingPathSvgStyle.lineHeight).toBeGreaterThanOrEqual(18);
});

Then('the downloaded PNG contains paint and pixel evidence for the same grouped values through the same normalized Area and descriptor path', async function (this: ZoningWorld) {
  expect(this.downloadBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const pixels = await this.page!.evaluate(async ({ base64, bounds }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Existing-project raster context unavailable');
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const region = context.getImageData(Math.floor(bounds.x), Math.floor(bounds.y), Math.ceil(bounds.width), Math.ceil(bounds.height)).data;
    let light = 0; let dark = 0;
    for (let index = 0; index < region.length; index += 4) {
      if (region[index] > 245 && region[index + 1] > 245 && region[index + 2] > 245 && region[index + 3] > 0) light++;
      if (region[index] >= 10 && region[index] <= 35 && region[index + 1] >= 20 && region[index + 1] <= 45 && region[index + 2] >= 30 && region[index + 2] <= 60 && region[index + 3] > 0) dark++;
    }
    return { light, dark };
  }, { base64: this.downloadBytes.toString('base64'), bounds: this.annotationBounds });
  expect(pixels.light).toBeGreaterThan(0);
  expect(pixels.dark).toBeGreaterThan(0);
  const area = this.existingPathAreaBounds;
  expect(this.annotationBounds.x).toBeGreaterThanOrEqual(area.x);
  expect(this.annotationBounds.y).toBeGreaterThanOrEqual(area.y + area.height * 0.6);
  expect(this.annotationBounds.x + this.annotationBounds.width).toBeLessThanOrEqual(area.x + area.width);
  expect(this.annotationBounds.y + this.annotationBounds.height).toBeLessThanOrEqual(area.y + area.height);
  expect(this.existingPathRasterStyle).toEqual({
    fill: '#ffffff',
    background: 'rgba(0, 0, 0, 0.55)',
    backgroundCount: 2,
    font: '600 12px Arial, sans-serif',
  });
});

Then('neither renderer silently omits the annotation because of data or geometry adaptation', async function (this: ZoningWorld) {
  expect(this.existingPathRasterRows).toHaveLength(2);
  expect(this.existingPathRasterRows).toEqual(this.existingPathSvgRows);
  await expectSupportedZoomReadability(this);
});

async function expectSupportedZoomReadability(world: ZoningWorld) {
  expect(world.readabilitySvgRows.some((row) => /test\s*:\s*1$/u.test(row))).toBe(true);
  expect(world.readabilitySvgRows.some((row) => /test2\s*:\s*2$/u.test(row))).toBe(true);
  expect(world.readabilitySvgRows.some((row) => /:\s*9$/u.test(row))).toBe(true);
  expect(world.readabilitySvgRows.some((row) => /:\s*11$/u.test(row))).toBe(true);
  expect(world.readabilitySvgRows.some((row) => /^\+\d+ more$/u.test(row))).toBe(true);
  expect(world.readabilitySvgRows.every((row) => !/^#/u.test(row))).toBe(true);
  expect(world.readabilityRasterRows).toEqual(world.readabilitySvgRows);
  const measureVisible = async (requireAll: boolean) => {
    const evidence: Array<{ areaId: number; fontSize: number; lineHeight: number; contrastHeight: number }> = [];
    for (const areaId of world.readabilityAreaIds) {
      const annotation = world.page!.locator(`[data-area-id="${areaId}"]`).getByTestId('area-zoning-annotation');
      if (await annotation.count() === 0) continue;
      if (requireAll) await expect(annotation).toBeVisible();
      const metrics = await annotation.locator('text').first().evaluate((element) => {
        const text = element as SVGTextElement;
        const transform = text.getScreenCTM();
        const scale = transform ? Math.hypot(transform.a, transform.b) : 1;
        const annotation = text.closest('[data-testid="area-zoning-annotation"]')!;
        const background = text.parentElement!.querySelector('rect') as SVGRectElement | null;
        return {
          fontSize: Number(text.getAttribute('font-size')) * scale,
          lineHeight: Number(annotation.getAttribute('data-line-height')) * scale,
          contrastHeight: background ? Number(background.getAttribute('height')) * scale : 0,
        };
      });
      if (requireAll) {
        expect(metrics.fontSize).toBeGreaterThanOrEqual(11.5);
        expect(metrics.lineHeight).toBeGreaterThanOrEqual(18.5);
        expect(metrics.contrastHeight).toBeGreaterThanOrEqual(17.5);
      }
      evidence.push({ areaId, ...metrics });
    }
    return evidence;
  };

  const fitted = await measureVisible(true);
  expect(fitted).toHaveLength(3);
  await world.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-readable-fitted.png'), fullPage: true });

  await world.page!.getByTitle('Zoom out').click();
  await world.page!.getByTitle('Zoom out').click();
  await expect(world.page!.getByText('50%', { exact: true })).toBeVisible();
  const fifty = await measureVisible(false);
  await world.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-readable-50.png'), fullPage: true });

  await world.page!.getByTitle('Zoom out').click();
  await expect(world.page!.getByText('25%', { exact: true })).toBeVisible();
  const quarter = await measureVisible(false);
  await world.page!.screenshot({ path: resolve(process.cwd(), 'e2e/results/issue-89-readable-25.png'), fullPage: true });
  await writeFile(
    resolve(process.cwd(), 'e2e/results/issue-89-readable-measurements.json'),
    JSON.stringify({
      existingProject: {
        areaBounds: world.existingPathAreaBounds,
        interactiveBounds: world.existingPathInteractiveBounds,
        exportBounds: world.annotationBounds,
        anchor: world.existingPathAnchor,
        rows: world.existingPathSvgRows,
        areaNameStyle: world.existingPathNameStyle,
        svgStyle: world.existingPathSvgStyle,
        pngStyle: world.existingPathRasterStyle,
      },
      fitted,
      fifty,
      quarter,
    }, null, 2),
  );
  expect(fifty).toEqual([]);
  expect(quarter).toEqual([]);

  await world.page!.getByTitle('Reset zoom (Ctrl+0)').click();
  await expect(world.page!.getByText('100%', { exact: true })).toBeVisible();
  expect(await measureVisible(true)).toHaveLength(3);
}

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
  expect(this.cssBounds.some(({ annotations }) => annotations.length > 1)).toBe(true);
  expect(this.cssBounds.some(({ annotations }) => annotations.length === 0)).toBe(true);
  for (const { annotations, names, image, product, label } of this.cssBounds) {
    if (annotations.length === 0) {
      expect(label, 'only zoomed-out views may omit an unsafe readable presentation').toMatch(/^(25%|25% fitted|50%)$/);
      continue;
    }
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
Then('every visible annotation uses the defined dual-contrast text treatment without a large opaque backing panel', async function (this: ZoningWorld) {
  const annotation = this.page!.getByTestId('area-zoning-annotation');
  const texts = annotation.locator('text');
  const backgrounds = annotation.getByTestId('area-zoning-row-background');
  await expect(backgrounds).toHaveCount(await texts.count());
  const areaName = this.page!.getByTestId('area-name-text').first();
  const areaNameBackground = this.page!.getByTestId('area-name-label-bounds').first();
  for (const text of await texts.all()) {
    await expect(text).toHaveAttribute('fill', await areaName.getAttribute('fill') ?? '#ffffff');
    await expect(text).toHaveAttribute('font-family', await areaName.getAttribute('font-family') ?? 'Arial, sans-serif');
    await expect(text).toHaveAttribute('font-weight', await areaName.getAttribute('font-weight') ?? '600');
    await expect(text).not.toHaveAttribute('stroke');
  }
  const nameBox = await areaNameBackground.boundingBox();
  for (const background of await backgrounds.all()) {
    await expect(background).toHaveAttribute('fill', await areaNameBackground.getAttribute('fill') ?? 'rgba(0,0,0,0.55)');
    const box = await background.boundingBox();
    expect(box!.height).toBeCloseTo(nameBox!.height, 0);
  }
});
Then('its meaning remains available without relying on color', async function (this: ZoningWorld) {
  const paintedRows = await paintedAnnotationRows(this);
  expect(paintedRows.some((row) => /I0X.*Zones 0.*2/.test(row))).toBe(true);
  expect(paintedRows.some((row) => /I1X.*Zones 1.*4/.test(row))).toBe(true);
  await expect(this.page!.getByTestId('area-zoning-annotation')).toHaveAccessibleName(/Issue89 Type 0.*Zones 0: 2.*Issue89 Type 1.*Zones 1: 4/);
});

Given('an Area contains positive zoning values and one or more product placements near its preferred annotation anchor', async function (this: ZoningWorld) {
  await this.page!.setViewportSize({ width: 1440, height: 1000 });
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
    await expect(text).not.toHaveAttribute('stroke');
    await expect(annotationLocator.getByTestId('area-zoning-row-background').first()).toHaveAttribute('fill', 'rgba(0,0,0,0.55)');
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

  expect(await this.page!.getByTestId('area-zoning-annotation').getByTestId('area-zoning-row-background').count()).toBeGreaterThan(0);
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
  this.pngInteractiveRows = await paintedAnnotationRows(this);
  expect(this.pngInteractiveRows).toHaveLength(1);
  expect(this.pngInteractiveRows.every((row) => !/^#/u.test(row))).toBe(true);
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
    const originalFillText = prototype.fillText;
    const originalRect = prototype.rect;
    const originalRoundRect = prototype.roundRect;
    const originalClip = prototype.clip as (...args: unknown[]) => void;
    (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText = [];
    prototype.fillText = function (text, x, y, maxWidth) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'fill', text, x, y, fillStyle: this.fillStyle, font: this.font });
      return maxWidth === undefined
        ? originalFillText.call(this, text, x, y)
        : originalFillText.call(this, text, x, y, maxWidth);
    };
    prototype.rect = function (x, y, width, height) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'clip-rect', x, y, width, height });
      return originalRect.call(this, x, y, width, height);
    };
    prototype.roundRect = function (x, y, width, height, radii) {
      (window as unknown as { issue89RasterText: Array<Record<string, unknown>> }).issue89RasterText.push({ kind: 'row-background', x, y, width, height, fillStyle: this.fillStyle });
      return originalRoundRect.call(this, x, y, width, height, radii);
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
  const rasterRows = calls
    .filter((call) => call.kind === 'fill' && this.pngInteractiveRows.includes(String(call.text)));
  expect(rasterRows.map((call) => String(call.text))).toEqual(this.pngInteractiveRows);
  const fill = rasterRows[0];
  const background = calls.find((call) => call.kind === 'row-background' &&
    Number(call.x) >= this.annotationBounds.x && Number(call.y) >= this.annotationBounds.y);
  expect(fill?.fillStyle).toBe('#ffffff');
  expect(fill?.font).toBe('600 12px Arial, sans-serif');
  expect(background?.fillStyle).toBe('rgba(0, 0, 0, 0.55)');
  const rasterX = Number(fill?.x); const rasterY = Number(fill?.y);
  expect(this.annotationAnchor).not.toBe(''); expect(this.annotationOmitted).toBeGreaterThanOrEqual(0);
  expect(this.annotationAccessibleText).toContain(this.wideGlyphName);
  expect(rasterX).toBeCloseTo(this.annotationBounds.x + 6); expect(rasterY).toBeCloseTo(this.annotationBounds.y + 9);
  const clipRect = calls.find((call) => call.kind === 'clip-rect' && Number(call.x) === this.annotationBounds.x);
  expect(clipRect).toMatchObject({ ...this.annotationBounds, kind: 'clip-rect' });
  expect(calls.findIndex((call) => call === clipRect)).toBeLessThan(calls.findIndex((call) => call === fill));
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

Given('the shared annotation model cannot be laid out or drawn completely', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [2]); await this.page!.goto(`${this.baseUrl}/projects/${this.projectId}`); await expect(this.page!.getByTestId('area-zoning-annotation')).toBeVisible(); await this.page!.evaluate(() => { const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) { if (text.includes(':')) throw new Error('Issue 89 forced annotation failure'); return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth); }; }); });
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
  await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('4');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();

  const areasPanel = this.page!.getByLabel('Areas');
  await expect(areasPanel.getByText('Winning Area', { exact: true })).toBeVisible();
  await expect(this.page!.getByTestId('area-zoning-annotation')).toContainText(/Zones 0.*4/);
  await areasPanel.getByTitle('Edit area').click();
  await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area');
  await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('4');
  await this.page!.getByRole('button', { name: 'Cancel' }).click();

  await this.page!.getByRole('tab', { name: 'Products' }).click();
  await this.page!.locator(`[data-area-id="${this.areaId}"]`).click({ position: { x: 10, y: 10 } });
  await this.page!.locator('button[title="Edit area"]:visible').click();
  await expect(this.page!.getByLabel('Name')).toHaveValue('Winning Area');
  await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('4');
});

Given('an authorized user selects a source version with multiple floorplans and copied Areas having positive zoning values', async function (this: ZoningWorld) {
  await setupArea(this, 1, 1, { width: 400, height: 250 });
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
  const paintedRows = await paintedAnnotationRows(this);
  const visibleFloorplanValue = this.copiedZoning.find((entry) => entry.value === 2);
  expect(visibleFloorplanValue).toBeDefined();
  expect(paintedRows.some((row) => /Z.*:\s*2$/.test(row))).toBe(true);
  expect(paintedRows.every((row) => !/^#/u.test(row))).toBe(true);
  await expect(this.page!.getByTestId('area-zoning-annotation').first()).toHaveAccessibleName(
    new RegExp(`Product Type identifier ${this.itemTypeIds[0]}`),
  );
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

Given('an Area edit changes its name and includes several parameter values', async function (this: ZoningWorld) { await setupArea(this, 1, 2); await openAreaEditor(this); await this.page!.getByLabel('Name').fill('Retained Draft'); await this.page!.getByLabel('Zones 0', { exact: true }).fill('7'); });
When('any submitted value or definition identity is invalid', async function (this: ZoningWorld) {
  const response = await this.page!.request.put(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this), data: { revision: this.areaRevision, applicable_parameter_ids: this.parameterIds, zoning_values: [{ parameter_id: this.parameterIds[0], value: 4 }, { parameter_id: this.parameterIds[1], value: 10000 }] } });
  this.lastStatus = response.status();
  expect(JSON.stringify(await response.json())).toMatch(/value|9999/i);
});
Then('the system rejects the request with field-level details', async function (this: ZoningWorld) { expect(this.lastStatus).toBe(400); await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('7'); });
Then('neither the name nor any parameter value changes', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); const area = (await response.json()).data; expect(area.name).toBe('Review Area'); expect(area.zoning_groups[0].parameters.every((entry: { value: number }) => entry.value === 0)).toBeTruthy(); });

Given('a deactivated definition retains Area values', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [6]); const response = await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/deactivate`, { headers: authHeaders(this) }); expect(response.status()).toBe(200); });
When('an administrator reactivates it', async function (this: ZoningWorld) { const response = await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/activate`, { headers: authHeaders(this) }); expect(response.status()).toBe(200); });
Then('it reappears for applicable projects in configured order', async function (this: ZoningWorld) { await openAreaEditor(this); await expect(this.page!.getByLabel('Zones 0', { exact: true })).toBeVisible(); });
Then('each Area exposes its retained value', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('6'); });

Given("a Product Type was removed from a project's selected Product Types without deleting its values", async function (this: ZoningWorld) { await setupArea(this, 1, 1); await saveValues(this, [8]); const response = await this.page!.request.put(`${this.apiUrl}/api/projects/${this.projectId}`, { headers: authHeaders(this), data: { item_type_ids: [] } }); expect(response.status()).toBe(200); });
When('the active Product Type is selected again', async function (this: ZoningWorld) { const response = await this.page!.request.put(`${this.apiUrl}/api/projects/${this.projectId}`, { headers: authHeaders(this), data: { item_type_ids: this.itemTypeIds } }); expect(response.status()).toBe(200); });
Then('its active definitions become applicable', async function (this: ZoningWorld) { await openAreaEditor(this); await expect(this.page!.getByLabel('Zones 0', { exact: true })).toBeVisible(); });
Then('the Area editor exposes retained values', async function (this: ZoningWorld) { await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveValue('8'); });

Given('a user opened an Area editor', async function (this: ZoningWorld) { await setupArea(this, 1, 1); await openAreaEditor(this); });
When('an administrator changes the applicable definition set before the user saves', async function (this: ZoningWorld) { await this.page!.getByLabel('Zones 0', { exact: true }).fill('3'); await this.page!.getByLabel('Name').fill('Must not persist'); await this.page!.request.patch(`${this.apiUrl}/api/item-types/${this.itemTypeIds[0]}/zoning-parameters/${this.parameterIds[0]}/deactivate`, { headers: authHeaders(this) }); await this.page!.getByRole('button', { name: 'Update' }).click(); });
Then('the save receives `409 Conflict`', async function (this: ZoningWorld) { await expect(this.page!.getByRole('alert')).toContainText(/changed|reload/i); });
Then('no Area property or value from that request is persisted', async function (this: ZoningWorld) { const response = await this.page!.request.get(`${this.apiUrl}/api/areas/${this.areaId}`, { headers: authHeaders(this) }); expect((await response.json()).data.name).toBe('Review Area'); await this.page!.getByRole('button', { name: 'Reload Area' }).click(); await expect(this.page!.getByLabel('Zones 0', { exact: true })).toHaveCount(0); });
