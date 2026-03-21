import { describe, it, expect } from 'vitest';
import {
  wordDiff,
  renderDiffHTML,
  normalizeSnippet,
  deriveRecipientStyle,
} from '../../src/content/helpers';
import type { PlatformAdapter, ThreadMessage } from '../../src/shared/types';

describe('wordDiff', () => {
  it('returns equal segments for identical text', () => {
    const result = wordDiff('hello world', 'hello world');
    expect(result).toEqual([
      { type: 'equal', text: 'hello' },
      { type: 'equal', text: 'world' },
    ]);
  });

  it('detects added words', () => {
    const result = wordDiff('hello world', 'hello beautiful world');
    expect(result).toEqual([
      { type: 'equal', text: 'hello' },
      { type: 'added', text: 'beautiful' },
      { type: 'equal', text: 'world' },
    ]);
  });

  it('detects removed words', () => {
    const result = wordDiff('hello beautiful world', 'hello world');
    expect(result).toEqual([
      { type: 'equal', text: 'hello' },
      { type: 'removed', text: 'beautiful' },
      { type: 'equal', text: 'world' },
    ]);
  });

  it('detects replaced words', () => {
    const result = wordDiff('I hate this', 'I love this');
    expect(result).toEqual([
      { type: 'equal', text: 'I' },
      { type: 'removed', text: 'hate' },
      { type: 'added', text: 'love' },
      { type: 'equal', text: 'this' },
    ]);
  });

  it('handles completely different texts', () => {
    const result = wordDiff('foo bar', 'baz qux');
    expect(result).toEqual([
      { type: 'removed', text: 'foo bar' },
      { type: 'added', text: 'baz qux' },
    ]);
  });

  it('handles empty original', () => {
    const result = wordDiff('', 'hello world');
    expect(result).toEqual([{ type: 'added', text: 'hello world' }]);
  });

  it('handles empty rewrite', () => {
    const result = wordDiff('hello world', '');
    expect(result).toEqual([{ type: 'removed', text: 'hello world' }]);
  });

  it('handles both empty', () => {
    const result = wordDiff('', '');
    expect(result).toEqual([]);
  });

  it('handles a realistic rewrite', () => {
    const original = 'Whatever, I guess that works.';
    const rewritten = 'That works for me! I was looking forward to our original plan though.';
    const result = wordDiff(original, rewritten);

    // Check that the diff contains both removed and added segments
    const types = new Set(result.map((s) => s.type));
    expect(types.has('removed')).toBe(true);
    expect(types.has('added')).toBe(true);

    // Reconstruct: removed + equal should cover original words, added + equal should cover rewrite words
    const removedAndEqual = result
      .filter((s) => s.type === 'removed' || s.type === 'equal')
      .map((s) => s.text)
      .join(' ');
    const addedAndEqual = result
      .filter((s) => s.type === 'added' || s.type === 'equal')
      .map((s) => s.text)
      .join(' ');
    expect(removedAndEqual).toBe(original);
    expect(addedAndEqual).toBe(rewritten);
  });

  it('preserves punctuation attached to words', () => {
    const result = wordDiff('Hello, world!', 'Hello, everyone!');
    // "Hello," is common, "world!" removed, "everyone!" added
    expect(result).toEqual([
      { type: 'equal', text: 'Hello,' },
      { type: 'removed', text: 'world!' },
      { type: 'added', text: 'everyone!' },
    ]);
  });
});

describe('renderDiffHTML', () => {
  it('renders equal text without spans', () => {
    const html = renderDiffHTML('hello', 'hello');
    expect(html).toBe('hello');
  });

  it('renders added words with reword-diff-added class', () => {
    const html = renderDiffHTML('hello', 'hello world');
    expect(html).toContain('reword-diff-added');
    expect(html).toContain('world');
  });

  it('renders removed words with reword-diff-removed class', () => {
    const html = renderDiffHTML('hello world', 'hello');
    expect(html).toContain('reword-diff-removed');
    expect(html).toContain('world');
  });

  it('escapes HTML in text', () => {
    const html = renderDiffHTML('use <script> tag', 'use <div> tag');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;div&gt;');
  });
});

