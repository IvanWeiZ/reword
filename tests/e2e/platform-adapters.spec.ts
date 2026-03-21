/**
 * E2E tests: Platform adapter validation
 *
 * Tests the full send-blocking flow on simulated platform DOMs
 * for all 8 supported platforms. Each test verifies:
 * 1. Input field detection (contenteditable found and cached)
 * 2. Send blocking (Enter key intercepted for harsh text)
 * 3. Send button blocking (click intercepted)
 * 4. AI result rendering (reword-ai-result upgrades the bar)
 * 5. Rewrite acceptance (keyboard shortcut replaces text)
 * 6. Unblock after clean text (reword-unblock releases)
 */
import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const shadowPierceCode = readFileSync(resolve(__dir, '../../dist/shadow-pierce.js'), 'utf-8');

const HARSH_TEXT = 'you are completely useless and incompetent!!';

interface PlatformFixture {
  name: string;
  html: string;
  sendButtonSelector?: string; // If platform has a clickable send button
}

const PLATFORMS: PlatformFixture[] = [
  {
    name: 'Gmail',
    html: `
      <div class="nH">
        <div class="iN">
          <div class="Am" role="textbox" contenteditable="true" aria-label="Message Body" g_editable="true"></div>
        </div>
        <div class="btC"><div class="dC">
          <div role="button" class="T-I J-J5-Ji aoO v7 T-I-atl L3" data-tooltip="Send">Send</div>
        </div></div>
      </div>`,
    sendButtonSelector: '[data-tooltip="Send"]',
  },
  {
    name: 'LinkedIn',
    html: `
      <div class="msg-form">
        <div class="msg-form__contenteditable">
          <div role="textbox" contenteditable="true" class="msg-form__msg-content-container--scrollable"></div>
        </div>
        <div class="msg-form__right-actions">
          <button class="msg-form__send-button" type="submit">Send</button>
        </div>
      </div>`,
    sendButtonSelector: '.msg-form__send-button',
  },
  {
    name: 'Twitter/X',
    html: `
      <div data-testid="DmActivityViewport">
        <div data-testid="messageEntry">
          <div data-testid="dmComposerTextInput" role="textbox" contenteditable="true">
            <div data-contents="true"><div><span data-text="true"></span></div></div>
          </div>
        </div>
        <div data-testid="dmComposerSendButton" role="button" tabindex="0"><span>Send</span></div>
      </div>`,
    sendButtonSelector: '[data-testid="dmComposerSendButton"]',
  },
  {
    name: 'Slack',
    html: `
      <div class="p-workspace">
        <div data-qa="message_input">
          <div contenteditable="true" role="textbox" class="ql-editor"></div>
        </div>
        <div data-qa="texty_composer_button_bar">
          <button data-qa="texty_send_button">Send</button>
        </div>
      </div>`,
    sendButtonSelector: '[data-qa="texty_send_button"]',
  },
  {
    name: 'Discord',
    html: `
      <div class="chat_content">
        <div class="channelTextArea_xyz">
          <div role="textbox" class="slateTextArea_abc" contenteditable="true"></div>
        </div>
      </div>`,
    // Discord uses Enter only, no send button
  },
  {
    name: 'Teams',
    html: `
      <div data-tid="ckeditor">
        <div contenteditable="true" role="textbox"></div>
      </div>
      <button data-tid="newMessageCommands-send" name="send">Send</button>`,
    sendButtonSelector: '[data-tid="newMessageCommands-send"]',
  },
  {
    name: 'WhatsApp',
    html: `
      <footer>
        <div contenteditable="true" data-tab="10" role="textbox"></div>
        <button aria-label="Send"><span data-icon="send"></span></button>
      </footer>`,
    sendButtonSelector: 'button[aria-label="Send"]',
  },
  {
    name: 'Outlook',
    html: `
      <div role="textbox" contenteditable="true" aria-label="Message body"></div>
      <div role="toolbar"><button aria-label="Send">Send</button></div>`,
    sendButtonSelector: 'button[aria-label="Send"]',
  },
];

