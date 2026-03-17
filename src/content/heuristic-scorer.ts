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
 */
export function scoreMessage(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  let score = 0;
  const lower = text.toLowerCase();

  // Check passive-aggressive patterns (high signal)
  for (const pattern of PASSIVE_AGGRESSIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.35;
    }
  }

  // Check negative keywords
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 0.2;
    }
  }

  // ALL CAPS detection (check if >50% of alpha chars are uppercase)
  const alphaChars = text.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 10) {
    const upperRatio = text.replace(/[^A-Z]/g, '').length / alphaChars.length;
    if (upperRatio > 0.5) {
      score += 0.3;
    }
  }

  // Excessive punctuation (!! or ?? or ?!)
  const excessivePunctuation = text.match(/[!?]{2,}/g);
  if (excessivePunctuation) {
    score += 0.3 * excessivePunctuation.length;
  }

  return Math.min(1, Math.max(0, score));
}
