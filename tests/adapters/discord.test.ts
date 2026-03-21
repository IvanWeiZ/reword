import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DiscordAdapter } from '../../src/adapters/discord';

describe('DiscordAdapter', () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/discord-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new DiscordAdapter();
  });

  it('has platformName "discord"', () => {
    expect(adapter.platformName).toBe('discord');
  });

  describe('findInputField', () => {
    it('finds the slateTextArea with role textbox', () => {
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('role')).toBe('textbox');
      expect(field?.className).toContain('slateTextArea');
    });

    it('returns null when input is missing', () => {
      document.body.innerHTML = '<div>No input</div>';
      expect(adapter.findInputField()).toBeNull();
    });
  });

  describe('placeTriggerIcon', () => {
    it('inserts icon in buttons area and returns cleanup', () => {
      const icon = document.createElement('div');
      icon.id = 'reword-trigger';
      const cleanup = adapter.placeTriggerIcon(icon);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-trigger')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-trigger')).toBeNull();
    });

    it('returns null when buttons area is missing', () => {
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
    it('returns prefixed channel name from h3', () => {
      expect(adapter.getRecipientIdentifier()).toBe('discord:#general');
    });

    it('returns null when channel name element is missing', () => {
      document.body.innerHTML = '<div>No header</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('scrapeThreadContext', () => {
    it('extracts messages from thread', () => {
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(2);
      expect(context[0].text).toBe('Hello there');
      expect(context[1].text).toBe('Hey!');
    });

    it('identifies self messages via .mentioned class', () => {
      const context = adapter.scrapeThreadContext();
      expect(context[0].sender).toBe('other');
      expect(context[1].sender).toBe('self');
    });

    it('returns empty array when no messages exist', () => {
      document.body.innerHTML = '<div>No messages</div>';
      expect(adapter.scrapeThreadContext()).toEqual([]);
    });

    it('limits to 10 messages', () => {
      let html = '';
      for (let i = 0; i < 15; i++) {
        html += `<div id="chat-messages-${i}" class="message_group"><div id="message-content-${i}">Msg ${i}</div></div>`;
      }
      document.body.innerHTML = html;
      expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
    });

    it('truncates messages to 500 chars', () => {
      document.body.innerHTML = `<div id="chat-messages-1"><div id="message-content-1">${'A'.repeat(600)}</div></div>`;
      const context = adapter.scrapeThreadContext();
      expect(context[0].text.length).toBeLessThanOrEqual(500);
    });
  });

  describe('getIncomingMessageElements', () => {
    it('returns non-self messages only', () => {
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
