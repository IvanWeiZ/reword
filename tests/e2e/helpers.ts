import { type BrowserContext, chromium } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const extensionPath = resolve(__dir, '../../dist');

/**
 * Launch a Chromium instance with the Reword extension loaded.
 * Returns the browser context (extension runs inside it).
 */
export async function launchWithExtension(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--headless=new',
    ],
  });
  // Wait for the service worker to initialize (with timeout fallback)
  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => {
      console.log('Service worker not detected, continuing anyway');
    });
  }
  // Give the extension a moment to fully initialize
  await new Promise((r) => setTimeout(r, 1000));
  return context;
}

/**
 * Get the extension ID from a running browser context.
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const url = serviceWorker.url();
  // chrome-extension://<id>/service-worker.js
  const match = url.match(/chrome-extension:\/\/([^/]+)/);
  if (!match) throw new Error(`Could not extract extension ID from ${url}`);
  return match[1];
}

/**
 * Build a minimal HTML page that simulates a compose area for a given platform.
 */
export function buildTestPage(
  platform: 'gmail' | 'linkedin' | 'twitter' | 'slack' | 'discord',
): string {
  const fixtures: Record<string, string> = {
    gmail: `
      <div class="nH">
        <div class="iN">
          <div class="Am" role="textbox" contenteditable="true" aria-label="Message Body" g_editable="true"></div>
        </div>
        <div class="btC"><div class="dC">
          <div role="button" class="T-I J-J5-Ji aoO v7 T-I-atl L3" data-tooltip="Send">Send</div>
        </div></div>
      </div>`,
    linkedin: `
      <div class="msg-form">
        <div class="msg-form__contenteditable">
          <div role="textbox" contenteditable="true" class="msg-form__msg-content-container--scrollable"></div>
        </div>
        <div class="msg-form__right-actions">
          <button class="msg-form__send-button" type="submit">Send</button>
        </div>
      </div>`,
    twitter: `
      <div data-testid="DmActivityViewport">
        <div data-testid="messageEntry">
          <div data-testid="dmComposerTextInput" role="textbox" contenteditable="true">
            <div data-contents="true"><div><span data-text="true"></span></div></div>
          </div>
        </div>
        <div data-testid="dmComposerSendButton" role="button" tabindex="0"><span>Send</span></div>
      </div>`,
    slack: `
      <div class="p-workspace">
        <div data-qa="message_input">
          <div contenteditable="true" role="textbox" class="ql-editor"></div>
        </div>
        <div data-qa="texty_composer_button_bar">
          <button data-qa="texty_send_button">Send</button>
        </div>
      </div>`,
    discord: `
      <div class="chat_content">
        <div class="channelTextArea_xyz">
          <div role="textbox" class="slateTextArea_abc" contenteditable="true"></div>
        </div>
        <div class="buttons_xyz">
          <button>Send</button>
        </div>
      </div>`,
  };

  return `<!DOCTYPE html>
<html><head><title>${platform} test</title></head>
<body>${fixtures[platform]}</body></html>`;
}
