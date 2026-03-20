import type { PlatformAdapter, ThreadMessage } from '../shared/types';
import { writeBackToElement } from './base';

/** Recursively search through shadow DOM trees */
function deepQuerySelector(
  selector: string,
  root: Document | ShadowRoot | Element = document,
): HTMLElement | null {
  // Try direct query first
  const direct = root.querySelector<HTMLElement>(selector);
  if (direct) return direct;

  // Search inside shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      const found = deepQuerySelector(selector, el.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

export class LinkedInAdapter implements PlatformAdapter {
  platformName = 'linkedin';
  findInputField(): HTMLElement | null {
    const selectors = [
      'div[role="textbox"][contenteditable="true"]',
      '.msg-form__msg-content-container--scrollable[role="textbox"]',
      'div[role="textbox"][contenteditable="true"][data-placeholder]',
      '.msg-form__contenteditable[role="textbox"]',
      '[contenteditable="true"][role="textbox"]',
    ];
    for (const sel of selectors) {
      // Try normal DOM first
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
      // Then search shadow DOM
      const shadow = deepQuerySelector(sel);
      if (shadow) return shadow;
    }
    return null;
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const actionsRow =
      document.querySelector('.msg-form__right-actions') ??
      document.querySelector('.msg-form__footer') ??
      document.querySelector('.msg-form')?.querySelector('[class*="actions"]');
    if (!actionsRow) {
      // Fallback: place near the input field itself
      const input = this.findInputField();
      if (!input?.parentElement) return null;
      icon.style.display = 'inline-flex';
      icon.style.position = 'absolute';
      icon.style.right = '8px';
      icon.style.top = '8px';
      icon.style.zIndex = '1000';
      input.parentElement.style.position = 'relative';
      input.parentElement.appendChild(icon);
      return () => icon.remove();
    }
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '8px';
    actionsRow.insertBefore(icon, actionsRow.firstChild);
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
    const actionsRow = document.querySelector('.msg-form__right-actions');
    if (!input) console.warn('[Reword] LinkedIn: message input not found');
    if (!actionsRow) console.warn('[Reword] LinkedIn: actions row not found');
    return input !== null && actionsRow !== null;
  }

  getRecipientIdentifier(): string | null {
    const name = document
      .querySelector<HTMLElement>('.msg-entity-lockup__entity-title')
      ?.textContent?.trim();
    return name ? 'linkedin:' + name : null;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('.msg-s-event-listitem');
    for (const el of messageEls) {
      const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim();
      if (!text) continue;
      const sender = el.classList.contains('msg-s-event-listitem--other') ? 'other' : 'self';
      messages.push({ sender, text: text.slice(0, 500) });
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

  findSendButton(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('.msg-form__send-button') ??
      document.querySelector<HTMLElement>('button[type="submit"].msg-form__send-btn') ??
      document.querySelector<HTMLElement>('.msg-form button[type="submit"]')
    );
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
