import type { RiskLevel } from '../shared/types';

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string }> = {
  low: { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' },
  medium: { bg: '#fff3e0', border: '#f0a030', text: '#e65100' },
  high: { bg: '#ffebee', border: '#ef5350', text: '#c62828' },
};

export class TriggerIcon {
  element: HTMLElement;
  private _riskLevel: RiskLevel = 'low';
  private onClick: () => void;

  constructor(onClick: () => void) {
    this.onClick = onClick;
    this.element = document.createElement('div');
    this.element.style.display = 'none';
    this.element.style.cursor = 'pointer';
    this.element.style.fontFamily = 'system-ui, sans-serif';
    this.element.style.fontSize = '12px';
    this.element.style.fontWeight = '500';
    this.element.style.padding = '4px 10px';
    this.element.style.borderRadius = '4px';
    this.element.style.border = '1px solid';
    this.element.style.display = 'none';
    this.element.style.alignItems = 'center';
    this.element.style.gap = '6px';
    this.element.style.zIndex = '10000';
    this.element.innerHTML =
      '<span class="reword-dot" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span><span>Review tone</span>';
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onClick();
    });
  }

  show(riskLevel: RiskLevel): void {
    this._riskLevel = riskLevel;
    const colors = RISK_COLORS[riskLevel];
    this.element.style.backgroundColor = colors.bg;
    this.element.style.borderColor = colors.border;
    this.element.style.color = colors.text;
    const dot = this.element.querySelector<HTMLElement>('.reword-dot');
    if (dot) dot.style.backgroundColor = colors.border;
    this.element.style.display = 'inline-flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }
}
