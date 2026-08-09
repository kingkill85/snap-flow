import { chromium } from '@playwright/test';
import { readPreviewSmokeContract } from './support/manual-preview-contract.ts';

const { route, email, password, expectedSha, phase, createdId, projectGroupId } =
  readPreviewSmokeContract(process.env);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${route}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${route}/`);

  // BuildVersion and /version are observed rather than echoed from requested inputs.
  await page.getByText(expectedSha, { exact: true }).waitFor();
  const versionResponse = await page.request.get(`${route}/version`);
  if (!versionResponse.ok()) throw new Error('preview version endpoint was unavailable');
  const observedSha = String((await versionResponse.json() as { sha?: unknown }).sha ?? '');
  const observedRoute = new URL(page.url()).origin;
  const observedViewport = page.viewportSize();
  if (!observedViewport) throw new Error('preview viewport was unavailable');
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  if (!token) throw new Error('authenticated preview token was not stored');
  const api = (path: string, init: RequestInit = {}) => page.evaluate(
    async ({ url, tokenValue, options }) => {
      const response = await fetch(url, { ...options, headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}`,
      }});
      return { status: response.status, body: await response.json() };
    }, { url: `${route}/api${path}`, tokenValue: token, options: init });

  await page.goto(`${route}/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
  await page.getByText(expectedSha, { exact: true }).waitFor();
  if (phase === 'create') {
    const name = `PREVIEW-SMOKE-${expectedSha.slice(0, 12)}`;
    const created = await api('/projects', { method: 'POST', body: JSON.stringify({
      customer_name: name, version_name: 'Manual preview persistence',
    }) });
    if (created.status !== 200 && created.status !== 201) throw new Error('preview project creation failed');
    const id = String((created.body as { data?: { id?: number } }).data?.id || '');
    const groupId = String((created.body as { data?: { project_group_id?: number } })
      .data?.project_group_id || '');
    if (!/^[1-9]\d*$/.test(id) || !/^[1-9]\d*$/.test(groupId)) {
      throw new Error('preview project did not return both identities');
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(name, { exact: false }).first().waitFor();
    console.log(JSON.stringify({ phase, route: observedRoute, sha: observedSha,
      created_id: id, project_group_id: groupId, reload_proven: true,
      mobile_viewport: observedViewport }));
  } else if (phase === 'verify-cleanup') {
    const existing = await api(`/projects/${createdId}`);
    if (existing.status !== 200) throw new Error('preview project did not persist across restart');
    const observedId = String((existing.body as { data?: { id?: unknown } }).data?.id ?? '');
    const observedGroupId = String((existing.body as { data?: { project_group_id?: unknown } })
      .data?.project_group_id ?? '');
    const group = await api(`/project-groups/${projectGroupId}`);
    const groupReadId = String((group.body as { data?: { id?: unknown } }).data?.id ?? '');
    if (group.status !== 200) throw new Error('preview project group did not persist across restart');
    const removed = await api(`/project-groups/${observedGroupId}`, { method: 'DELETE' });
    if (removed.status !== 200) throw new Error('preview project-group cleanup failed');
    const absentProject = await api(`/projects/${observedId}`);
    const absentGroup = await api(`/project-groups/${observedGroupId}`);
    if (absentProject.status !== 404 || absentGroup.status !== 404) {
      throw new Error('preview project-group cleanup did not remove both identities');
    }
    console.log(JSON.stringify({ phase, route: observedRoute, sha: observedSha,
      created_id: observedId, project_group_id: groupReadId,
      restart_proven: true, cleanup_proven: true,
      mobile_viewport: observedViewport }));
  } else {
    const removed = await api(`/project-groups/${projectGroupId}`, { method: 'DELETE' });
    if (removed.status !== 200 && removed.status !== 404) {
      throw new Error('preview project-group cleanup recovery failed');
    }
    const absentProject = await api(`/projects/${createdId}`);
    const absentGroup = await api(`/project-groups/${projectGroupId}`);
    if (absentProject.status !== 404 || absentGroup.status !== 404) {
      throw new Error('preview cleanup recovery did not prove both identities absent');
    }
    console.log(JSON.stringify({ phase, route: observedRoute, sha: observedSha,
      created_id: createdId, project_group_id: projectGroupId,
      cleanup_proven: true, mobile_viewport: observedViewport }));
  }
} finally {
  await browser.close();
}
