import type { AnalysisResult, Theme } from '../shared/types';

interface PopupCardOptions {
  onRewrite: (text: string) => void;
  onDismiss: () => void;
  onUndo?: () => void;
}

const RISK_COLORS = {
  low: '#90caf9',
  medium: '#f0a030',
  high: '#ef5350',
};

export class PopupCard {
  element: HTMLElement;
  private options: PopupCardOptions;
  private theme: Theme = 'auto';
  private lastOriginalText = '';
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private currentResult: AnalysisResult | null = null;
  private streamingEl: HTMLElement | null = null;

  constructor(options: PopupCardOptions) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'reword-card';
    this.element.style.display = 'none';
    this.injectStyles();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.updateThemeStyles();
  }

  private isDark(): boolean {
    if (this.theme === 'dark') return true;
    if (this.theme === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
  }

  private injectStyles(): void {
    if (document.getElementById('reword-popup-styles')) return;
    const style = document.createElement('style');
    style.id = 'reword-popup-styles';
    style.textContent = this.buildCSS();
    document.head.appendChild(style);
  }

  private updateThemeStyles(): void {
    const style = document.getElementById('reword-popup-styles');
    if (style) style.textContent = this.buildCSS();
  }

  private buildCSS(): string {
    const dark = this.isDark();
    const bg = dark ? '#1a1a2e' : '#ffffff';
    const text = dark ? '#e0e0e0' : '#1a1a2e';
    const cardBg = dark ? '#2a2a3e' : '#f5f5f5';
    const border = dark ? '#444' : '#ddd';
    const muted = dark ? '#aaa' : '#666';
    const mutedBg = dark ? '#333' : '#e0e0e0';
    const shadow = dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)';

    return `
      .reword-card { position: fixed; bottom: 80px; right: 24px; width: 400px; max-height: 80vh; overflow-y: auto; background: ${bg}; color: ${text}; border-radius: 12px; box-shadow: 0 8px 32px ${shadow}; padding: 20px; z-index: 99999; font-size: 14px; line-height: 1.5; font-family: system-ui, -apple-system, sans-serif; }
      .reword-risk-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; font-weight: 600; }
      .reword-risk-dot { width: 10px; height: 10px; border-radius: 50%; }
      .reword-original { background: ${cardBg}; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 3px solid ${muted}; }
      .reword-original-label { font-size: 11px; color: ${muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
      .reword-explanation { font-size: 13px; color: ${muted}; margin-bottom: 16px; }
      .reword-details { margin-bottom: 16px; }
      .reword-details-toggle { font-size: 12px; color: ${muted}; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; }
      .reword-details-content { display: none; margin-top: 8px; font-size: 13px; color: ${muted}; background: ${cardBg}; padding: 10px; border-radius: 6px; }
      .reword-details-content.reword-expanded { display: block; }
      .reword-rewrites { display: flex; flex-direction: column; gap: 10px; }
      .reword-rewrite-option { background: ${cardBg}; padding: 12px; border-radius: 6px; border: 1px solid ${border}; cursor: pointer; position: relative; }
      .reword-rewrite-option:hover { border-color: #6366f1; }
      .reword-rewrite-label { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: ${muted}; }
      .reword-rewrite-shortcut { position: absolute; top: 8px; right: 10px; font-size: 10px; color: ${muted}; opacity: 0.6; }
      .reword-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end; }
      .reword-send-original, .reword-cancel { padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; background: none; border: none; color: ${muted}; }
      .reword-undo-toast { position: fixed; bottom: 24px; right: 24px; background: ${cardBg}; color: ${text}; padding: 10px 16px; border-radius: 8px; box-shadow: 0 4px 16px ${shadow}; z-index: 100000; display: flex; gap: 12px; align-items: center; font-size: 13px; font-family: system-ui; }
      .reword-undo-btn { background: #6366f1; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .reword-shortcut-hint { font-size: 11px; color: ${muted}; text-align: center; margin-top: 8px; opacity: 0.7; }
      .reword-streaming-indicator { color: ${muted}; font-size: 13px; padding: 12px; text-align: center; }
      .reword-incoming-indicator { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-family: system-ui; }
      .reword-incoming-tooltip { position: absolute; background: ${bg}; color: ${text}; padding: 12px; border-radius: 8px; box-shadow: 0 4px 16px ${shadow}; z-index: 99998; max-width: 300px; font-size: 13px; font-family: system-ui; }
      .reword-btn-muted { background: ${mutedBg}; color: ${text}; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    `;
  }

  show(result: AnalysisResult, originalText: string): void {
    this.currentResult = result;
    this.lastOriginalText = originalText;
    const dotColor = RISK_COLORS[result.riskLevel];

    this.element.innerHTML = `
      <div class="reword-risk-indicator">
        <span class="reword-risk-dot" style="background:${dotColor}"></span>
        <span>${this.cap(result.riskLevel)} risk — ${this.esc(result.explanation)}</span>
      </div>
      <div class="reword-original">
        <div class="reword-original-label">Your message</div>
        <div>${this.esc(originalText)}</div>
      </div>
      ${this.buildDetailsSection(result)}
      <div class="reword-explanation">${this.esc(result.issues.join('. '))}</div>
      <div class="reword-rewrites">
        ${result.rewrites
          .map(
            (r, i) => `
          <div class="reword-rewrite-option" data-index="${i}">
            <div class="reword-rewrite-label">${this.esc(r.label)}</div>
            <div>${this.esc(r.text)}</div>
            <span class="reword-rewrite-shortcut">${i + 1}</span>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="reword-shortcut-hint">Press 1-${result.rewrites.length} to quick-accept, Esc to close</div>
      <div class="reword-actions">
        <button class="reword-send-original">Send original</button>
        <button class="reword-cancel">Cancel</button>
      </div>
    `;

    this.bindCardEvents(result);
    this.bindKeyboardShortcuts(result);
    this.element.style.display = 'block';
  }

  showStreaming(): void {
    this.element.innerHTML = `
      <div class="reword-streaming-indicator">Analyzing your message…</div>
    `;
    this.streamingEl = this.element.querySelector('.reword-streaming-indicator');
    this.element.style.display = 'block';
  }

  updateStreaming(partialText: string): void {
    if (this.streamingEl) {
      this.streamingEl.textContent = partialText
        ? `Analyzing… ${partialText.slice(0, 50)}`
        : 'Analyzing your message…';
    }
  }

  hide(): void {
    this.element.style.display = 'none';
    this.streamingEl = null;
    this.removeKeyboardShortcuts();
  }

  private buildDetailsSection(result: AnalysisResult): string {
    if (result.issues.length === 0) return '';
    const issuesList = result.issues.map((issue) => `<li>${this.esc(issue)}</li>`).join('');
    return `
      <div class="reword-details">
        <button class="reword-details-toggle">Why was this flagged?</button>
        <div class="reword-details-content">
          <ul style="margin:0;padding-left:16px">${issuesList}</ul>
          <p style="margin-top:8px">${this.esc(result.explanation)}</p>
        </div>
      </div>
    `;
  }

  private bindCardEvents(result: AnalysisResult): void {
    // Rewrite options
    this.element.querySelectorAll<HTMLElement>('.reword-rewrite-option').forEach((el) => {
      el.addEventListener('click', () => {
        const i = parseInt(el.dataset.index ?? '0', 10);
        this.acceptRewrite(result.rewrites[i].text);
      });
    });

    // Send original
    this.element.querySelector('.reword-send-original')?.addEventListener('click', () => {
      this.options.onDismiss();
      this.hide();
    });

    // Cancel
    this.element.querySelector('.reword-cancel')?.addEventListener('click', () => {
      this.hide();
    });

    // "Why was this flagged?" toggle
    this.element.querySelector('.reword-details-toggle')?.addEventListener('click', () => {
      const content = this.element.querySelector('.reword-details-content');
      content?.classList.toggle('reword-expanded');
    });
  }

  private bindKeyboardShortcuts(result: AnalysisResult): void {
    this.removeKeyboardShortcuts();
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.element.style.display === 'none') return;

      // Escape closes popup
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        return;
      }

      // Number keys 1-9 for quick rewrite selection
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= result.rewrites.length) {
        e.preventDefault();
        this.acceptRewrite(result.rewrites[num - 1].text);
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private removeKeyboardShortcuts(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private acceptRewrite(text: string): void {
    this.options.onRewrite(text);
    this.hide();
    this.showUndoToast();
  }

  private showUndoToast(): void {
    const toast = document.createElement('div');
    toast.className = 'reword-undo-toast';
    toast.innerHTML = `
      <span>Rewrite applied</span>
      <button class="reword-undo-btn">Undo</button>
    `;
    toast.querySelector('.reword-undo-btn')?.addEventListener('click', () => {
      this.options.onUndo?.();
      toast.remove();
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  private esc(text: string): string {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
