import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export class LinkedInAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '.msg-form__msg-content-container--scrollable[role="textbox"]',
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const actionsRow = document.querySelector('.msg-form__right-actions');
    if (!actionsRow) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '8px';
    actionsRow.insertBefore(icon, actionsRow.firstChild);
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
    const messageEls = document.querySelectorAll('.msg-s-event-listitem');
    for (const el of messageEls) {
      const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim();
      if (!text) continue;
      const isSelf = el.classList.contains('msg-s-event-listitem--other') ? 'other' : 'self';
      messages.push({ sender: isSelf as 'self' | 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }
}
