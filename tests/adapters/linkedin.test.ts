import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LinkedInAdapter } from '../../src/adapters/linkedin';

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    const html = readFileSync(resolve(__dirname, '../mocks/mock-dom-fixtures/linkedin-message.html'), 'utf-8');
    document.body.innerHTML = html;
    adapter = new LinkedInAdapter();
  });

  it('finds the LinkedIn message input field', () => {
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
  });
});
