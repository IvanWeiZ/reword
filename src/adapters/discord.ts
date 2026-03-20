import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class DiscordAdapter implements PlatformAdapter {
  platformName = 'discord';

  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="textbox"][class*="slateTextArea"]');
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const buttons = document.querySelector('[class*="buttons_"]');
    if (!buttons) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '4px';
    buttons.insertBefore(icon, buttons.firstChild);
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
    if (!input) console.warn('[Reword] Discord: text input not found');
    return input !== null;
  }

  getRecipientIdentifier(): string | null {
    const name = document.querySelector<HTMLElement>('h3[class*="channel-"]')?.textContent?.trim();
    return name ? 'discord:' + name : null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[id^="chat-messages-"]');
    for (const el of messageEls) {
      const body = el.querySelector('[id^="message-content-"]');
      const text = body?.textContent?.trim();
      if (!text) continue;
      // Discord highlights the user's own messages
      const isOwn = el.querySelector('[class*="mentioned"]') !== null;
      messages.push({ sender: isOwn ? 'self' : 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>('[id^="chat-messages-"]');
    for (const el of messageEls) {
      if (!el.querySelector('[class*="mentioned"]')) {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const header = messageEl.querySelector('[class*="headerText_"]');
    if (!header) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    header.appendChild(indicator);
    return () => indicator.remove();
  }
}
