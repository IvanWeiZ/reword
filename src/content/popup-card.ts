import type { AnalysisResult } from '../shared/types';

interface PopupCardOptions {
  onRewrite: (text: string) => void;
  onDismiss: () => void;
}

const RISK_COLORS = {
  low: '#90caf9',
  medium: '#f0a030',
  high: '#ef5350',
};

export class PopupCard {
  element: HTMLElement;
  private options: PopupCardOptions;

  constructor(options: PopupCardOptions) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'reword-card';
    this.element.style.display = 'none';

    // Inject styles if not already present
    if (!document.getElementById('reword-popup-styles')) {
      const style = document.createElement('style');
      style.id = 'reword-popup-styles';
      // Styles are defined inline to avoid CSS import issues in extension context
      style.textContent = `
        .reword-card { position: fixed; bottom: 80px; right: 24px; width: 400px; max-height: 80vh; overflow-y: auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); padding: 20px; z-index: 99999; font-size: 14px; line-height: 1.5; font-family: system-ui, -apple-system, sans-serif; }
        .reword-risk-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; font-weight: 600; }
        .reword-risk-dot { width: 10px; height: 10px; border-radius: 50%; }
        .reword-original { background: #2a2a3e; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 3px solid #666; }
        .reword-original-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .reword-explanation { font-size: 13px; color: #aaa; margin-bottom: 16px; }
        .reword-rewrites { display: flex; flex-direction: column; gap: 10px; }
        .reword-rewrite-option { background: #2a2a3e; padding: 12px; border-radius: 6px; border: 1px solid #444; cursor: pointer; }
        .reword-rewrite-option:hover { border-color: #6366f1; }
        .reword-rewrite-label { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #aaa; }
        .reword-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end; }
        .reword-send-original, .reword-cancel { padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; background: none; border: none; color: #888; }
      `;
      document.head.appendChild(style);
    }
  }

  show(result: AnalysisResult, originalText: string): void {
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
      <div class="reword-explanation">${this.esc(result.issues.join('. '))}</div>
      <div class="reword-rewrites">
        ${result.rewrites.map((r, i) => `
          <div class="reword-rewrite-option" data-index="${i}">
            <div class="reword-rewrite-label">${this.esc(r.label)}</div>
            <div>${this.esc(r.text)}</div>
          </div>
        `).join('')}
      </div>
      <div class="reword-actions">
        <button class="reword-send-original">Send original</button>
        <button class="reword-cancel">Cancel</button>
      </div>
    `;

    this.element.querySelectorAll<HTMLElement>('.reword-rewrite-option').forEach(el => {
      el.addEventListener('click', () => {
        const i = parseInt(el.dataset.index ?? '0', 10);
        this.options.onRewrite(result.rewrites[i].text);
        this.hide();
      });
    });

    this.element.querySelector('.reword-send-original')?.addEventListener('click', () => {
      this.options.onDismiss();
      this.hide();
    });

    this.element.querySelector('.reword-cancel')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
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
