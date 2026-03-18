import { test, expect } from '@playwright/test';
import { launchWithExtension, buildTestPage } from './helpers';
import type { BrowserContext } from '@playwright/test';

let context: BrowserContext;

test.beforeAll(async () => {
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context.close();
});

test.describe('full analysis flow', () => {
  test('trigger appears for problematic message and popup shows rewrites', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type(
      'Whatever, I guess that works. Not like I had plans or anything. Thanks for nothing.',
    );

    // Wait for debounce (2s) + processing time
    await page.waitForTimeout(3500);

    // Trigger badge should appear
    const trigger = page.locator('text=Review tone');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Click trigger to open popup
    await trigger.click();
    const popup = page.locator('.reword-card');
    await expect(popup).toBeVisible({ timeout: 10000 });

    // Popup should contain the original message
    await expect(popup.locator('.reword-original')).toContainText('Whatever');

    // Popup should show risk indicator
    await expect(popup.locator('.reword-risk-indicator')).toBeVisible();

    // Popup should have action buttons
    await expect(popup.locator('.reword-send-original')).toBeVisible();
    await expect(popup.locator('.reword-cancel')).toBeVisible();

    await page.close();
  });

  test('send original button dismisses popup', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type('Whatever, I guess that works. Not like I had plans or anything.');
    await page.waitForTimeout(3500);

    const trigger = page.locator('text=Review tone');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();

    const popup = page.locator('.reword-card');
    await expect(popup).toBeVisible({ timeout: 10000 });

    // Click "Send original"
    await popup.locator('.reword-send-original').click();
    await expect(popup).not.toBeVisible();

    await page.close();
  });

  test('LinkedIn page with problematic text shows trigger', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('linkedin'));

    const input = page.locator('.msg-form__msg-content-container--scrollable[role="textbox"]');
    await input.click();
    await input.type('Per my last email, as I already mentioned, this is ridiculous.');
    await page.waitForTimeout(3500);

    // The heuristic should flag this
    const trigger = page.locator('text=Review tone');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test('Twitter page with problematic text shows trigger', async () => {
    const page = await context.newPage();
    await page.setContent(buildTestPage('twitter'));

    const input = page.locator('[data-testid="dmComposerTextInput"]');
    await input.click();
    await input.type('Whatever, I guess that works. Not like I had plans or anything.');
    await page.waitForTimeout(3500);

    const trigger = page.locator('text=Review tone');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    await page.close();
  });
});
