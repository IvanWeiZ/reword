import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class TeamsAdapter implements PlatformAdapter {
  platformName = 'teams';

  findInputField(): HTMLElement | null {
    // Teams Web uses a contentEditable div with data-tid="ckeditor" or role="textbox"
    // inside the compose region
    return (
      document.querySelector<HTMLElement>('[data-tid="ckeditor"][contenteditable="true"]') ??
      document.querySelector<HTMLElement>(
        '[data-tid="message-pane-compose-box"] [role="textbox"][contenteditable="true"]',
      ) ??
      document.querySelector<HTMLElement>(
        '.ts-compose-box [role="textbox"][contenteditable="true"]',
      )
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    // Place near the send button in the compose toolbar
    const sendButton = document.querySelector<HTMLElement>(
      '[data-tid="newMessageCommands-send"], button[aria-label="Send"]',
    );
    const toolbar = sendButton?.closest<HTMLElement>(
      '[data-tid="newMessageCommands"], .ts-message-actions',
    );
    if (!toolbar) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginLeft = '4px';
    toolbar.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    writeBackToElement(input, text);
    return true;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[data-tid="chat-pane-message"]');
    for (const el of messageEls) {
      const body = el.querySelector<HTMLElement>('.ui-chat__message__content, [data-tid="message-body"]');
      const text = body?.textContent?.trim();
      if (!text) continue;
      const senderEl = el.querySelector<HTMLElement>(
        '[data-tid="message-author-name"], .ui-chat__message__author',
      );
      const senderName = senderEl?.textContent?.trim() ?? '';
      const sender =
        senderName.toLowerCase() === 'you' || senderName === ''
          ? ('self' as const)
          : ('other' as const);
      messages.push({ sender, text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  checkHealth(): boolean {
    const input = this.findInputField();
    const sendBtn = document.querySelector(
      '[data-tid="newMessageCommands-send"], button[aria-label="Send"]',
    );
    if (!input) console.warn('[Reword] Teams: compose input not found');
    if (!sendBtn) console.warn('[Reword] Teams: send button not found');
    return input !== null && sendBtn !== null;
  }

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>('[data-tid="chat-pane-message"]');
    for (const el of messageEls) {
      const senderEl = el.querySelector<HTMLElement>(
        '[data-tid="message-author-name"], .ui-chat__message__author',
      );
      const senderName = senderEl?.textContent?.trim() ?? '';
      if (senderName.toLowerCase() !== 'you' && senderName !== '') {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const header = messageEl.querySelector<HTMLElement>(
      '[data-tid="message-author-name"], .ui-chat__message__author',
    );
    if (!header?.parentElement) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    header.parentElement.appendChild(indicator);
    return () => indicator.remove();
  }
}
