import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class OutlookAdapter implements PlatformAdapter {
  platformName = 'outlook';

  findInputField(): HTMLElement | null {
    // Outlook Web uses a contentEditable div with role="textbox" and aria-label containing "Message body"
    return document.querySelector<HTMLElement>('div[role="textbox"][aria-label*="Message body"]');
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    // Place near the Send button in the compose toolbar
    const sendButton = document.querySelector<HTMLElement>(
      'button[aria-label="Send"], button[title="Send"]',
    );
    const toolbar = sendButton?.closest<HTMLElement>('.ms-CommandBar, [role="toolbar"]');
    if (!toolbar) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginLeft = '8px';
    toolbar.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    writeBackToElement(input, text);
    return true;
  }

  getRecipientIdentifier(): string | null {
    const nameEl = document.querySelector<HTMLElement>('[class*="wellItemName"], .CesyA');
    return nameEl?.textContent?.trim() ? 'outlook:' + nameEl.textContent.trim() : null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    // Outlook Web renders conversation messages in divs with role="document" or within .ItemContent
    const messageEls = document.querySelectorAll('[role="document"] .XbIp4, div.aVla3');
    for (const el of messageEls) {
      const text = el.textContent?.trim();
      if (!text) continue;
      // Try to identify the sender from the header above the message body
      const container = el.closest('[role="listitem"], [data-convid]');
      const senderEl = container?.querySelector<HTMLElement>(
        'span.lDdSm, [autoid*="PersonaCardTrigger"]',
      );
      const senderName = senderEl?.textContent?.trim() ?? '';
      const sender =
        senderName.toLowerCase() === 'me' || senderName === ''
          ? ('self' as const)
          : ('other' as const);
      messages.push({ sender, text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  checkHealth(): boolean {
    const input = this.findInputField();
    const sendBtn = document.querySelector('button[aria-label="Send"], button[title="Send"]');
    if (!input) console.warn('[Reword] Outlook: compose input not found');
    if (!sendBtn) console.warn('[Reword] Outlook: send button not found');
    return input !== null && sendBtn !== null;
  }

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>(
      '[role="document"] .XbIp4, div.aVla3',
    );
    for (const el of messageEls) {
      const container = el.closest('[role="listitem"], [data-convid]');
      const senderEl = container?.querySelector<HTMLElement>(
        'span.lDdSm, [autoid*="PersonaCardTrigger"]',
      );
      const senderName = senderEl?.textContent?.trim() ?? '';
      if (senderName.toLowerCase() !== 'me' && senderName !== '') {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '8px';
    indicator.style.verticalAlign = 'middle';
    const firstChild = messageEl.firstChild;
    if (firstChild) {
      messageEl.insertBefore(indicator, firstChild);
    } else {
      messageEl.appendChild(indicator);
    }
    return () => indicator.remove();
  }
}
