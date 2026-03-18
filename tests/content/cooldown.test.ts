import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CooldownTracker,
  COOLDOWN_WINDOW_MS,
  COOLDOWN_THRESHOLD,
} from '../../src/content/cooldown';

describe('CooldownTracker', () => {
  let tracker: CooldownTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new CooldownTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false with fewer than 3 analyses', () => {
    tracker.recordAnalysis();
    tracker.recordAnalysis();
    expect(tracker.shouldSuggestCooldown()).toBe(false);
  });

  it('returns false with zero analyses', () => {
    expect(tracker.shouldSuggestCooldown()).toBe(false);
  });

  it('returns true with 3 analyses within 5 minutes', () => {
    tracker.recordAnalysis();
    vi.advanceTimersByTime(60_000); // 1 minute
    tracker.recordAnalysis();
    vi.advanceTimersByTime(60_000); // 2 minutes total
    tracker.recordAnalysis();
    expect(tracker.shouldSuggestCooldown()).toBe(true);
  });

  it('returns true with more than 3 analyses within 5 minutes', () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordAnalysis();
      vi.advanceTimersByTime(30_000);
    }
    expect(tracker.shouldSuggestCooldown()).toBe(true);
  });

  it('returns false when analyses are spread over more than 5 minutes', () => {
    tracker.recordAnalysis();
    vi.advanceTimersByTime(3 * 60_000); // 3 minutes
    tracker.recordAnalysis();
    vi.advanceTimersByTime(3 * 60_000); // 6 minutes total
    tracker.recordAnalysis();
    // First analysis is now > 5 minutes old, so only 2 remain
    expect(tracker.shouldSuggestCooldown()).toBe(false);
  });

  it('cleans up old timestamps on recordAnalysis', () => {
    tracker.recordAnalysis();
    tracker.recordAnalysis();
    tracker.recordAnalysis();
    expect(tracker.shouldSuggestCooldown()).toBe(true);

    // Advance past the cooldown window
    vi.advanceTimersByTime(COOLDOWN_WINDOW_MS + 1000);

    // Record one new analysis; old ones should be cleaned up
    tracker.recordAnalysis();
    expect(tracker.shouldSuggestCooldown()).toBe(false);
  });

  it('exports expected constant values', () => {
    expect(COOLDOWN_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(COOLDOWN_THRESHOLD).toBe(3);
  });
});
