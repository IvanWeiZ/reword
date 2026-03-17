import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GmailAdapter } from '../../src/adapters/gmail';

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    const html = readFileSync(resolve(__dirname, '../mocks/mock-dom-fixtures/gmail-compose.html'), 'utf-8');
    document.body.innerHTML = html;
    // jsdom does not implement execCommand; stub it so writeBack tests work
    document.execCommand = () => false;
    adapter = new GmailAdapter();
  });

  it('finds the Gmail compose input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('writeBack returns a boolean', () => {
    const result = adapter.writeBack('Hello, this is a nicer message');
    expect(typeof result).toBe('boolean');
  });
});
