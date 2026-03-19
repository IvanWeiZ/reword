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
 * Profanity — these are unambiguously hostile and should trigger on their own.
 * Scored as a separate category so a single profane word crosses threshold.
 */
const PROFANITY_PATTERNS: RegExp[] = [
  /\bfuck\b/i, /\bfucking\b/i, /\bfucked\b/i, /\bfuck\s?(you|off|this|that)\b/i,
  /\bshit\b/i, /\bshitty\b/i, /\bbullshit\b/i,
  /\bass\b/i, /\basshole\b/i,
  /\bbitch\b/i, /\bbitching\b/i,
  /\bdamn\s?(you|it)\b/i,
  /\bstfu\b/i, /\bwtf\b/i, /\bgtfo\b/i,
  /\bscrew\s?(you|off|this|that)\b/i,
  /\bpiss\s?(off|me)\b/i,
  /\bcrap\b/i,
  /\bdumbass\b/i, /\bdumb\s+ass\b/i,
  /\bjackass\b/i,
  /\bmoron\b/i, /\bimbecile\b/i,
];
const PROFANITY_WEIGHT = 0.45;

/**
 * Directed insults — "you are [negative]" constructions are worse than standalone keywords.
 */
const DIRECTED_INSULT_RE = /\byou\s+(are|r)\s+(\w+\s+)?(stupid|dumb|useless|pathetic|terrible|awful|incompetent|worthless|an?\s+idiot|an?\s+moron)\b/i;
const DIRECTED_INSULT_WEIGHT = 0.45;

/**
 * Negative emojis — inherently hostile or dismissive emoji.
 * 🙄 😒 😠 😡 😤 🤬 💩 🖕 👎 🤦 🤡
 */
const NEGATIVE_EMOJI_RE = /[\u{1F644}\u{1F612}\u{1F620}\u{1F621}\u{1F624}\u{1F92C}\u{1F4A9}\u{1F595}\u{1F44E}\u{1F926}\u{1F921}]/u;
const NEGATIVE_EMOJI_WEIGHT = 0.3;

/**
 * Sarcastic emoji — 🙂 😊 🙃 ☺ after dismissive/negative text.
 */
const SARCASTIC_EMOJI_RE = /\b(fine|whatever|sure|okay|ok|great|thanks|right)\b[.!,]?\s*[\u{1F642}\u{1F60A}\u{1F643}\u{263A}]/iu;
const SARCASTIC_EMOJI_WEIGHT = 0.25;

/**
 * Each negative keyword has a weight. Within the "keywords" category,
 * only the highest-weight match counts.
 */
const NEGATIVE_KEYWORDS: { re: RegExp; weight: number }[] = [
  { re: /\bstupid\b/i, weight: 0.4 },
  { re: /\bidiot\b/i, weight: 0.4 },
  { re: /\bhate\b/i, weight: 0.2 },
  { re: /\bannoying\b/i, weight: 0.15 },
  { re: /\buseless\b/i, weight: 0.4 },
  { re: /\bpathetic\b/i, weight: 0.4 },
  { re: /\bridiculous\b/i, weight: 0.15 },
  { re: /\bdisgusting\b/i, weight: 0.3 },
  { re: /\bterrible\b/i, weight: 0.2 },
  { re: /\bawful\b/i, weight: 0.2 },
  { re: /\bincompetent\b/i, weight: 0.4 },
  { re: /\bworthless\b/i, weight: 0.4 },
  { re: /\bdumb\b/i, weight: 0.4 },
  { re: /\bnever mind\b/i, weight: 0.15 },
  { re: /\bforget it\b/i, weight: 0.15 },
  { re: /\bdon't bother\b/i, weight: 0.15 },
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
 * @param categoryBoosts Optional per-category threshold boosts from adaptive learning.
 *   Keys are category names (e.g. "passive-aggressive", "sarcasm", "hedging").
 *   Values are added to the threshold for that category, making it harder to trigger.
 */
export function scoreMessage(
  text: string,
  customPatterns: string[] = [],
  categoryBoosts: Record<string, number> = {},
): number {
  if (!text || text.trim().length === 0) return 0;

  let patternScore = 0;
  let keywordScore = 0;
  let capsScore = 0;
  let punctuationScore = 0;
  let customScore = 0;
  let sarcasmScore = 0;
  let hedgingScore = 0;
  let exclamationInflationScore = 0;
  let profanityScore = 0;
  let directedInsultScore = 0;
  let emojiScore = 0;
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
  for (const { re: keywordRe, weight } of NEGATIVE_KEYWORDS) {
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

  // Profanity — single match is enough to flag
  for (const re of PROFANITY_PATTERNS) {
    if (re.test(text)) {
      profanityScore = PROFANITY_WEIGHT;
      break;
    }
  }

  // Directed insults — "you are [negative]"
  if (DIRECTED_INSULT_RE.test(text)) {
    directedInsultScore = DIRECTED_INSULT_WEIGHT;
  }

  // Emoji-as-tone — negative emojis and sarcastic emoji combos
  if (NEGATIVE_EMOJI_RE.test(text)) {
    emojiScore = NEGATIVE_EMOJI_WEIGHT;
  }
  if (SARCASTIC_EMOJI_RE.test(text)) {
    emojiScore = Math.max(emojiScore, SARCASTIC_EMOJI_WEIGHT);
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

  // Apply category boosts (adaptive learning): subtract boost from each category score
  // This effectively raises the threshold for categories the user frequently dismisses
  patternScore = Math.max(0, patternScore - (categoryBoosts['passive-aggressive'] ?? 0));
  keywordScore = Math.max(0, keywordScore - (categoryBoosts['keywords'] ?? 0));
  capsScore = Math.max(0, capsScore - (categoryBoosts['caps'] ?? 0));
  punctuationScore = Math.max(0, punctuationScore - (categoryBoosts['punctuation'] ?? 0));
  sarcasmScore = Math.max(0, sarcasmScore - (categoryBoosts['sarcasm'] ?? 0));
  hedgingScore = Math.max(0, hedgingScore - (categoryBoosts['hedging'] ?? 0));
  exclamationInflationScore = Math.max(
    0,
    exclamationInflationScore - (categoryBoosts['exclamation-inflation'] ?? 0),
  );
  customScore = Math.max(0, customScore - (categoryBoosts['custom'] ?? 0));
  profanityScore = Math.max(0, profanityScore - (categoryBoosts['profanity'] ?? 0));
  directedInsultScore = Math.max(0, directedInsultScore - (categoryBoosts['directed-insult'] ?? 0));
  emojiScore = Math.max(0, emojiScore - (categoryBoosts['emoji'] ?? 0));

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
        exclamationInflationScore +
        profanityScore +
        directedInsultScore +
        emojiScore,
    ),
  );
}
