import { chromium } from '@playwright/test';
import { readPreviewSmokeContract } from './support/manual-preview-contract.ts';

const { route, email, password, expectedSha } = readPreviewSmokeContract(process.env);

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
  await page.goto(`${route}/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
  await page.getByText(expectedSha, { exact: true }).waitFor();
  console.log(JSON.stringify({ route, sha: expectedSha,
    scenario: 'authenticated projects list at phone viewport' }));
} finally {
  await browser.close();
}