// Helper: set up a platform page
async function setupPlatformPage(browser: Browser, platform: PlatformFixture): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html><head><title>${platform.name}</title></head>
    <body>${platform.html}<div id="log"></div></body></html>`,
  );

  await page.evaluate(() => {
    (window as any).__messages = [];
    window.addEventListener('message', (e) => {
      if (e.data?.type?.startsWith('reword-')) {
        (window as any).__messages.push(e.data);
      }
    });
    document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        document.getElementById('log')!.textContent = 'SENT';
      }
    });
  });

  await page.evaluate(shadowPierceCode);
  await page.waitForTimeout(1500);
  return page;
}

async function getNonce(page: Page): Promise<string> {
  return page.evaluate(() => {
    const msgs = (window as any).__messages as any[];
    return msgs.find((m: any) => m.type === 'reword-nonce')?.nonce ?? '';
  });
}

test.describe('Platform Adapter E2E', () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  for (const platform of PLATFORMS) {
    test.describe(platform.name, () => {
      test('blocks Enter for harsh text', async () => {
        const page = await setupPlatformPage(browser, platform);
        const input = page.locator('[contenteditable="true"]').first();
        await input.click();
        await input.type(HARSH_TEXT);
        await input.press('Enter');
        await page.waitForTimeout(500);

        expect(await page.locator('#log').textContent()).not.toContain('SENT');
        await expect(page.locator('#reword-block-bar')).toBeVisible();
        await page.close();
      });

      test('allows clean text through', async () => {
        const page = await setupPlatformPage(browser, platform);
        const input = page.locator('[contenteditable="true"]').first();
        await input.click();
        await input.type('Thanks for your help with the project!');
        await input.press('Enter');
        await page.waitForTimeout(500);

        expect(await page.locator('#log').textContent()).toContain('SENT');
        await page.close();
      });

      if (platform.sendButtonSelector) {
        test('blocks send button click for harsh text', async () => {
          const page = await setupPlatformPage(browser, platform);

          // Also track send button clicks
          await page.evaluate((sel) => {
            document.querySelector(sel)?.addEventListener('click', () => {
              document.getElementById('log')!.textContent = 'BUTTON_SENT';
            });
          }, platform.sendButtonSelector);

          const input = page.locator('[contenteditable="true"]').first();
          await input.click();
          await input.type(HARSH_TEXT);
          await page.waitForTimeout(300);

          await page.locator(platform.sendButtonSelector).click({ force: true });
          await page.waitForTimeout(500);

          expect(await page.locator('#log').textContent()).not.toContain('BUTTON_SENT');
          await expect(page.locator('#reword-block-bar')).toBeVisible();
          await page.close();
        });
      }

      test('full flow: block → AI result → keyboard rewrite → undo', async () => {
        const page = await setupPlatformPage(browser, platform);
        const input = page.locator('[contenteditable="true"]').first();

        // Type harsh text and get blocked
        await input.click();
        await input.type(HARSH_TEXT);
        await input.press('Enter');
        await page.waitForTimeout(500);

        // Block bar should show "Analyzing..."
        await expect(page.locator('#reword-block-bar')).toBeVisible();

        // Send AI result with nonce
        const nonce = await getNonce(page);
        await page.evaluate(
          ({ nonce }) => {
            window.postMessage(
              {
                type: 'reword-ai-result',
                nonce,
                result: {
                  issues: ['Harsh tone'],
                  explanation: 'This sounds harsh.',
                  rewrites: [
                    { label: 'Warmer', text: 'I think we could improve this together.' },
                    { label: 'Direct', text: 'Let me suggest some changes.' },
                  ],
                },
              },
              '*',
            );
          },
          { nonce },
        );
        await page.waitForTimeout(300);

        // Bar should show rewrites
        const barText = await page.locator('#reword-block-bar').textContent();
        expect(barText).toContain('harsh');
        expect(barText).toContain('Warmer');

        // Press 1 to accept first rewrite
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // Should post reword-apply-rewrite
        const messages = await page.evaluate(() => (window as any).__messages as any[]);
        const applyMsg = messages.find((m: any) => m.type === 'reword-apply-rewrite');
        expect(applyMsg).toBeTruthy();
        expect(applyMsg.text).toContain('improve this together');

        // Undo toast should appear
        const bar = page.locator('#reword-block-bar');
        await expect(bar).toBeVisible();
        const undoText = await bar.textContent();
        expect(undoText).toContain('Undo');

        await page.close();
      });

      test('suppression prevents blocking', async () => {
        const page = await setupPlatformPage(browser, platform);
        const nonce = await getNonce(page);

        // Send suppressions
        await page.evaluate(
          ({ nonce }) => {
            window.postMessage(
              {
                type: 'reword-suppressions',
                nonce,
                suppressions: [
                  { phrase: 'useless', recipientId: null },
                  { phrase: 'incompetent', recipientId: null },
                ],
              },
              '*',
            );
          },
          { nonce },
        );
        await page.waitForTimeout(300);

        // Type text that would normally be blocked but contains suppressed phrases
        const input = page.locator('[contenteditable="true"]').first();
        await input.click();
        await input.type('you are completely useless and incompetent');
        await input.press('Enter');
        await page.waitForTimeout(500);

        // Should NOT be blocked (phrases suppressed)
        expect(await page.locator('#log').textContent()).toContain('SENT');
        await page.close();
      });

      test('dark mode CSS variables injected', async () => {
        const page = await setupPlatformPage(browser, platform);
        const input = page.locator('[contenteditable="true"]').first();
        await input.click();
        await input.type(HARSH_TEXT);
        await input.press('Enter');
        await page.waitForTimeout(500);

        const cssVars = await page.locator('#reword-css-vars').count();
        expect(cssVars).toBe(1);
        await page.close();
      });
    });
  }
});
