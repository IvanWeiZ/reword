import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { selectAllContent, insertText } from './base';

export class GmailAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>('div[role="textbox"][g_editable="true"]');
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const sendButtonRow = document.querySelector('.btC .dC');
    if (!sendButtonRow) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginLeft = '8px';
    sendButtonRow.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    input.focus();
    selectAllContent(input);
    insertText(input, text);
    return true;
  }

  checkHealth(): boolean {
    const input = this.findInputField();
    const sendBtn = document.querySelector('.btC .dC');
    if (!input) console.warn('[Reword] Gmail: compose input not found');
    if (!sendBtn) console.warn('[Reword] Gmail: send button row not found');
    return input !== null && sendBtn !== null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('.a3s.aiL');
    for (const el of messageEls) {
      const text = el.textContent?.trim();
      if (!text) continue;
      const container = el.closest('.adn');
      const senderEl = container?.querySelector('.gD');
      const senderName = senderEl?.getAttribute('name') ?? '';
      const sender =
        senderName === 'Me' || senderName === 'me' ? ('self' as const) : ('other' as const);
      messages.push({ sender, text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }
}
