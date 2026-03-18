/**
 * Tracks per-thread conversation health in memory (per-page lifecycle).
 *
 * Health score starts at 100 and is adjusted based on flagged messages
 * and accepted rewrites. Data is not persisted across page loads.
 */

export interface ThreadHealthData {
  totalAnalyzed: number;
  totalFlagged: number;
  rewritesAccepted: number;
  flagReasons: Map<string, number>;
}

export interface ThreadSummary {
  score: number;
  totalAnalyzed: number;
  totalFlagged: number;
  rewritesAccepted: number;
  topIssues: string[];
}

const FLAG_PENALTY = 10;
const REWRITE_RECOVERY = 5;
const MIN_SCORE = 0;
const MAX_SCORE = 100;
const TOP_ISSUES_LIMIT = 3;

function clampScore(score: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
}

export class ConversationHealthTracker {
  private threads = new Map<string, ThreadHealthData>();

  private getOrCreate(threadId: string): ThreadHealthData {
    let data = this.threads.get(threadId);
    if (!data) {
      data = {
        totalAnalyzed: 0,
        totalFlagged: 0,
        rewritesAccepted: 0,
        flagReasons: new Map(),
      };
      this.threads.set(threadId, data);
    }
    return data;
  }

  /** Record that a message was analyzed (not flagged). */
  recordAnalysis(threadId: string): void {
    const data = this.getOrCreate(threadId);
    data.totalAnalyzed++;
  }

  /** Record that a message was flagged with the given issues. */
  recordFlag(threadId: string, issues: string[]): void {
    const data = this.getOrCreate(threadId);
    data.totalAnalyzed++;
    data.totalFlagged++;
    for (const issue of issues) {
      const normalized = issue.trim();
      if (normalized) {
        data.flagReasons.set(normalized, (data.flagReasons.get(normalized) ?? 0) + 1);
      }
    }
  }

  /** Record that the user accepted a rewrite for this thread. */
  recordRewriteAccepted(threadId: string): void {
    const data = this.getOrCreate(threadId);
    data.rewritesAccepted++;
  }

  /** Compute the health score for a thread. */
  private computeScore(data: ThreadHealthData): number {
    const score = MAX_SCORE - data.totalFlagged * FLAG_PENALTY + data.rewritesAccepted * REWRITE_RECOVERY;
    return clampScore(score);
  }

  /** Get a summary of thread health. Returns null if the thread has no data. */
  getThreadSummary(threadId: string): ThreadSummary {
    const data = this.getOrCreate(threadId);
    const score = this.computeScore(data);

    // Sort flag reasons by frequency descending, take top N
    const sorted = [...data.flagReasons.entries()].sort((a, b) => b[1] - a[1]);
    const topIssues = sorted.slice(0, TOP_ISSUES_LIMIT).map(([issue]) => issue);

    return {
      score,
      totalAnalyzed: data.totalAnalyzed,
      totalFlagged: data.totalFlagged,
      rewritesAccepted: data.rewritesAccepted,
      topIssues,
    };
  }

  /** Check if a thread has enough data to display the health indicator. */
  hasEnoughData(threadId: string): boolean {
    const data = this.threads.get(threadId);
    return data !== undefined && data.totalAnalyzed >= 2;
  }
}
