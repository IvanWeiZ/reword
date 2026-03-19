import { test, expect } from '@playwright/test';
import { launchWithExtension } from './helpers';
import type { BrowserContext, Page } from '@playwright/test';
import { createServer, type Server } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dir, 'fixtures/linkedin-messaging.html');
const shadowPierceCode = readFileSync(
  resolve(__dir, '../../dist/shadow-pierce.js'),
  'utf-8',
);

let context: BrowserContext;
let server: Server;
let serverPort: number;

function startServer(): Promise<void> {
  return new Promise((res) => {
    const html = readFileSync(fixturePath, 'utf-8');
    server = createServer((_req, resp) => {
      resp.writeHead(200, { 'Content-Type': 'text/html' });
      resp.end(html);
    });
    server.listen(0, 'localhost', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        serverPort = addr.port;
      }
      res();
    });
  });
}

test.beforeAll(async () => {
  await startServer();
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context.close();
  server.close();
});

/** Helper: open a fresh page pointing at the local LinkedIn fixture */
async function openLinkedInPage(): Promise<{
  page: Page;
  consoleLogs: string[];
}> {
  const page = await context.newPage();
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));
  await page.goto(`http://localhost:${serverPort}/`, {
    waitUntil: 'domcontentloaded',
  });
  // Wait for content script polling interval to find the input (up to 4s)
  await page.waitForTimeout(4000);
  return { page, consoleLogs };
}

test.describe('LinkedIn harness e2e', () => {
  test('extension loads on test page', async () => {
    const { page, consoleLogs } = await openLinkedInPage();

    // shadow-pierce.js logs this on load
    const hasShadowPierce = consoleLogs.some((l) =>
      l.includes('[Reword MAIN] shadow-pierce loaded'),
    );
    // content.js logs this on init
    const hasContentInit = consoleLogs.some((l) => l.includes('[Reword] init'));

    expect(hasShadowPierce).toBe(true);
    expect(hasContentInit).toBe(true);

    await page.close();
  });

  test('input field detection via polling', async () => {
    const { page, consoleLogs } = await openLinkedInPage();

    // The content script should log that it found and is watching the input
    const foundInput = consoleLogs.some((l) =>
      l.includes('[Reword] watching input'),
    );
    expect(foundInput).toBe(true);

    await page.close();
  });

  test('heuristic scoring flags harsh messages', async () => {
    const { page, consoleLogs } = await openLinkedInPage();

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    // Clear the default <p><br></p> content and type a harsh message
    await input.fill('');
    await input.pressSequentially(
      'per my last email, I already explained this to you',
      { delay: 30 },
    );

    // Wait for debounce (DEBOUNCE_MS=800) + AI_DEBOUNCE_MS(2000) + buffer
    await page.waitForTimeout(4000);

    const flagged = consoleLogs.some((l) => l.includes('[Reword] flagged'));
    expect(flagged).toBe(true);

    await page.close();
  });

  test('clean messages do not trigger flag', async () => {
    const { page, consoleLogs } = await openLinkedInPage();

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    await input.fill('');
    await input.pressSequentially('Thanks for your help with the project!', {
      delay: 30,
    });

    await page.waitForTimeout(4000);

    const flagged = consoleLogs.some((l) => l.includes('[Reword] flagged'));
    expect(flagged).toBe(false);

    await page.close();
  });

  test('warning banner element is created and analysis is triggered', async () => {
    const { page, consoleLogs } = await openLinkedInPage();

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    await input.fill('');
    await input.pressSequentially(
      'per my last email, I already explained this clearly',
      { delay: 30 },
    );

    // Wait for debounce + analysis trigger
    await page.waitForTimeout(4000);

    // The banner element should exist in the DOM (created on init)
    const banner = page.locator('#reword-warning-banner');
    await expect(banner).toBeAttached();

    // The heuristic should have flagged and triggered analysis
    const flagged = consoleLogs.some((l) => l.includes('[Reword] flagged'));
    expect(flagged).toBe(true);

    await page.close();
  });

  test('shadow-pierce blocks Enter for harsh text', async () => {
    // Use a standalone browser (no extension) to test shadow-pierce in isolation
    // This mirrors the pattern from send-intercept.spec.ts
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    // Load the LinkedIn fixture HTML directly
    const html = readFileSync(fixturePath, 'utf-8');
    await page.setContent(html);

    // Inject shadow-pierce.js (simulating what the extension does in MAIN world)
    await page.evaluate(shadowPierceCode);
    // Wait for the setInterval in shadow-pierce to cache the editable
    await page.waitForTimeout(1500);

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    await input.fill('');
    await input.pressSequentially(
      'you are completely useless!!',
      { delay: 20 },
    );
    await page.waitForTimeout(500);

    // Press Enter — shadow-pierce should block it
    await input.press('Enter');
    await page.waitForTimeout(500);

    // The page's send handler should NOT have fired
    const sentLog = await page.locator('#sent-log').textContent();
    expect(sentLog).not.toContain('SENT');

    // shadow-pierce should have logged a block
    const blocked = consoleLogs.some((l) => l.includes('BLOCKED'));
    expect(blocked).toBe(true);

    await browser.close();
  });
});
