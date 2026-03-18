import { test, expect } from '@playwright/test';
import { launchWithExtension, getExtensionId } from './helpers';
import type { BrowserContext } from '@playwright/test';

let context: BrowserContext;

test.beforeAll(async () => {
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context.close();
});

test('extension service worker loads successfully', async () => {
  const workers = context.serviceWorkers();
  expect(workers.length).toBeGreaterThan(0);

  const sw = workers[0];
  expect(sw.url()).toContain('service-worker.js');
});

test('extension has a valid ID', async () => {
  const id = await getExtensionId(context);
  expect(id).toMatch(/^[a-z]{32}$/);
});

test('options page is accessible', async () => {
  const id = await getExtensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/options/options.html`);

  await expect(page.locator('#api-key')).toBeVisible();
  await expect(page.locator('#sensitivity')).toBeVisible();
  await page.close();
});
