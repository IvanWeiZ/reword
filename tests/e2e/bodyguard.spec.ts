import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const shadowPierceCode = readFileSync(resolve(__dir, '../../dist/shadow-pierce.js'), 'utf-8');

// Text that scores above 0.38 threshold
const HARSH_TEXT = 'you are completely useless!!';
const PA_TEXT = 'per my last email, as I already mentioned';

// Mock AI result matching the expected schema
const MOCK_AI_RESULT = {
  type: 'reword-ai-result',
  result: {
    issues: ['Dismissive tone', 'Harsh language'],
    explanation: 'This message may come across as dismissive of their effort.',
    rewrites: [
      {
        label: 'Warmer',
        text: 'I appreciate your work, but I think we need to revisit this approach.',
      },
      { label: 'Direct', text: "Let's discuss a different approach to this." },
      { label: 'Minimal', text: 'Can we try a different approach?' },
    ],
  },
};

// Helper: set up a test page with shadow-pierce injected
async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(`<!DOCTYPE html>
<html><head><title>Bodyguard Test</title></head>
<body>
  <div contenteditable="true" role="textbox"
    style="border:1px solid #ccc;padding:10px;min-height:50px;font-family:system-ui;"></div>
  <button class="msg-form__send-button" type="submit" style="padding:8px 16px;margin-top:8px;">Send</button>
  <div id="log"></div>
</body></html>`);

  // Listen for messages before injecting shadow-pierce
  await page.evaluate(() => {
    (window as any).__messages = [];
    window.addEventListener('message', (e) => {
      if (e.data?.type?.startsWith('reword-')) {
        (window as any).__messages.push(e.data);
      }
    });
    // Track send attempts
    document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        document.getElementById('log')!.textContent = 'SENT';
      }
    });
  });

  await page.evaluate(shadowPierceCode);
  await page.waitForTimeout(1500); // Wait for editable caching
  return page;
}

// Helper: type text and trigger block
async function typeAndBlock(page: Page, text: string): Promise<void> {
  const input = page.locator('[contenteditable="true"]');
  await input.click();
  await input.fill(''); // Clear first
  await input.type(text);
  await input.press('Enter');
  await page.waitForTimeout(500);
}

// Helper: get the nonce from shadow-pierce
async function getNonce(page: Page): Promise<string> {
  return page.evaluate(() => {
    const msgs = (window as any).__messages as any[];
    const nonceMsg = msgs.find((m: any) => m.type === 'reword-nonce');
    return nonceMsg?.nonce ?? '';
  });
}

// Helper: post AI result with correct nonce
async function postAiResult(page: Page, result?: any): Promise<void> {
  const nonce = await getNonce(page);
  await page.evaluate(
    ({ nonce, result }) => {
      window.postMessage({ ...result, nonce }, '*');
    },
    { nonce, result: result ?? MOCK_AI_RESULT },
  );
  await page.waitForTimeout(300);
}

test.describe('Bodyguard: State Machine', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('block bar starts in ANALYZING state with spinner', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const bar = page.locator('#reword-block-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('role', 'alertdialog');
    // Should show analyzing message
    const text = await bar.textContent();
    expect(text).toContain('Analyzing');

    await page.close();
  });

  test('transitions to AI_RESULT state when reword-ai-result received', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    const bar = page.locator('#reword-block-bar');
    const text = await bar.textContent();
    expect(text).toContain('dismissive');
    // Rewrite buttons should be present
    expect(text).toContain('Warmer');
    expect(text).toContain('Direct');
    expect(text).toContain('Minimal');

    await page.close();
  });

  test('transitions to TIMED_OUT state after timeout', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    // Wait for timeout (5.5s + buffer)
    await page.waitForTimeout(6500);

    const bar = page.locator('#reword-block-bar');
    const text = await bar.textContent();
    expect(text).toContain("Couldn't analyze");

    await page.close();
  });

  test('unblocks when AI finds no issues', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const nonce = await getNonce(page);
    await page.evaluate(
      ({ nonce }) => {
        window.postMessage(
          {
            type: 'reword-ai-result',
            nonce,
            result: { issues: [], explanation: '', rewrites: [] },
          },
          '*',
        );
      },
      { nonce },
    );
    await page.waitForTimeout(300);

    await expect(page.locator('#reword-block-bar')).toBeHidden();

    await page.close();
  });
});