describe('normalizeSnippet', () => {
  it('lowercases and trims normal text', () => {
    expect(normalizeSnippet('  Hello World  ')).toBe('hello world');
  });

  it('removes special characters', () => {
    expect(normalizeSnippet('Hello, World! How are you?')).toBe('hello world how are you');
  });

  it('truncates text longer than 60 characters', () => {
    const longText = 'a'.repeat(100);
    const result = normalizeSnippet(longText);
    expect(result.length).toBe(60);
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSnippet('')).toBe('');
  });

  it('returns empty string for text with only special characters', () => {
    expect(normalizeSnippet('!@#$%^&*()')).toBe('');
  });

  it('preserves digits', () => {
    expect(normalizeSnippet('Order 12345!')).toBe('order 12345');
  });

  it('collapses to spaces after removing special chars', () => {
    expect(normalizeSnippet('A--B..C')).toBe('abc');
  });
});

describe('deriveRecipientStyle', () => {
  function makeAdapter(messages: ThreadMessage[]): PlatformAdapter {
    return {
      platformName: 'test',
      findInputField: () => null,
      placeTriggerIcon: () => null,
      writeBack: () => false,
      checkHealth: () => true,
      scrapeThreadContext: () => messages,
    };
  }

  it('returns undefined when no other messages exist', () => {
    const adapter = makeAdapter([]);
    expect(deriveRecipientStyle(adapter)).toBeUndefined();
  });

  it('returns undefined when only self messages exist', () => {
    const adapter = makeAdapter([{ sender: 'self', text: 'Hello there!' }]);
    expect(deriveRecipientStyle(adapter)).toBeUndefined();
  });

  it('returns "brief" for short messages (avg < 30 chars)', () => {
    const adapter = makeAdapter([
      { sender: 'other', text: 'ok' },
      { sender: 'other', text: 'sure' },
    ]);
    expect(deriveRecipientStyle(adapter)).toBe('brief');
  });

  it('returns "detailed" for long messages (avg > 150 chars)', () => {
    const longMsg = 'a'.repeat(200);
    const adapter = makeAdapter([{ sender: 'other', text: longMsg }]);
    expect(deriveRecipientStyle(adapter)).toBe('detailed');
  });

  it('returns "uses emojis" when messages contain emojis', () => {
    const adapter = makeAdapter([
      {
        sender: 'other',
        text: 'This is a medium length message that is not brief at all and has enough chars \u{1F600}',
      },
    ]);
    expect(deriveRecipientStyle(adapter)).toBe('uses emojis');
  });

  it('returns "expressive" when messages contain exclamation marks', () => {
    const adapter = makeAdapter([
      {
        sender: 'other',
        text: 'This is a medium length message that is not brief at all and has enough chars!',
      },
    ]);
    expect(deriveRecipientStyle(adapter)).toBe('expressive');
  });

  it('returns undefined for medium-length messages without emojis or exclamation', () => {
    const adapter = makeAdapter([
      {
        sender: 'other',
        text: 'This is a medium length message that is not brief at all and has enough chars.',
      },
    ]);
    expect(deriveRecipientStyle(adapter)).toBeUndefined();
  });

  it('combines brief + uses emojis', () => {
    const adapter = makeAdapter([{ sender: 'other', text: 'ok \u{1F600}' }]);
    expect(deriveRecipientStyle(adapter)).toBe('brief, uses emojis');
  });

  it('combines brief + expressive', () => {
    const adapter = makeAdapter([{ sender: 'other', text: 'yes!' }]);
    expect(deriveRecipientStyle(adapter)).toBe('brief, expressive');
  });

  it('combines detailed + uses emojis + expressive', () => {
    const longMsg = 'a'.repeat(160) + '! \u{1F600}';
    const adapter = makeAdapter([{ sender: 'other', text: longMsg }]);
    expect(deriveRecipientStyle(adapter)).toBe('detailed, uses emojis, expressive');
  });

  it('ignores self messages when computing style', () => {
    const adapter = makeAdapter([
      { sender: 'self', text: 'My long detailed message with lots of words' },
      { sender: 'other', text: 'ok' },
    ]);
    expect(deriveRecipientStyle(adapter)).toBe('brief');
  });
});
