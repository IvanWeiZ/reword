import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export type { PlatformAdapter };

export class GenericFallbackAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    const editables = document.querySelectorAll<HTMLElement>(
      '[contenteditable="true"], textarea'
    );
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
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
      return true;
    }
    return false;
  }

  scrapeThreadContext(): ThreadMessage[] {
    return [];
  }
}
