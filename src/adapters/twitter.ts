import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export class TwitterAdapter implements PlatformAdapter {
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
    input.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    return true;
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
}
