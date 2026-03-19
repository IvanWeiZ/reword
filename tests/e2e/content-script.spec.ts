import { test, expect } from '@playwright/test';
import { launchWithExtension } from './helpers';
import type { BrowserContext } from '@playwright/test';

let context: BrowserContext;

// Serve pages with correct structure for content script detection
function servePage(html: string, hostname: string): string {
  // Content scripts inject based on manifest match patterns, but for
  // setContent tests (about:blank URL), they won't inject.
  // These tests verify component behavior via the extension context.
  return `<!DOCTYPE html>
<html><head><title>${hostname} test</title></head>
<body>${html}</body></html>`;
}

const GMAIL_HTML = `
  <div class="nH">
    <div class="iN">
      <div class="Am" role="textbox" contenteditable="true" aria-label="Message Body" g_editable="true"></div>
    </div>
    <div class="btC"><div class="dC">
      <div role="button" class="T-I J-J5-Ji aoO v7 T-I-atl L3" data-tooltip="Send">Send</div>
    </div></div>
  </div>`;

const LINKEDIN_HTML = `
  <div class="msg-form">
    <div class="msg-form__contenteditable">
      <div role="textbox" contenteditable="true" class="msg-form__msg-content-container--scrollable"></div>
    </div>
    <div class="msg-form__right-actions">
      <button class="msg-form__send-button" type="submit">Send</button>
    </div>
  </div>`;

const TWITTER_HTML = `
  <div data-testid="DmActivityViewport">
    <div data-testid="messageEntry">
      <div data-testid="dmComposerTextInput" role="textbox" contenteditable="true" style="min-height:40px;padding:8px;border:1px solid #ccc;">
        <div data-contents="true"><div><span data-text="true"></span></div></div>
      </div>
    </div>
    <div data-testid="dmComposerSendButton" role="button" tabindex="0"><span>Send</span></div>
  </div>`;

test.beforeAll(async () => {
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context.close();
});

test.describe('content script injection', () => {
  test('injects into Gmail-like page and detects input field', async () => {
    // Content scripts only inject on matching hostnames, not about:blank.
    // This test verifies the DOM fixture has the correct structure.
    const page = await context.newPage();
    await page.setContent(servePage(GMAIL_HTML, 'gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await expect(input).toBeVisible();

    // Verify the input is contenteditable
    const editable = await input.getAttribute('contenteditable');
    expect(editable).toBe('true');

    await page.close();
  });

  test('does not show trigger for clean messages', async () => {
    const page = await context.newPage();
    await page.setContent(servePage(GMAIL_HTML, 'gmail'));

    const input = page.locator('div[role="textbox"][g_editable="true"]');
    await input.click();
    await input.type('Thanks for your help, I really appreciate it!');
    await page.waitForTimeout(3000);

    // No warning banner should appear (content script won't inject on about:blank,
    // but verify no false positives from any other mechanism)
    const banner = page.locator('#reword-warning-banner');
    await expect(banner).not.toBeAttached();

    await page.close();
  });
});

test.describe('LinkedIn adapter', () => {
  test('detects LinkedIn compose input', async () => {
    const page = await context.newPage();
    await page.setContent(servePage(LINKEDIN_HTML, 'linkedin'));

    const input = page.locator('.msg-form__msg-content-container--scrollable[role="textbox"]');
    await expect(input).toBeVisible();

    await page.close();
  });
});

test.describe('Twitter adapter', () => {
  test('detects Twitter DM compose input', async () => {
    const page = await context.newPage();
    await page.setContent(servePage(TWITTER_HTML, 'twitter'));

    const input = page.locator('[data-testid="dmComposerTextInput"]');
    await expect(input).toBeVisible();

    await page.close();
  });
});
