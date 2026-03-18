/**
 * Each passive-aggressive pattern has a weight. Within the "patterns" category,
 * only the highest-weight match counts (weighted-max-then-sum across categories).
 */
const PASSIVE_AGGRESSIVE_PATTERNS: { pattern: RegExp; weight: number }[] = [
  { pattern: /\bfine\.\s*$/i, weight: 0.35 },
  { pattern: /\bwhatever\b/i, weight: 0.35 },
  { pattern: /\bper my last email\b/i, weight: 0.4 },
  { pattern: /\bas I already mentioned\b/i, weight: 0.35 },
  { pattern: /\bas previously stated\b/i, weight: 0.35 },
  { pattern: /\bnot like I\b.*\bor anything\b/i, weight: 0.35 },
  { pattern: /\bI guess\b.*\b(works|fine|so|whatever)\b/i, weight: 0.35 },
  { pattern: /\bthanks for nothing\b/i, weight: 0.4 },
  { pattern: /\bno worries\b.*\bI'll just\b/i, weight: 0.35 },
  { pattern: /\bmust be nice\b/i, weight: 0.35 },
  { pattern: /\bgood for you\b/i, weight: 0.3 },
  { pattern: /\bas I already explained\b/i, weight: 0.35 },
  { pattern: /\bthis was already covered\b/i, weight: 0.35 },
];

/**
 * Sarcasm patterns — "oh" + positive adjective, sarcastic "sure/wow" phrases,
 * and "that's just <positive>" constructions. Weight: 0.30.
 */
const SARCASM_PATTERNS: RegExp[] = [
  /\boh\s+(great|wonderful|fantastic|perfect)\b/i,
  /\bsure,?\s*(no problem at all|whatever you say)\b/i,
  /\bwow,?\s*(thanks|really|how nice)\b/i,
  /\bthanks for nothing\b/i,
  /\bgood for you\b/i,
  /\bhow nice of you\b/i,
  /\bthat'?s just\s+(great|wonderful|perfect)\b/i,
];
const SARCASM_WEIGHT = 0.3;
const SARCASM_CAP = 0.6;

/**
 * Hedging phrases — if 3+ appear in a single message the tone reads as passive.
 */
const HEDGING_PHRASES: RegExp[] = [
  /\bI think\b/i,
  /\bmaybe\b/i,
  /\bI'?m not sure\b/i,
  /\bpossibly\b/i,
  /\bI guess\b/i,
  /\bsort of\b/i,
  /\bkind of\b/i,
];
const HEDGING_THRESHOLD = 3;
const HEDGING_WEIGHT = 0.25;

/**
 * Exclamation inflation — 3+ consecutive exclamation marks read as aggressive.
 */
const EXCLAMATION_INFLATION_RE = /!{3,}/;
const EXCLAMATION_INFLATION_WEIGHT = 0.25;

/**
 * Each negative keyword has a weight. Within the "keywords" category,
 * only the highest-weight match counts.
 */
const NEGATIVE_KEYWORDS: { keyword: string; weight: number }[] = [
  { keyword: 'stupid', weight: 0.2 },
  { keyword: 'idiot', weight: 0.2 },
  { keyword: 'hate', weight: 0.2 },
  { keyword: 'annoying', weight: 0.15 },
  { keyword: 'useless', weight: 0.2 },
  { keyword: 'pathetic', weight: 0.2 },
  { keyword: 'ridiculous', weight: 0.15 },
  { keyword: 'disgusting', weight: 0.2 },
  { keyword: 'terrible', weight: 0.15 },
  { keyword: 'awful', weight: 0.15 },
  { keyword: 'never mind', weight: 0.15 },
  { keyword: 'forget it', weight: 0.15 },
  { keyword: "don't bother", weight: 0.15 },
];

/**
 * Scores a message from 0 (clean) to 1 (very problematic).
 * Runs synchronously in < 5ms.
 *
 * Uses a weighted-max-then-sum approach:
 *  - Within each category (patterns, keywords, caps, punctuation, custom),
 *    the highest-scoring match is the base score. Additional matches within
 *    the same category add a small bonus (+0.15 each, capped per category).
 *  - Scores are then summed across categories.
 *
 * This prevents a message like "WHATEVER!!!" from inflating its score by
 * matching multiple patterns within one category, while still recognising
 * that multiple distinct passive-aggressive phrases are worse than one.
 *
 * @param customPatterns Optional user-defined regex strings from settings.
 */
export function scoreMessage(text: string, customPatterns: string[] = []): number {
  if (!text || text.trim().length === 0) return 0;

  let patternScore = 0;
  let keywordScore = 0;
  let capsScore = 0;
  let punctuationScore = 0;
  let customScore = 0;
  let sarcasmScore = 0;
  let hedgingScore = 0;
  let exclamationInflationScore = 0;
  const lower = text.toLowerCase();

  // Check passive-aggressive patterns — highest-weight match + small bonus for extras
  const EXTRA_MATCH_BONUS = 0.15;
  const PATTERN_CAP = 0.7;
  let patternMatches = 0;
  for (const { pattern, weight } of PASSIVE_AGGRESSIVE_PATTERNS) {
    if (pattern.test(text)) {
      patternScore = Math.max(patternScore, weight);
      patternMatches++;
    }
  }
  if (patternMatches > 1) {
    patternScore = Math.min(PATTERN_CAP, patternScore + (patternMatches - 1) * EXTRA_MATCH_BONUS);
  }

  // Check negative keywords — highest-weight match + small bonus for extras
  // Uses word-boundary regex to avoid substring false positives (e.g. "whatever" matching "hate")
  const KEYWORD_CAP = 0.4;
  let keywordMatches = 0;
  for (const { keyword, weight } of NEGATIVE_KEYWORDS) {
    const keywordRe = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (keywordRe.test(text)) {
      keywordScore = Math.max(keywordScore, weight);
      keywordMatches++;
    }
  }
  if (keywordMatches > 1) {
    keywordScore = Math.min(KEYWORD_CAP, keywordScore + (keywordMatches - 1) * EXTRA_MATCH_BONUS);
  }

  // ALL CAPS detection (check if >50% of alpha chars are uppercase)
  const alphaChars = text.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 10) {
    const upperRatio = text.replace(/[^A-Z]/g, '').length / alphaChars.length;
    if (upperRatio > 0.5) {
      capsScore = 0.3;
    }
  }

  // Excessive punctuation (!! or ?? or ?!) — single category, one score
  const excessivePunctuation = text.match(/[!?]{2,}/g);
  if (excessivePunctuation) {
    punctuationScore = 0.3;
  }

  // Sarcasm patterns — weighted-max + bonus for extras
  let sarcasmMatches = 0;
  for (const re of SARCASM_PATTERNS) {
    if (re.test(text)) {
      sarcasmScore = Math.max(sarcasmScore, SARCASM_WEIGHT);
      sarcasmMatches++;
    }
  }
  if (sarcasmMatches > 1) {
    sarcasmScore = Math.min(SARCASM_CAP, sarcasmScore + (sarcasmMatches - 1) * EXTRA_MATCH_BONUS);
  }

  // Hedging overload — 3+ hedging phrases in a single message
  let hedgingCount = 0;
  for (const re of HEDGING_PHRASES) {
    if (re.test(text)) {
      hedgingCount++;
    }
  }
  if (hedgingCount >= HEDGING_THRESHOLD) {
    hedgingScore = HEDGING_WEIGHT;
  }

  // Exclamation inflation — 3+ consecutive exclamation marks
  if (EXCLAMATION_INFLATION_RE.test(text)) {
    exclamationInflationScore = EXCLAMATION_INFLATION_WEIGHT;
  }

  // User-defined custom patterns (#9) — take highest-weight match only
  if (customPatterns.length > 0) {
    for (const patStr of customPatterns) {
      try {
        const re = new RegExp(patStr, 'i');
        if (re.test(text)) {
          customScore = Math.max(customScore, 0.3);
        }
      } catch {
        // Skip invalid patterns
      }
    }
  }

  return Math.min(
    1,
    Math.max(
      0,
      patternScore +
        keywordScore +
        capsScore +
        punctuationScore +
        customScore +
        sarcasmScore +
        hedgingScore +
        exclamationInflationScore,
    ),
  );
}
