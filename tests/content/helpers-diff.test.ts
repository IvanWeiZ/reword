import { describe, it, expect } from 'vitest';
import { wordDiff, renderDiffHTML, DiffSegment } from '../../src/content/helpers';

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
    const rewritten = "That works for me! I was looking forward to our original plan though.";
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
