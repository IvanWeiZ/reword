import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class SlackAdapter implements PlatformAdapter {
  platformName = 'slack';

  findInputField(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('[data-qa="message_input"] [contenteditable="true"]') ??
      document.querySelector<HTMLElement>('.ql-editor[contenteditable="true"]')
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const toolbar = document.querySelector('[data-qa="texty_composer_button_bar"]');
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

  checkHealth(): boolean {
    const input = this.findInputField();
    if (!input) console.warn('[Reword] Slack: message input not found');
    return input !== null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[data-qa="virtual-list-item"]');
    for (const el of messageEls) {
      const body = el.querySelector('[data-qa="message-text"]');
      const text = body?.textContent?.trim();
      if (!text) continue;
      // Slack marks "you" messages with a specific sender attribute
      const senderEl = el.querySelector('[data-qa="message_sender_name"]');
      const sender = senderEl?.textContent?.trim() === 'You' ? 'self' : 'other';
      messages.push({ sender: sender as 'self' | 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>('[data-qa="virtual-list-item"]');
    for (const el of messageEls) {
      const senderEl = el.querySelector('[data-qa="message_sender_name"]');
      if (senderEl?.textContent?.trim() !== 'You') {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const header = messageEl.querySelector('[data-qa="message_sender_name"]');
    if (!header?.parentElement) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    header.parentElement.appendChild(indicator);
    return () => indicator.remove();
  }
}
