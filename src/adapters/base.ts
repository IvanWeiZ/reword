import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export type { PlatformAdapter };

/**
 * Write text back to an element, replacing its current content.
 * Works with both contentEditable elements (Gmail, LinkedIn, etc.)
 * and textarea/input elements (generic fallback).
 *
 * Uses execCommand('insertText') as the primary method (still works in Chrome
 * and properly fires framework-compatible input events), with a direct-set
 * fallback for environments where execCommand is unavailable or fails.
 */
/** Check whether an element is contentEditable. */
function isContentEditable(element: HTMLElement): boolean {
  return (
    element.isContentEditable === true ||
    element.getAttribute('contenteditable') === 'true'
  );
}

export function writeBackToElement(element: HTMLElement, text: string): void {
  element.focus();

  // For contentEditable elements (Gmail, LinkedIn, etc.)
  if (isContentEditable(element)) {
    // Select all content, then use insertText via execCommand
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  } else {
    // For textarea/input elements
    (element as HTMLTextAreaElement).select();
  }

  // Use execCommand as primary (still works in Chrome), with direct-set fallback
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    // execCommand may not exist in all environments (e.g. jsdom)
  }
  if (!inserted) {
    // Fallback: direct value set + input event dispatch
    if (isContentEditable(element)) {
      element.textContent = text;
    } else {
      (element as HTMLTextAreaElement).value = text;
    }
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }),
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
    if (input instanceof HTMLTextAreaElement || isContentEditable(input)) {
      writeBackToElement(input, text);
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
