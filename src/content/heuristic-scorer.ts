const PASSIVE_AGGRESSIVE_PATTERNS = [
  /\bfine\.\s*$/i,
  /\bwhatever\b/i,
  /\bper my last email\b/i,
  /\bas I already mentioned\b/i,
  /\bas previously stated\b/i,
  /\bnot like I\b.*\bor anything\b/i,
  /\bI guess\b.*\b(works|fine|so|whatever)\b/i,
  /\bthanks for nothing\b/i,
  /\bno worries\b.*\bI'll just\b/i,
  /\bmust be nice\b/i,
  /\bgood for you\b/i,
];

const NEGATIVE_KEYWORDS = [
  'stupid',
  'idiot',
  'hate',
  'annoying',
  'useless',
  'pathetic',
  'ridiculous',
  'disgusting',
  'terrible',
  'awful',
  'never mind',
  'forget it',
  "don't bother",
];

/**
 * Scores a message from 0 (clean) to 1 (very problematic).
 * Runs synchronously in < 5ms.
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
  const lower = text.toLowerCase();

  // Check passive-aggressive patterns (high signal) — cap at one match worth
  let patternMatches = 0;
  for (const pattern of PASSIVE_AGGRESSIVE_PATTERNS) {
    if (pattern.test(text)) {
      patternMatches++;
    }
  }
  if (patternMatches > 0) {
    patternScore = Math.min(0.5, 0.35 * patternMatches);
  }

  // Check negative keywords — cap contribution
  let keywordMatches = 0;
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      keywordMatches++;
    }
  }
  if (keywordMatches > 0) {
    keywordScore = Math.min(0.4, 0.2 * keywordMatches);
  }

  // ALL CAPS detection (check if >50% of alpha chars are uppercase)
  const alphaChars = text.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 10) {
    const upperRatio = text.replace(/[^A-Z]/g, '').length / alphaChars.length;
    if (upperRatio > 0.5) {
      capsScore = 0.3;
    }
  }

  // Excessive punctuation (!! or ?? or ?!) — cap contribution
  const excessivePunctuation = text.match(/[!?]{2,}/g);
  if (excessivePunctuation) {
    punctuationScore = Math.min(0.4, 0.3 * excessivePunctuation.length);
  }

  // User-defined custom patterns (#9)
  if (customPatterns.length > 0) {
    let customMatches = 0;
    for (const patStr of customPatterns) {
      try {
        const re = new RegExp(patStr, 'i');
        if (re.test(text)) customMatches++;
      } catch {
        // Skip invalid patterns
      }
    }
    if (customMatches > 0) {
      customScore = Math.min(0.4, 0.3 * customMatches);
    }
  }

  return Math.min(
    1,
    Math.max(0, patternScore + keywordScore + capsScore + punctuationScore + customScore),
  );
}
