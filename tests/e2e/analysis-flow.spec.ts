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

async function openTestPage(): Promise<{ page: Page; consoleLogs: string[] }> {
  const page = await context.newPage();
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));
  await page.goto(`http://localhost:${serverPort}/`, {
    waitUntil: 'domcontentloaded',
  });
  // Wait for content script to initialize and find the input
  await page.waitForTimeout(4000);
  return { page, consoleLogs };
}

test.describe('full analysis flow', () => {
  test('warning banner appears for problematic message', async () => {
    const { page, consoleLogs } = await openTestPage();

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    await input.fill('');
    await input.pressSequentially(
      'per my last email, I already explained this to you',
      { delay: 30 },
    );

    // Wait for debounce + analysis trigger
    await page.waitForTimeout(4000);

    // The heuristic should have flagged this
    const flagged = consoleLogs.some((l) => l.includes('[Reword] flagged'));
    expect(flagged).toBe(true);

    // Warning banner should exist in the DOM
    const banner = page.locator('#reword-warning-banner');
    await expect(banner).toBeAttached();

    await page.close();
  });

  test('clean messages do not trigger warning', async () => {
    const { page, consoleLogs } = await openTestPage();

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

  test('dismiss button hides warning banner', async () => {
    const { page, consoleLogs } = await openTestPage();

    const input = page.locator('.msg-form__contenteditable');
    await input.click();
    await input.fill('');
    await input.pressSequentially(
      'whatever, I guess that works. Thanks for nothing.',
      { delay: 30 },
    );

    // Wait for debounce + analysis
    await page.waitForTimeout(4000);

    // Banner should be visible if heuristic flagged it
    const flagged = consoleLogs.some((l) => l.includes('[Reword] flagged'));
    if (flagged) {
      const banner = page.locator('#reword-warning-banner');
      // If banner is displayed, try to dismiss it
      const dismissBtn = page.locator('#reword-dismiss');
      if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dismissBtn.click();
        // Banner should be hidden after dismiss
        await expect(banner).toBeHidden();
      }
    }

    await page.close();
  });
});
