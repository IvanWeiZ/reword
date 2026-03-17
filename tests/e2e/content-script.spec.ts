import { test, expect } from '@playwright/test';
import { launchWithExtension, buildTestPage } from './helpers';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;

test.beforeAll(async () => {
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context.close();
});

test.describe('content script injection', () => {
  test('injects into Gmail-like page and detects input field', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    // The content script should detect the Gmail compose field
    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await expect(input).toBeVisible();

    // Type a passive-aggressive message and wait for debounce
    await input.click();
    await input.type('Whatever, I guess that works. Not like I had plans or anything.');
    // The content script debounces at 2 seconds
    await page.waitForTimeout(3000);

    // The trigger badge should appear for problematic messages
    const trigger = page.locator('text=Review tone');
    // Note: this depends on the heuristic scoring threshold
    await expect(trigger).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test('does not show trigger for clean messages', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type('Thanks for your help, I really appreciate it!');
    await page.waitForTimeout(3000);

    const trigger = page.locator('text=Review tone');
    await expect(trigger).not.toBeVisible();

    await page.close();
  });

  test('trigger click opens popup card', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type('Whatever, I guess that works. Not like I had plans or anything.');
    await page.waitForTimeout(3000);

    const trigger = page.locator('text=Review tone');
    await trigger.click();

    const popup = page.locator('.reword-card');
    await expect(popup).toBeVisible({ timeout: 10000 });

    // Popup should show the original message
    await expect(popup.locator('.reword-original')).toContainText('Whatever');

    // Should have dismiss/cancel buttons
    await expect(popup.locator('.reword-send-original')).toBeVisible();
    await expect(popup.locator('.reword-cancel')).toBeVisible();

    await page.close();
  });

  test('cancel button closes popup', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type('Whatever, I guess that works. Not like I had plans or anything.');
    await page.waitForTimeout(3000);

    const trigger = page.locator('text=Review tone');
    await trigger.click();

    const popup = page.locator('.reword-card');
    await expect(popup).toBeVisible({ timeout: 10000 });

    await popup.locator('.reword-cancel').click();
    await expect(popup).not.toBeVisible();

    await page.close();
  });
});

test.describe('LinkedIn adapter', () => {
  test('detects LinkedIn compose input', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('linkedin'));

    const input = page.locator('.msg-form__msg-content-container--scrollable[role="textbox"]');
    await expect(input).toBeVisible();

    await page.close();
  });
});

test.describe('Twitter adapter', () => {
  test('detects Twitter DM compose input', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('twitter'));

    const input = page.locator('[data-testid="dmComposerTextInput"]');
    await expect(input).toBeVisible();

    await page.close();
  });
});
