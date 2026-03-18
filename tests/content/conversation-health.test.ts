import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationHealthTracker } from '../../src/content/conversation-health';

describe('ConversationHealthTracker', () => {
  let tracker: ConversationHealthTracker;

  beforeEach(() => {
    tracker = new ConversationHealthTracker();
  });

  it('new thread starts at score 100', () => {
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.score).toBe(100);
    expect(summary.totalAnalyzed).toBe(0);
    expect(summary.totalFlagged).toBe(0);
    expect(summary.rewritesAccepted).toBe(0);
    expect(summary.topIssues).toEqual([]);
  });

  it('flagged message reduces score', () => {
    tracker.recordFlag('thread-1', ['passive-aggressive tone']);
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.score).toBe(90);
    expect(summary.totalFlagged).toBe(1);
    expect(summary.totalAnalyzed).toBe(1);
  });

  it('accepted rewrite recovers some score', () => {
    tracker.recordFlag('thread-1', ['dismissive']);
    tracker.recordRewriteAccepted('thread-1');
    const summary = tracker.getThreadSummary('thread-1');
    // 100 - 10 (flag) + 5 (rewrite) = 95
    expect(summary.score).toBe(95);
    expect(summary.rewritesAccepted).toBe(1);
  });

  it('multiple flags compound', () => {
    tracker.recordFlag('thread-1', ['harsh tone']);
    tracker.recordFlag('thread-1', ['passive-aggressive']);
    tracker.recordFlag('thread-1', ['dismissive']);
    const summary = tracker.getThreadSummary('thread-1');
    // 100 - 10*3 = 70
    expect(summary.score).toBe(70);
    expect(summary.totalFlagged).toBe(3);
  });

  it('score never goes below 0', () => {
    // Flag 12 times to push score well past 0
    for (let i = 0; i < 12; i++) {
      tracker.recordFlag('thread-1', ['harsh']);
    }
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.score).toBe(0);
  });

  it('score never goes above 100', () => {
    // Accept many rewrites without flags
    for (let i = 0; i < 30; i++) {
      tracker.recordRewriteAccepted('thread-1');
    }
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.score).toBe(100);
  });

  it('summary includes top issues sorted by frequency', () => {
    tracker.recordFlag('thread-1', ['passive-aggressive']);
    tracker.recordFlag('thread-1', ['passive-aggressive', 'harsh']);
    tracker.recordFlag('thread-1', ['harsh', 'dismissive']);
    tracker.recordFlag('thread-1', ['passive-aggressive']);

    const summary = tracker.getThreadSummary('thread-1');
    // passive-aggressive: 3, harsh: 2, dismissive: 1
    expect(summary.topIssues[0]).toBe('passive-aggressive');
    expect(summary.topIssues[1]).toBe('harsh');
    expect(summary.topIssues[2]).toBe('dismissive');
    expect(summary.topIssues.length).toBe(3);
  });

  it('different threads are tracked independently', () => {
    tracker.recordFlag('thread-a', ['harsh']);
    tracker.recordFlag('thread-a', ['harsh']);
    tracker.recordAnalysis('thread-b');
    tracker.recordAnalysis('thread-b');

    const summaryA = tracker.getThreadSummary('thread-a');
    const summaryB = tracker.getThreadSummary('thread-b');

    expect(summaryA.score).toBe(80);
    expect(summaryA.totalFlagged).toBe(2);

    expect(summaryB.score).toBe(100);
    expect(summaryB.totalFlagged).toBe(0);
    expect(summaryB.totalAnalyzed).toBe(2);
  });

  it('hasEnoughData returns false for fewer than 2 analyses', () => {
    expect(tracker.hasEnoughData('thread-1')).toBe(false);
    tracker.recordAnalysis('thread-1');
    expect(tracker.hasEnoughData('thread-1')).toBe(false);
    tracker.recordAnalysis('thread-1');
    expect(tracker.hasEnoughData('thread-1')).toBe(true);
  });

  it('recordFlag counts as an analysis for hasEnoughData', () => {
    tracker.recordFlag('thread-1', ['harsh']);
    tracker.recordFlag('thread-1', ['dismissive']);
    expect(tracker.hasEnoughData('thread-1')).toBe(true);
  });

  it('clean analysis does not reduce score', () => {
    tracker.recordAnalysis('thread-1');
    tracker.recordAnalysis('thread-1');
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.score).toBe(100);
    expect(summary.totalAnalyzed).toBe(2);
    expect(summary.totalFlagged).toBe(0);
  });

  it('top issues are limited to 3', () => {
    tracker.recordFlag('thread-1', ['issue-a', 'issue-b', 'issue-c', 'issue-d']);
    const summary = tracker.getThreadSummary('thread-1');
    expect(summary.topIssues.length).toBe(3);
  });
});
