import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export type { PlatformAdapter };

/** Select all content in a contenteditable element. */
export function selectAllContent(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Insert text into a focused element, preferring InputEvent over deprecated execCommand. */
export function insertText(element: HTMLElement, text: string): void {
  // Use InputEvent-based insertion (modern browsers)
  const event = new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: text,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const cancelled = !element.dispatchEvent(event);
  if (!cancelled) {
    // Fallback: set content directly and fire input event
    element.textContent = text;
    element.dispatchEvent(
      new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }),
    );
  }
}

export class GenericFallbackAdapter implements PlatformAdapter {
  platformName = 'generic';
  findInputField(): HTMLElement | null {
    const editables = document.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea');
    let best: HTMLElement | null = null;
    let bestArea = 0;
    for (const el of editables) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const input = this.findInputField();
    if (!input) return null;
    const parent = input.parentElement;
    if (!parent) return null;
    parent.style.position = 'relative';
    icon.style.position = 'absolute';
    icon.style.bottom = '8px';
    icon.style.right = '8px';
    icon.style.zIndex = '10000';
    parent.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    if (input instanceof HTMLTextAreaElement) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (input.isContentEditable) {
      input.focus();
      selectAllContent(input);
      insertText(input, text);
      return true;
    }
    return false;
  }

  scrapeThreadContext(): ThreadMessage[] {
    return [];
  }

  checkHealth(): boolean {
    return this.findInputField() !== null;
  }
}
