import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldShowSummary,
  buildSummaryText,
  showWeeklySummary,
  createWeeklySummaryElement,
} from '../../src/content/weekly-summary';
import type { WeeklyStats } from '../../src/shared/types';

function makeStats(overrides: Partial<WeeklyStats> = {}): WeeklyStats {
  return {
    weekStart: '2026-03-09',
    analyzed: 12,
    flagged: 3,
    rewritesAccepted: 5,
    ...overrides,
  };
}

describe('shouldShowSummary', () => {
  it('returns true when never shown before and stats exist', () => {
    expect(shouldShowSummary('', makeStats())).toBe(true);
  });

  it('returns false when shown recently (less than 7 days ago)', () => {
    const now = new Date('2026-03-17T12:00:00Z');
    const lastShown = '2026-03-14T12:00:00Z'; // 3 days ago
    expect(shouldShowSummary(lastShown, makeStats(), now)).toBe(false);
  });

  it('returns true when shown 7+ days ago', () => {
    const now = new Date('2026-03-17T12:00:00Z');
    const lastShown = '2026-03-09T12:00:00Z'; // 8 days ago
    expect(shouldShowSummary(lastShown, makeStats(), now)).toBe(true);
  });

  it('returns true when shown exactly 7 days ago', () => {
    const now = new Date('2026-03-17T12:00:00Z');
    const lastShown = '2026-03-10T12:00:00Z'; // exactly 7 days
    expect(shouldShowSummary(lastShown, makeStats(), now)).toBe(true);
  });

  it('returns false when all stats are zero', () => {
    const stats = makeStats({ analyzed: 0, flagged: 0, rewritesAccepted: 0 });
    expect(shouldShowSummary('', stats)).toBe(false);
  });
});

describe('buildSummaryText', () => {
  it('shows analyzed count', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ analyzed: 8, rewritesAccepted: 0 }),
      previousWeek: null,
    });
    expect(text).toContain('You refined 8 messages');
  });

  it('shows singular form for 1 message', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ analyzed: 1, rewritesAccepted: 0 }),
      previousWeek: null,
    });
    expect(text).toContain('You refined 1 message.');
  });

  it('shows fewer flags than last week', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ flagged: 2 }),
      previousWeek: makeStats({ flagged: 5 }),
    });
    expect(text).toContain('3 fewer flags than last week');
  });

  it('shows more flags than last week', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ flagged: 7 }),
      previousWeek: makeStats({ flagged: 3 }),
    });
    expect(text).toContain('4 more flags than last week');
  });

  it('shows same flags message', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ flagged: 3 }),
      previousWeek: makeStats({ flagged: 3 }),
    });
    expect(text).toContain('Same number of flags as last week');
  });

  it('shows kinder words message when rewrites accepted', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ rewritesAccepted: 4 }),
      previousWeek: null,
    });
    expect(text).toContain('You chose kinder words 4 times');
  });

  it('does not show kinder words message when zero rewrites', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ rewritesAccepted: 0 }),
      previousWeek: null,
    });
    expect(text).not.toContain('kinder words');
  });

  it('does not compare flags when no previous week data', () => {
    const text = buildSummaryText({
      currentWeek: makeStats({ flagged: 5 }),
      previousWeek: null,
    });
    expect(text).not.toContain('than last week');
  });
});

describe('createWeeklySummaryElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('creates element with correct class', () => {
    const el = createWeeklySummaryElement('Test message');
    expect(el.className).toBe('reword-weekly-summary');
  });

  it('displays the provided text', () => {
    const el = createWeeklySummaryElement('Hello world');
    const textEl = el.querySelector('.reword-weekly-summary-text');
    expect(textEl?.textContent).toBe('Hello world');
  });

  it('includes a close button', () => {
    const el = createWeeklySummaryElement('Test');
    const closeBtn = el.querySelector('.reword-weekly-summary-close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.textContent).toBe('\u00d7');
  });

  it('includes the Reword Weekly label', () => {
    const el = createWeeklySummaryElement('Test');
    const label = el.querySelector('.reword-weekly-summary-label');
    expect(label?.textContent).toBe('Reword Weekly');
  });

  it('injects styles into head', () => {
    createWeeklySummaryElement('Test');
    const style = document.querySelector('style[data-reword-weekly-summary]');
    expect(style).not.toBeNull();
  });
});

describe('showWeeklySummary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends card to document body', () => {
    showWeeklySummary({
      currentWeek: makeStats(),
      previousWeek: null,
    });
    const card = document.querySelector('.reword-weekly-summary');
    expect(card).not.toBeNull();
  });

  it('auto-dismisses after 8 seconds', () => {
    showWeeklySummary({
      currentWeek: makeStats(),
      previousWeek: null,
    });

    const card = document.querySelector('.reword-weekly-summary');
    expect(card).not.toBeNull();

    // After 8s, dismiss animation starts (adds class)
    vi.advanceTimersByTime(8000);
    expect(card?.classList.contains('reword-summary-dismissing')).toBe(true);

    // After the 300ms animation, element is removed
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.reword-weekly-summary')).toBeNull();
  });

  it('dismisses on click', () => {
    showWeeklySummary({
      currentWeek: makeStats(),
      previousWeek: null,
    });

    const card = document.querySelector('.reword-weekly-summary') as HTMLElement;
    card.click();
    expect(card.classList.contains('reword-summary-dismissing')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(document.querySelector('.reword-weekly-summary')).toBeNull();
  });

  it('dismisses on close button click', () => {
    showWeeklySummary({
      currentWeek: makeStats(),
      previousWeek: null,
    });

    const closeBtn = document.querySelector('.reword-weekly-summary-close') as HTMLElement;
    closeBtn.click();

    const card = document.querySelector('.reword-weekly-summary');
    expect(card?.classList.contains('reword-summary-dismissing')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(document.querySelector('.reword-weekly-summary')).toBeNull();
  });

  it('displays correct stats in the card text', () => {
    showWeeklySummary({
      currentWeek: makeStats({ analyzed: 15, flagged: 2, rewritesAccepted: 7 }),
      previousWeek: makeStats({ flagged: 6 }),
    });

    const textEl = document.querySelector('.reword-weekly-summary-text');
    expect(textEl?.textContent).toContain('You refined 15 messages');
    expect(textEl?.textContent).toContain('4 fewer flags than last week');
    expect(textEl?.textContent).toContain('You chose kinder words 7 times');
  });
});
