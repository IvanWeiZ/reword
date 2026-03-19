import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const shadowPierceCode = readFileSync(resolve(__dir, '../../dist/shadow-pierce.js'), 'utf-8');

// Text that scores above 0.38 threshold
const HARSH_TEXT = 'you are completely useless!!';
const PROFANITY_TEXT = 'fuck this';
const DIRECTED_INSULT = 'you are so stupid';

test.describe('Send interception (standalone)', () => {
  test('shadow-pierce blocks Enter for harsh messages in contenteditable', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    // Inject shadow-pierce FIRST (before page handler), then set up the page handler
    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox" style="border:1px solid #ccc;padding:10px;min-height:50px"></div>
      <div id="log"></div>
    </body></html>`);

    // Inject shadow-pierce before page registers its own handler
    await page.evaluate(shadowPierceCode);

    // Now register the page's own handler (simulating what LinkedIn/Gmail would do)
    await page.evaluate(() => {
      const input = document.querySelector('[contenteditable]')!;
      const log = document.getElementById('log')!;
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
          log.textContent = 'SENT';
        }
      });
    });

    await page.waitForTimeout(1500); // wait for setInterval to cache the editable

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(HARSH_TEXT);
    await page.waitForTimeout(500);

    // Press Enter
    await input.press('Enter');
    await page.waitForTimeout(500);

    const logText = await page.locator('#log').textContent();
    const blocked = consoleLogs.some(l => l.includes('BLOCKED'));

    console.log('sent-log:', logText);
    console.log('blocked:', blocked);
    console.log('reword logs:', consoleLogs.filter(l => l.includes('Reword')));

    // The page's handler should NOT have fired (Enter was blocked)
    expect(logText).not.toContain('SENT');
    expect(blocked).toBe(true);

    await browser.close();
  });

  test('does not block short messages', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox"></div>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);
    await page.evaluate(() => {
      document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
          document.getElementById('log')!.textContent = 'SENT';
        }
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type('hi');
    await input.press('Enter');
    await page.waitForTimeout(500);

    const logText = await page.locator('#log').textContent();
    console.log('short msg sent-log:', logText);

    // Short messages should pass through
    expect(logText).toContain('SENT');

    await browser.close();
  });

  test('does not block Shift+Enter', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox"></div>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);
    await page.evaluate(() => {
      document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          document.getElementById('log')!.textContent = (e as KeyboardEvent).shiftKey ? 'NEWLINE' : 'SENT';
        }
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(HARSH_TEXT);
    await input.press('Shift+Enter');
    await page.waitForTimeout(500);

    const logText = await page.locator('#log').textContent();
    console.log('shift+enter log:', logText);

    // Shift+Enter should not be blocked
    expect(logText).toContain('NEWLINE');

    await browser.close();
  });

  test('does not block messages below heuristic threshold', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox"></div>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);
    await page.evaluate(() => {
      document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
          document.getElementById('log')!.textContent = 'SENT';
        }
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type('this is a perfectly normal message to send');
    await input.press('Enter');
    await page.waitForTimeout(500);

    const logText = await page.locator('#log').textContent();
    console.log('mild msg sent-log:', logText);

    // Normal messages should pass through even though they're long
    expect(logText).toContain('SENT');

    await browser.close();
  });

  test('postMessage is sent to content script on block', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox"></div>
      <div id="msg-log"></div>
    </body></html>`);

    // Set up message listener first
    await page.evaluate(() => {
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'reword-send-intercept') {
          document.getElementById('msg-log')!.textContent = 'INTERCEPTED:' + e.data.text;
        }
      });
    });

    await page.evaluate(shadowPierceCode);
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(HARSH_TEXT);
    await input.press('Enter');
    await page.waitForTimeout(500);

    const msgLog = await page.locator('#msg-log').textContent();
    console.log('message log:', msgLog);

    expect(msgLog).toContain(`INTERCEPTED:${HARSH_TEXT}`);

    await browser.close();
  });

  test('warning bar appears when Enter is blocked', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox" style="min-height:50px;padding:10px;border:1px solid #ccc;"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(HARSH_TEXT);
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Warning bar should be visible
    const bar = page.locator('#reword-block-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Send blocked');

    // "Edit message" and "Send anyway" buttons should be present
    await expect(page.locator('#reword-bar-edit')).toBeVisible();
    await expect(page.locator('#reword-bar-send')).toBeVisible();

    await browser.close();
  });

  test('send anyway button lets the message through', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox" style="min-height:50px;padding:10px;border:1px solid #ccc;"></div>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);

    // Register send handler AFTER shadow-pierce
    await page.evaluate(() => {
      document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
          document.getElementById('log')!.textContent = 'SENT';
        }
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(HARSH_TEXT);
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Initially blocked
    expect(await page.locator('#log').textContent()).not.toContain('SENT');

    // Click "Send anyway"
    await page.locator('#reword-bar-send').click();
    await page.waitForTimeout(600);

    // Now the message should have been sent
    expect(await page.locator('#log').textContent()).toContain('SENT');

    // Warning bar should be hidden
    await expect(page.locator('#reword-block-bar')).toBeHidden();

    await browser.close();
  });

  test('Send button click is blocked for harsh text', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox" style="min-height:50px;padding:10px;border:1px solid #ccc;"></div>
      <button class="msg-form__send-button" type="submit">Send</button>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);

    // Register send click handler AFTER shadow-pierce
    await page.evaluate(() => {
      document.querySelector('.msg-form__send-button')!.addEventListener('click', () => {
        document.getElementById('log')!.textContent = 'SENT';
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(DIRECTED_INSULT);
    await page.waitForTimeout(300);

    // Click the Send button
    await page.locator('.msg-form__send-button').click({ force: true });
    await page.waitForTimeout(500);

    // Should be blocked
    expect(await page.locator('#log').textContent()).not.toContain('SENT');

    // Warning bar should appear
    await expect(page.locator('#reword-block-bar')).toBeVisible();

    await browser.close();
  });

  test('profanity is blocked even in short messages', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(`<!DOCTYPE html><html><body>
      <div contenteditable="true" role="textbox" style="min-height:50px;padding:10px;border:1px solid #ccc;"></div>
      <div id="log"></div>
    </body></html>`);

    await page.evaluate(shadowPierceCode);
    await page.evaluate(() => {
      document.querySelector('[contenteditable]')!.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
          document.getElementById('log')!.textContent = 'SENT';
        }
      });
    });
    await page.waitForTimeout(1500);

    const input = page.locator('[contenteditable="true"]');
    await input.click();
    await input.type(PROFANITY_TEXT);
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Profanity should be blocked even though it's short
    expect(await page.locator('#log').textContent()).not.toContain('SENT');

    await browser.close();
  });
});
