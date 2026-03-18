import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

export class TwitterAdapter implements PlatformAdapter {
  platformName = 'twitter';
  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-testid="dmComposerTextInput"]');
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const sendButton = document.querySelector('[data-testid="dmComposerSendButton"]');
    if (!sendButton?.parentElement) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '8px';
    sendButton.parentElement.insertBefore(icon, sendButton);
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
    const sendBtn = document.querySelector('[data-testid="dmComposerSendButton"]');
    if (!input) console.warn('[Reword] Twitter: DM input not found');
    if (!sendBtn) console.warn('[Reword] Twitter: send button not found');
    return input !== null && sendBtn !== null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[data-testid="messageEntry"]');
    for (const el of messageEls) {
      const text = el.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
      if (!text) continue;
      messages.push({ sender: 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }

  getIncomingMessageElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="messageEntry"]')).slice(
      -5,
    );
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const tweetText = messageEl.querySelector('[data-testid="tweetText"]');
    if (!tweetText) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    tweetText.appendChild(indicator);
    return () => indicator.remove();
  }
}
