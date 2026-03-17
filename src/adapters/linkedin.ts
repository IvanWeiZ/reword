import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { selectAllContent, insertText } from './base';

export class LinkedInAdapter implements PlatformAdapter {
  platformName = 'linkedin';
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
    selectAllContent(input);
    insertText(input, text);
    return true;
  }

  checkHealth(): boolean {
    const input = this.findInputField();
    const actionsRow = document.querySelector('.msg-form__right-actions');
    if (!input) console.warn('[Reword] LinkedIn: message input not found');
    if (!actionsRow) console.warn('[Reword] LinkedIn: actions row not found');
    return input !== null && actionsRow !== null;
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

  getIncomingMessageElements(): HTMLElement[] {
    const els: HTMLElement[] = [];
    const messageEls = document.querySelectorAll<HTMLElement>('.msg-s-event-listitem');
    for (const el of messageEls) {
      if (el.classList.contains('msg-s-event-listitem--other')) {
        els.push(el);
      }
    }
    return els.slice(-5);
  }

  placeIncomingIndicator(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null {
    const body = messageEl.querySelector('.msg-s-event-listitem__body');
    if (!body) return null;
    indicator.style.display = 'inline-flex';
    indicator.style.marginLeft = '6px';
    body.appendChild(indicator);
    return () => indicator.remove();
  }
}
