import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { WhatsAppAdapter } from '../../src/adapters/whatsapp';

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/whatsapp-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new WhatsAppAdapter();
  });

  it('has platformName "whatsapp"', () => {
    expect(adapter.platformName).toBe('whatsapp');
  });

  describe('findInputField', () => {
    it('finds contenteditable with data-tab="10"', () => {
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('contenteditable')).toBe('true');
      expect(field?.getAttribute('data-tab')).toBe('10');
    });

    it('falls back to any contenteditable in copyable-area', () => {
      document.body.innerHTML =
        '<div class="copyable-area"><div contenteditable="true">fallback</div></div>';
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
    });

    it('returns null when input is missing', () => {
      document.body.innerHTML = '<div>No input</div>';
      expect(adapter.findInputField()).toBeNull();
    });
  });

  describe('placeTriggerIcon', () => {
    it('places icon near send button and returns cleanup', () => {
      const icon = document.createElement('div');
      icon.id = 'reword-trigger';
      const cleanup = adapter.placeTriggerIcon(icon);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-trigger')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-trigger')).toBeNull();
    });

    it('returns null when send button is missing', () => {
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
    it('returns prefixed name from header span[title]', () => {
      expect(adapter.getRecipientIdentifier()).toBe('whatsapp:John Doe');
    });

    it('returns null when header title element is missing', () => {
      document.body.innerHTML = '<div>No header</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('scrapeThreadContext', () => {
    it('extracts messages with correct sender', () => {
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(3);
      expect(context[0].sender).toBe('other');
      expect(context[0].text).toBe('Hey, can we talk about the project?');
      expect(context[1].sender).toBe('self');
      expect(context[1].text).toBe("Sure, what's up?");
      expect(context[2].sender).toBe('other');
      expect(context[2].text).toBe('I think we need to change the deadline.');
    });

    it('returns empty array when no messages exist', () => {
      document.body.innerHTML = '<div>No messages</div>';
      expect(adapter.scrapeThreadContext()).toEqual([]);
    });

    it('limits to 10 messages', () => {
      let html = '';
      for (let i = 0; i < 15; i++) {
        html += `<div data-testid="msg-container" class="message-in"><div class="copyable-text"><span class="selectable-text"><span>Msg ${i}</span></span></div></div>`;
      }
      document.body.innerHTML = html;
      expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
    });

    it('truncates messages to 500 chars', () => {
      document.body.innerHTML = `<div data-testid="msg-container" class="message-in"><div class="copyable-text"><span class="selectable-text"><span>${'A'.repeat(600)}</span></span></div></div>`;
      const context = adapter.scrapeThreadContext();
      expect(context[0].text.length).toBeLessThanOrEqual(500);
    });
  });

  describe('getIncomingMessageElements', () => {
    it('returns non-self messages', () => {
      const elements = adapter.getIncomingMessageElements();
      expect(elements.length).toBe(2);
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
