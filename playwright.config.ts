import { defineConfig } from '@playwright/test';
import { resolve } from 'path';

const extensionPath = resolve(__dirname, 'dist');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: false, // Chrome extensions require headed mode
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
          ],
        },
      },
    },
  ],
  // Build the extension before running e2e tests
  webServer: {
    command: 'npm run build',
    reuseExistingServer: true,
  },
});
