import type {
  PlatformAdapter,
  MessageToBackground,
  MessageFromBackground,
  IncomingAnalysis,
  Theme,
} from '../shared/types';
import { INCOMING_CHECK_INTERVAL_MS } from '../shared/constants';

function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
}

/** Periodically check incoming messages for tone issues (#14). */
export function startIncomingAnalysis(adapter: PlatformAdapter, _theme: Theme): void {
  const analyzed = new WeakSet<HTMLElement>();

  setInterval(async () => {
    const elements = adapter.getIncomingMessageElements?.() ?? [];
    for (const el of elements) {
      if (analyzed.has(el)) continue;
      analyzed.add(el);

      const text = el.textContent?.trim();
      if (!text || text.length < 10) continue;

      const context = adapter.scrapeThreadContext();
      const response = await sendMessage({
        type: 'analyze-incoming',
        text,
        context,
      });

      if (response.type !== 'incoming-result') continue;
      const result = response.result;
      if (result.riskLevel === 'low') continue;

      const indicator = createIncomingIndicator(result);
      adapter.placeIncomingIndicator?.(el, indicator);
    }
  }, INCOMING_CHECK_INTERVAL_MS);
}

function createIncomingIndicator(result: IncomingAnalysis): HTMLElement {
  const colors = {
    low: { bg: '#e3f2fd', text: '#1565c0' },
    medium: { bg: '#fff3e0', text: '#e65100' },
    high: { bg: '#ffebee', text: '#c62828' },
  };
  const c = colors[result.riskLevel];
  const el = document.createElement('span');
  el.className = 'reword-incoming-indicator';
  el.style.backgroundColor = c.bg;
  el.style.color = c.text;
  el.textContent = `⚠ ${result.riskLevel} tone`;
  el.title = result.interpretation;

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = el.parentElement?.querySelector('.reword-incoming-tooltip');
    if (existing) {
      existing.remove();
      return;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'reword-incoming-tooltip';
    tooltip.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">Tone analysis</div>
      <div style="margin-bottom:4px">${result.issues.map((i) => `<span>• ${i}</span>`).join('<br>')}</div>
      <div style="margin-top:8px;font-style:italic">${result.interpretation}</div>
    `;
    el.parentElement?.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 10000);
  });

  return el;
}