test.describe('Bodyguard: Keyboard Shortcuts', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('pressing 1 selects the first rewrite', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    // Press '1' to select first rewrite
    await page.keyboard.press('1');
    await page.waitForTimeout(500);

    // Should post reword-apply-rewrite
    const messages = await page.evaluate(() => (window as any).__messages as any[]);
    const applyMsg = messages.find((m: any) => m.type === 'reword-apply-rewrite');
    expect(applyMsg).toBeTruthy();
    expect(applyMsg.text).toContain('appreciate');

    await page.close();
  });

  test('pressing Escape dismisses bar and focuses input', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(page.locator('#reword-block-bar')).toBeHidden();

    // Input should be focused
    const focused = await page.evaluate(() =>
      document.activeElement?.getAttribute('contenteditable'),
    );
    expect(focused).toBe('true');

    await page.close();
  });

  test('pressing Enter sends anyway', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    // Message should have been sent
    expect(await page.locator('#log').textContent()).toContain('SENT');
    await expect(page.locator('#reword-block-bar')).toBeHidden();

    await page.close();
  });

  test('keyboard shortcuts only fire in ai-result state', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    // In ANALYZING state, pressing 1 should NOT do anything
    await page.keyboard.press('1');
    await page.waitForTimeout(300);

    const messages = await page.evaluate(() => (window as any).__messages as any[]);
    const applyMsg = messages.find((m: any) => m.type === 'reword-apply-rewrite');
    expect(applyMsg).toBeUndefined();

    // Bar should still be visible in analyzing state
    await expect(page.locator('#reword-block-bar')).toBeVisible();

    await page.close();
  });

  test('keyboard hint shows shortcut instructions', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    const barText = await page.locator('#reword-block-bar').textContent();
    expect(barText).toContain('1-3');
    expect(barText).toContain('Esc');

    await page.close();
  });
});

test.describe('Bodyguard: Undo Toast', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('undo toast appears after rewrite acceptance', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    // Accept first rewrite via keyboard
    await page.keyboard.press('1');
    await page.waitForTimeout(500);

    // Undo toast should be visible
    const bar = page.locator('#reword-block-bar');
    await expect(bar).toBeVisible();
    const text = await bar.textContent();
    expect(text).toContain('Undo');
    expect(text).toContain('Rewrite applied');

    await page.close();
  });

  test('undo toast auto-dismisses after 10 seconds', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    await page.keyboard.press('1');
    await page.waitForTimeout(500);

    // Toast visible
    await expect(page.locator('#reword-block-bar')).toBeVisible();

    // Wait for auto-dismiss (10s + buffer)
    await page.waitForTimeout(11000);

    await expect(page.locator('#reword-block-bar')).toBeHidden();

    await page.close();
  });
});

test.describe('Bodyguard: Dark Mode', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('CSS variables are injected', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const cssVarsTag = await page.locator('#reword-css-vars').count();
    expect(cssVarsTag).toBe(1);

    await page.close();
  });

  test('dark mode styles apply with prefers-color-scheme', async () => {
    const page = await setupPage(browser);

    // Emulate dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    await typeAndBlock(page, HARSH_TEXT);

    // The CSS variables style tag should exist and have dark mode rules
    const cssContent = await page.locator('#reword-css-vars').textContent();
    expect(cssContent).toContain('prefers-color-scheme: dark');

    await page.close();
  });
});

test.describe('Bodyguard: Suppression', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('suppressed phrases are not blocked', async () => {
    const page = await setupPage(browser);

    // Send suppressions with nonce
    const nonce = await getNonce(page);
    await page.evaluate(
      ({ nonce }) => {
        window.postMessage(
          {
            type: 'reword-suppressions',
            nonce,
            suppressions: [{ phrase: 'per my last email', recipientId: null }],
          },
          '*',
        );
      },
      { nonce },
    );
    await page.waitForTimeout(300);

    // Type PA text that includes the suppressed phrase
    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type('per my last email');
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Should NOT be blocked (phrase is suppressed)
    expect(await page.locator('#log').textContent()).toContain('SENT');

    await page.close();
  });

  test('contact-scoped suppression only applies for matching recipient', async () => {
    const page = await setupPage(browser);
    const nonce = await getNonce(page);

    // Suppress for specific recipient
    await page.evaluate(
      ({ nonce }) => {
        window.postMessage(
          {
            type: 'reword-suppressions',
            nonce,
            suppressions: [{ phrase: 'per my last email', recipientId: 'alice@example.com' }],
          },
          '*',
        );
        // Set current recipient to someone else
        window.postMessage(
          { type: 'reword-recipient-id', nonce, recipientId: 'bob@example.com' },
          '*',
        );
      },
      { nonce },
    );
    await page.waitForTimeout(300);

    // Type PA text — should still be blocked (different recipient)
    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(PA_TEXT);
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Should be blocked (suppression is for alice, we're talking to bob)
    expect(await page.locator('#log').textContent()).not.toContain('SENT');
    await expect(page.locator('#reword-block-bar')).toBeVisible();

    await page.close();
  });
});

