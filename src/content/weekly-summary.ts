import type { WeeklyStats } from '../shared/types';
import { WEEKLY_SUMMARY_DISPLAY_MS } from '../shared/constants';

export interface WeeklySummaryData {
  currentWeek: WeeklyStats;
  previousWeek: WeeklyStats | null;
}

export function buildSummaryText(data: WeeklySummaryData): string {
  const { currentWeek, previousWeek } = data;
  const lines: string[] = [];

  const analyzed = currentWeek.analyzed;
  lines.push(`This week: You refined ${analyzed} message${analyzed !== 1 ? 's' : ''}.`);

  if (previousWeek && previousWeek.flagged > 0) {
    const diff = previousWeek.flagged - currentWeek.flagged;
    if (diff > 0) {
      lines.push(`${diff} fewer flag${diff !== 1 ? 's' : ''} than last week.`);
    } else if (diff === 0) {
      lines.push('Same number of flags as last week.');
    } else {
      lines.push(`${Math.abs(diff)} more flag${Math.abs(diff) !== 1 ? 's' : ''} than last week.`);
    }
  }

  if (currentWeek.rewritesAccepted > 0) {
    lines.push(
      `You chose kinder words ${currentWeek.rewritesAccepted} time${currentWeek.rewritesAccepted !== 1 ? 's' : ''}.`,
    );
  }

  return lines.join(' ');
}

export function shouldShowSummary(
  lastShown: string,
  currentWeek: WeeklyStats,
  now: Date = new Date(),
): boolean {
  // Must have some stats to show
  if (
    currentWeek.analyzed === 0 &&
    currentWeek.flagged === 0 &&
    currentWeek.rewritesAccepted === 0
  ) {
    return false;
  }

  // Never shown before
  if (!lastShown) return true;

  const lastDate = new Date(lastShown);
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

export function createWeeklySummaryElement(text: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'reword-weekly-summary';

  // Inject styles
  if (!document.querySelector('style[data-reword-weekly-summary]')) {
    const style = document.createElement('style');
    style.setAttribute('data-reword-weekly-summary', '');
    style.textContent = `
      .reword-weekly-summary {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        max-width: 340px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
        border: 1px solid #bbf7d0;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #166534;
        opacity: 0;
        transform: translateY(12px);
        animation: reword-summary-in 0.4s ease-out forwards;
        cursor: pointer;
      }

      .reword-weekly-summary.reword-summary-dismissing {
        animation: reword-summary-out 0.3s ease-in forwards;
      }

      .reword-weekly-summary-close {
        position: absolute;
        top: 8px;
        right: 10px;
        background: none;
        border: none;
        color: #86efac;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .reword-weekly-summary-close:hover {
        color: #166534;
      }

      .reword-weekly-summary-text {
        margin: 0;
        padding-right: 16px;
      }

      .reword-weekly-summary-label {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #4ade80;
        margin-bottom: 4px;
        font-weight: 600;
      }

      @keyframes reword-summary-in {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes reword-summary-out {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(12px); }
      }
    `;
    document.head.appendChild(style);
  }

  const label = document.createElement('span');
  label.className = 'reword-weekly-summary-label';
  label.textContent = 'Reword Weekly';

  const textEl = document.createElement('p');
  textEl.className = 'reword-weekly-summary-text';
  textEl.textContent = text;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'reword-weekly-summary-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');

  card.appendChild(label);
  card.appendChild(textEl);
  card.appendChild(closeBtn);

  return card;
}

export function showWeeklySummary(data: WeeklySummaryData): HTMLElement {
  const text = buildSummaryText(data);
  const card = createWeeklySummaryElement(text);

  function dismiss() {
    if (card.classList.contains('reword-summary-dismissing')) return;
    card.classList.add('reword-summary-dismissing');
    setTimeout(() => card.remove(), 300);
  }

  card.addEventListener('click', dismiss);
  const closeBtn = card.querySelector('.reword-weekly-summary-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
  }

  document.body.appendChild(card);

  // Auto-dismiss after timeout
  setTimeout(dismiss, WEEKLY_SUMMARY_DISPLAY_MS);

  return card;
}
