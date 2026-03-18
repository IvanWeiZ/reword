import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LinkedInAdapter } from '../../src/adapters/linkedin';

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/linkedin-message.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new LinkedInAdapter();
  });

  it('finds the LinkedIn message input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('returns null when input field is missing', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
  });

  it('placeTriggerIcon cleanup removes icon', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when actions row is missing', () => {
    document.body.innerHTML = '<div></div>';
    const icon = document.createElement('div');
    expect(adapter.placeTriggerIcon(icon)).toBeNull();
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div>empty</div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('scrapeThreadContext returns an array', () => {
    expect(Array.isArray(adapter.scrapeThreadContext())).toBe(true);
  });

  it('scrapeThreadContext extracts messages', () => {
    document.body.innerHTML += `
      <div class="msg-s-event-listitem msg-s-event-listitem--other">
        <div class="msg-s-event-listitem__body">Hey, how are you?</div>
      </div>
      <div class="msg-s-event-listitem">
        <div class="msg-s-event-listitem__body">I'm doing well!</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(2);
    expect(context[0].sender).toBe('other');
    expect(context[1].sender).toBe('self');
  });

  it('scrapeThreadContext limits to 10 messages', () => {
    let html = '';
    for (let i = 0; i < 15; i++) {
      html += `<div class="msg-s-event-listitem"><div class="msg-s-event-listitem__body">Msg ${i}</div></div>`;
    }
    document.body.innerHTML += html;
    expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
  });

  describe('checkHealth', () => {
    it('returns true when input and actions row both exist', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<div class="msg-form__right-actions"></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
