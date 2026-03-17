import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TwitterAdapter } from '../../src/adapters/twitter';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/twitter-dm.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new TwitterAdapter();
  });

  it('finds the Twitter DM input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('data-testid')).toBe('dmComposerTextInput');
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
  });
});