test.describe('Bodyguard: Nonce Security', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('rejects messages without valid nonce', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    // Try to post AI result WITHOUT nonce
    await page.evaluate(() => {
      window.postMessage(
        {
          type: 'reword-ai-result',
          nonce: 'FAKE_NONCE',
          result: {
            issues: ['Injected'],
            explanation: 'HACKED',
            rewrites: [{ label: 'Evil', text: '<script>alert(1)</script>' }],
          },
        },
        '*',
      );
    });
    await page.waitForTimeout(300);

    // Bar should still show "Analyzing" (the fake message was rejected)
    const barText = await page.locator('#reword-block-bar').textContent();
    expect(barText).not.toContain('HACKED');
    expect(barText).toContain('Analyzing');

    await page.close();
  });

  test('accepts messages with valid nonce', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    // Post with correct nonce
    await postAiResult(page);

    const barText = await page.locator('#reword-block-bar').textContent();
    expect(barText).toContain('dismissive');

    await page.close();
  });
});

test.describe('Bodyguard: Accessibility', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('block bar has correct ARIA attributes', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const bar = page.locator('#reword-block-bar');
    await expect(bar).toHaveAttribute('role', 'alertdialog');
    await expect(bar).toHaveAttribute('aria-modal', 'true');

    await page.close();
  });

  test('buttons meet minimum touch target size', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);
    await postAiResult(page);

    // Check all buttons have min-height >= 44px
    const buttons = page.locator('#reword-block-bar button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const height = await buttons.nth(i).evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
    }

    await page.close();
  });
});

test.describe('Bodyguard: Zero/One Rewrite', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  test('shows explanation only when zero rewrites', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const nonce = await getNonce(page);
    await page.evaluate(
      ({ nonce }) => {
        window.postMessage(
          {
            type: 'reword-ai-result',
            nonce,
            result: {
              issues: ['Dismissive tone'],
              explanation: 'This sounds dismissive.',
              rewrites: [],
            },
          },
          '*',
        );
      },
      { nonce },
    );
    await page.waitForTimeout(300);

    const barText = await page.locator('#reword-block-bar').textContent();
    expect(barText).toContain('dismissive');
    // Should NOT contain keyboard hint since no rewrites
    expect(barText).not.toContain('1-3');

    await page.close();
  });

  test('shows single rewrite inline', async () => {
    const page = await setupPage(browser);
    await typeAndBlock(page, HARSH_TEXT);

    const nonce = await getNonce(page);
    await page.evaluate(
      ({ nonce }) => {
        window.postMessage(
          {
            type: 'reword-ai-result',
            nonce,
            result: {
              issues: ['Harsh'],
              explanation: 'This is harsh.',
              rewrites: [{ label: 'Softer', text: 'Could we try a different approach?' }],
            },
          },
          '*',
        );
      },
      { nonce },
    );
    await page.waitForTimeout(300);

    const barText = await page.locator('#reword-block-bar').textContent();
    expect(barText).toContain('Softer');
    expect(barText).toContain('different approach');

    await page.close();
  });
});

test.describe('Bodyguard: Platform DOM Simulation', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  const platforms = [
    {
      name: 'Slack',
      html: `<div data-qa="message_input"><div contenteditable="true" role="textbox" class="ql-editor"></div></div>
             <div data-qa="texty_composer_button_bar"><button data-qa="texty_send_button">Send</button></div>`,
    },
    {
      name: 'Discord',
      html: `<div class="channelTextArea_xyz"><div role="textbox" class="slateTextArea_abc" contenteditable="true"></div></div>`,
    },
    {
      name: 'Teams',
      html: `<div data-tid="ckeditor"><div contenteditable="true" role="textbox"></div></div>
             <button data-tid="newMessageCommands-send" name="send">Send</button>`,
    },
    {
      name: 'WhatsApp',
      html: `<footer><div contenteditable="true" data-tab="10" role="textbox"></div>
             <button aria-label="Send"><span data-icon="send"></span></button></footer>`,
    },
    {
      name: 'Outlook',
      html: `<div role="textbox" contenteditable="true" aria-label="Message body"></div>
             <div role="toolbar"><button aria-label="Send">Send</button></div>`,
    },
  ];

  for (const platform of platforms) {
    test(`blocks harsh messages on ${platform.name} DOM`, async () => {
      const page = await browser.newPage();
      await page.setContent(
        `<!DOCTYPE html><html><body>${platform.html}<div id="log"></div></body></html>`,
      );

      await page.evaluate(() => {
        document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
            document.getElementById('log')!.textContent = 'SENT';
          }
        });
      });

      await page.evaluate(shadowPierceCode);
      await page.waitForTimeout(1500);

      const input = page.locator('[contenteditable="true"]').first();
      await input.click();
      await input.type(HARSH_TEXT);
      await input.press('Enter');
      await page.waitForTimeout(500);

      // Should be blocked
      expect(await page.locator('#log').textContent()).not.toContain('SENT');
      await expect(page.locator('#reword-block-bar')).toBeVisible();

      await page.close();
    });
  }
});
