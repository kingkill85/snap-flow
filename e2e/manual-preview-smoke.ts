import { chromium } from '@playwright/test';
import { readPreviewSmokeContract } from './support/manual-preview-contract.ts';

const { route, email, password, expectedSha, phase, createdId } = readPreviewSmokeContract(process.env);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${route}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${route}/`);

  // BuildVersion proves the authenticated layout is the requested image.
  await page.getByText(expectedSha, { exact: true }).waitFor();
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
    if (!/^\d+$/.test(id)) throw new Error('preview project did not return an id');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(name, { exact: false }).first().waitFor();
    console.log(JSON.stringify({ route, sha: expectedSha, created_id: id,
      reload_proven: true, mobile_viewport: { width: 390, height: 844 } }));
  } else if (phase === 'verify-cleanup') {
    const existing = await api(`/projects/${createdId}`);
    if (existing.status !== 200) throw new Error('preview project did not persist across restart');
    const removed = await api(`/projects/${createdId}`, { method: 'DELETE' });
    if (removed.status !== 200) throw new Error('preview project cleanup failed');
    const absent = await api(`/projects/${createdId}`);
    if (absent.status !== 404) throw new Error('preview project cleanup was not repeatable');
    console.log(JSON.stringify({ route, sha: expectedSha, created_id: createdId,
      restart_proven: true, cleanup_proven: true,
      mobile_viewport: { width: 390, height: 844 } }));
  } else {
    const removed = await api(`/projects/${createdId}`, { method: 'DELETE' });
    if (removed.status !== 200 && removed.status !== 404) {
      throw new Error('preview project cleanup recovery failed');
    }
    console.log(JSON.stringify({ route, sha: expectedSha, created_id: createdId,
      cleanup_proven: true, mobile_viewport: { width: 390, height: 844 } }));
  }
} finally {
  await browser.close();
}
