import type { PlatformAdapter } from '../shared/types';

// --- Word-level diff ---

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Compute a word-level diff between `original` and `rewritten` using
 * a simple LCS (longest common subsequence) algorithm.
 * Returns an array of segments tagged as equal / added / removed.
 */
export function wordDiff(original: string, rewritten: string): DiffSegment[] {
  const origWords = splitWords(original);
  const rewWords = splitWords(rewritten);

  const lcs = computeLCS(origWords, rewWords);

  const segments: DiffSegment[] = [];
  let oi = 0;
  let ri = 0;

  for (const [li, lj] of lcs) {
    // Words removed from original (before this LCS match)
    if (oi < li) {
      segments.push({ type: 'removed', text: origWords.slice(oi, li).join(' ') });
    }
    // Words added in rewrite (before this LCS match)
    if (ri < lj) {
      segments.push({ type: 'added', text: rewWords.slice(ri, lj).join(' ') });
    }
    // Equal word
    segments.push({ type: 'equal', text: origWords[li] });
    oi = li + 1;
    ri = lj + 1;
  }

  // Remaining words after last LCS match
  if (oi < origWords.length) {
    segments.push({ type: 'removed', text: origWords.slice(oi).join(' ') });
  }
  if (ri < rewWords.length) {
    segments.push({ type: 'added', text: rewWords.slice(ri).join(' ') });
  }

  return segments;
}

/** Split text into words on whitespace, preserving punctuation attached to words. */
function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Compute LCS indices between two word arrays.
 * Returns array of [indexInA, indexInB] pairs for each matched word.
 */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matched pairs
  const pairs: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  pairs.reverse();
  return pairs;
}

/**
 * Render a word-level diff as an HTML string with span tags.
 * Uses classes: reword-diff-added, reword-diff-removed (equal words are bare text).
 */
export function renderDiffHTML(original: string, rewritten: string): string {
  const segments = wordDiff(original, rewritten);
  return segments
    .map((seg) => {
      const escaped = escapeHTML(seg.text);
      switch (seg.type) {
        case 'removed':
          return `<span class="reword-diff-removed">${escaped}</span>`;
        case 'added':
          return `<span class="reword-diff-added">${escaped}</span>`;
        default:
          return escaped;
      }
    })
    .join(' ');
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize text to a comparable snippet for learning mode (#6). */
export function normalizeSnippet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .slice(0, 60);
}

/** Derive recipient communication style from recent thread messages (#8). */
export function deriveRecipientStyle(adapter: PlatformAdapter): string | undefined {
  const context = adapter.scrapeThreadContext();
  const otherMessages = context.filter((m) => m.sender === 'other').map((m) => m.text);
  if (otherMessages.length === 0) return undefined;

  const avgLen = otherMessages.reduce((s, t) => s + t.length, 0) / otherMessages.length;
  const hasEmojis = otherMessages.some((t) => /[\u{1F600}-\u{1F64F}]/u.test(t));
  const hasExclamation = otherMessages.some((t) => t.includes('!'));
  const parts: string[] = [];
  if (avgLen < 30) parts.push('brief');
  else if (avgLen > 150) parts.push('detailed');
  if (hasEmojis) parts.push('uses emojis');
  if (hasExclamation) parts.push('expressive');
  return parts.length > 0 ? parts.join(', ') : undefined;
}
