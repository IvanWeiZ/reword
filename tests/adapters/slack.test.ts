import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SlackAdapter } from '../../src/adapters/slack';

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/slack-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new SlackAdapter();
  });

  it('has platformName "slack"', () => {
    expect(adapter.platformName).toBe('slack');
  });

  describe('findInputField', () => {
    it('finds the contenteditable inside message_input', () => {
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('contenteditable')).toBe('true');
    });

    it('falls back to .ql-editor when message_input is absent', () => {
      document.body.innerHTML = '<div class="ql-editor" contenteditable="true">fallback</div>';
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.classList.contains('ql-editor')).toBe(true);
    });

    it('returns null when input is missing', () => {
      document.body.innerHTML = '<div>No input</div>';
      expect(adapter.findInputField()).toBeNull();
    });
  });

  describe('placeTriggerIcon', () => {
    it('appends icon to composer button bar and returns cleanup', () => {
      const icon = document.createElement('div');
      icon.id = 'reword-trigger';
      const cleanup = adapter.placeTriggerIcon(icon);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-trigger')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-trigger')).toBeNull();
    });

    it('returns null when button bar is missing', () => {
      document.body.innerHTML = '<div></div>';
      expect(adapter.placeTriggerIcon(document.createElement('div'))).toBeNull();
    });
  });

  describe('writeBack', () => {
    it('returns true when input exists', () => {
      expect(adapter.writeBack('Hello')).toBe(true);
    });

    it('returns false when no input exists', () => {
      document.body.innerHTML = '<div></div>';
      expect(adapter.writeBack('test')).toBe(false);
    });

    it('replaces content and dispatches input event', () => {
      const input = adapter.findInputField();
      expect(input).not.toBeNull();
      const handler = vi.fn();
      input!.addEventListener('input', handler);
      adapter.writeBack('Rewritten message');
      expect(input!.textContent).toBe('Rewritten message');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getRecipientIdentifier', () => {
    it('returns prefixed name from conversation header', () => {
      expect(adapter.getRecipientIdentifier()).toBe('slack:alice.johnson');
    });

    it('returns null when header name element is missing', () => {
      document.body.innerHTML = '<div>No header</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('scrapeThreadContext', () => {
    it('extracts messages with correct sender', () => {
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(2);
      expect(context[0].sender).toBe('other');
      expect(context[0].text).toContain('can you look at this');
      expect(context[1].sender).toBe('self');
    });

    it('returns empty array when no messages exist', () => {
      document.body.innerHTML = '<div>No messages</div>';
      expect(adapter.scrapeThreadContext()).toEqual([]);
    });

    it('limits to 10 messages', () => {
      let html = '';
      for (let i = 0; i < 15; i++) {
        html += `<div data-qa="virtual-list-item"><span data-qa="message_sender_name">Person</span><div data-qa="message-text">Message ${i}</div></div>`;
      }
      document.body.innerHTML = html;
      expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
    });

    it('truncates messages to 500 chars', () => {
      document.body.innerHTML = `<div data-qa="virtual-list-item"><span data-qa="message_sender_name">Person</span><div data-qa="message-text">${'A'.repeat(600)}</div></div>`;
      const context = adapter.scrapeThreadContext();
      expect(context[0].text.length).toBeLessThanOrEqual(500);
    });
  });

  describe('getIncomingMessageElements', () => {
    it('returns non-self messages', () => {
      const elements = adapter.getIncomingMessageElements();
      expect(elements.length).toBe(1);
    });
  });

  describe('checkHealth', () => {
    it('returns true when input exists', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<div></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
