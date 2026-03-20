/**
 * InlineSuggestion — shows ghost text (the top rewrite) directly in the
 * compose field so the user can accept it with a single Tab press.
 *
 * For contentEditable elements a <span class="reword-ghost"> is appended.
 * For <textarea> elements (where we cannot inject HTML) a floating tooltip
 * is positioned near the bottom-right of the textarea instead.
 */

function injectGhostStyles(): void {
  if (document.getElementById('reword-ghost-styles')) return;
  const style = document.createElement('style');
  style.id = 'reword-ghost-styles';
  style.textContent = `
    .reword-ghost {
      opacity: 0.4;
      color: #888;
      pointer-events: none;
      user-select: none;
    }
    .reword-ghost-tooltip {
      position: absolute;
      opacity: 0.4;
      color: #888;
      pointer-events: none;
      user-select: none;
      font-size: 12px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px 8px;
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

export class InlineSuggestion {
  private ghostSpan: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private targetElement: HTMLElement | null = null;
  private rewriteText = '';
  private originalText = '';
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private inputHandler: ((e: Event) => void) | null = null;
  private onAccept: ((text: string) => void) | null = null;

  /**
   * Show ghost text for the given rewrite in the target compose field.
   *
   * @param target     The input / contentEditable element
   * @param original   The user's current text (so we can restore if needed)
   * @param rewrite    The suggested rewrite text to show as ghost
   * @param onAccept   Called when the user presses Tab to accept
   */
  show(
    target: HTMLElement,
    original: string,
    rewrite: string,
    onAccept: (text: string) => void,
  ): void {
    // Clean up any previous suggestion
    this.dismiss();

    injectGhostStyles();

    this.targetElement = target;
    this.originalText = original;
    this.rewriteText = rewrite;
    this.onAccept = onAccept;

    if (this.isContentEditable(target)) {
      this.showGhostSpan(target, rewrite);
    } else {
      this.showTooltip(target, rewrite);
    }

    this.bindKeyboard();
    this.bindInputDismiss();
  }

  /** Remove ghost text / tooltip and unbind all listeners. */
  dismiss(): void {
    if (this.ghostSpan && this.ghostSpan.parentNode) {
      this.ghostSpan.parentNode.removeChild(this.ghostSpan);
    }
    this.ghostSpan = null;

    if (this.tooltipEl && this.tooltipEl.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    }
    this.tooltipEl = null;

    this.unbindKeyboard();
    this.unbindInputDismiss();

    this.targetElement = null;
    this.rewriteText = '';
    this.originalText = '';
    this.onAccept = null;
  }

  /** Whether ghost text is currently visible. */
  get isVisible(): boolean {
    return this.ghostSpan !== null || this.tooltipEl !== null;
  }

  /**
   * Ensure no ghost text remains in the DOM.
   * Call this right before the user sends a message to be safe.
   */
  cleanupBeforeSend(): void {
    this.dismiss();
  }

  // --- Private helpers ---

  private isContentEditable(el: HTMLElement): boolean {
    return el.isContentEditable === true || el.getAttribute('contenteditable') === 'true';
  }

  private showGhostSpan(target: HTMLElement, text: string): void {
    const span = document.createElement('span');
    span.className = 'reword-ghost';
    span.setAttribute('data-reword-ghost', 'true');
    span.textContent = ' ' + text;
    target.appendChild(span);
    this.ghostSpan = span;
  }

  private showTooltip(target: HTMLElement, text: string): void {
    const tooltip = document.createElement('div');
    tooltip.className = 'reword-ghost-tooltip';
    tooltip.setAttribute('data-reword-ghost', 'true');
    tooltip.textContent = 'Tab to accept: ' + text;

    // Position relative to the target element
    const parent = target.parentElement;
    if (parent) {
      parent.style.position = 'relative';
      tooltip.style.bottom = '4px';
      tooltip.style.left = '4px';
      parent.appendChild(tooltip);
    } else {
      document.body.appendChild(tooltip);
    }

    this.tooltipEl = tooltip;
  }

  private bindKeyboard(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.isVisible) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const text = this.rewriteText;
        const accept = this.onAccept;
        this.dismiss();
        if (accept) accept(text);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.dismiss();
        return;
      }
    };
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  private unbindKeyboard(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  private bindInputDismiss(): void {
    if (!this.targetElement) return;
    this.inputHandler = () => {
      this.dismiss();
    };
    this.targetElement.addEventListener('input', this.inputHandler);
  }

  private unbindInputDismiss(): void {
    if (this.targetElement && this.inputHandler) {
      this.targetElement.removeEventListener('input', this.inputHandler);
    }
    this.inputHandler = null;
  }
}
