import { test, expect } from '@playwright/test';
import { launchWithExtension } from './helpers';
import type { BrowserContext } from '@playwright/test';

let context: BrowserContext;

test.beforeAll(async () => {
  context = await launchWithExtension();
});

test.afterAll(async () => {
  await context?.close();
});

test('debug Enter key behavior on LinkedIn', async () => {
  test.setTimeout(60000);
  const page = await context.newPage();

  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(msg.text()));

  // Go to LinkedIn (will hit auth wall but content scripts still inject)
  await page.goto('https://www.linkedin.com/messaging/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(3000);

  // Log all Reword messages
  let rewordLogs = consoleLogs.filter(l => l.includes('Reword'));
  console.log('=== After page load ===');
  rewordLogs.forEach(l => console.log('  ', l));

  // Check if shadow-pierce loaded
  const loaded = consoleLogs.some(l => l.includes('shadow-pierce loaded'));
  console.log('shadow-pierce loaded:', loaded);

  // Try pressing Enter to see if the handler fires
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  rewordLogs = consoleLogs.filter(l => l.includes('Reword'));
  console.log('=== After Enter press ===');
  rewordLogs.forEach(l => console.log('  ', l));

  const enterDetected = consoleLogs.some(l => l.includes('Enter keydown'));
  console.log('Enter keydown detected by shadow-pierce:', enterDetected);

  // Check for any contenteditable elements
  const editableCount = await page.evaluate(() =>
    document.querySelectorAll('[contenteditable="true"]').length
  );
  console.log('Contenteditable elements on page:', editableCount);

  // Check what the MAIN world sees
  const mainWorldEditables = await page.evaluate(() => {
    const els = document.querySelectorAll('[contenteditable="true"]');
    return Array.from(els).map(e => ({
      tag: e.tagName,
      className: e.className.slice(0, 60),
      role: e.getAttribute('role'),
    }));
  });
  console.log('MAIN world editables:', JSON.stringify(mainWorldEditables));

  expect(loaded).toBe(true);

  await page.close();
});
