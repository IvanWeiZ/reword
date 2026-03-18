import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class WhatsAppAdapter implements PlatformAdapter {
  platformName = 'whatsapp';

  findInputField(): HTMLElement | null {
    // WhatsApp Web uses a contentEditable div inside .copyable-area
    // with data-tab="10" for the main message input
    return (
      document.querySelector<HTMLElement>(
        '.copyable-area div[contenteditable="true"][data-tab="10"]',
      ) ??
      document.querySelector<HTMLElement>('.copyable-area div[contenteditable="true"]')
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    // Place near the send button (green circle with arrow)
    const sendButton = document.querySelector('[data-testid="send"]');
    const container = sendButton?.parentElement;
    if (!container) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '4px';
    container.insertBefore(icon, sendButton);
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
    if (!input) console.warn('[Reword] WhatsApp: message input not found');
    return input !== null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[data-testid="msg-container"]');
    for (const el of messageEls) {
      const body = el.querySelector('.copyable-text .selectable-text');
      const text = body?.textContent?.trim();
      if (!text) continue;
      // Outgoing messages have the "message-out" class
      const isOutgoing = el.classList.contains('message-out');
      messages.push({ sender: isOutgoing ? 'self' : 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>('[data-testid="msg-container"]');
    for (const el of messageEls) {
      if (!el.classList.contains('message-out')) {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const textSpan = messageEl.querySelector('.selectable-text');
    if (!textSpan) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    textSpan.parentElement?.appendChild(indicator);
    return () => indicator.remove();
  }
}
