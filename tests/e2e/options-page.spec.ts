import { test, expect } from '@playwright/test';
import { launchWithExtension, getExtensionId } from './helpers';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let extensionId: string;

test.beforeAll(async () => {
  context = await launchWithExtension();
  extensionId = await getExtensionId(context);
});

test.beforeEach(async () => {
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
});

test.afterEach(async () => {
  await page.close();
});

test.afterAll(async () => {
  await context.close();
});

test('sensitivity selector changes value', async () => {
  const select = page.locator('#sensitivity');
  await expect(select).toBeVisible();

  await select.selectOption('high');
  expect(await select.inputValue()).toBe('high');

  await select.selectOption('low');
  expect(await select.inputValue()).toBe('low');
});

test('add and remove a relationship profile', async () => {
  // Open advanced settings (collapsed by default)
  await page.locator('details.advanced-settings summary').click();

  await page.fill('#new-profile-domain', 'example.com');
  await page.selectOption('#new-profile-type', 'romantic');
  await page.fill('#new-profile-label', 'Partner');
  await page.click('#add-profile');

  const profileItem = page.locator('.profile-item', { hasText: 'example.com' });
  await expect(profileItem).toBeVisible();
  await expect(profileItem).toContainText('romantic');

  await profileItem.locator('button').click();
  await expect(profileItem).not.toBeVisible();
});

test('add and remove a domain', async () => {
  // Open advanced settings
  await page.locator('details.advanced-settings summary').click();

  await page.fill('#new-domain', 'test.example.com');
  await page.click('#add-domain');

  const domainItem = page.locator('.domain-item', { hasText: 'test.example.com' });
  await expect(domainItem).toBeVisible();

  await domainItem.locator('button').click();
  await expect(domainItem).not.toBeVisible();
});

test('stats section is rendered', async () => {
  // Open advanced settings to reveal stats
  await page.locator('details.advanced-settings summary').click();

  const stats = page.locator('#stats');
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('Messages analyzed');
  await expect(stats).toContainText('API calls this month');
});
