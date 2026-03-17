import type { PlatformAdapter } from '../shared/types';

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
