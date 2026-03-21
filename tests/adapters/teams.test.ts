import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TeamsAdapter } from '../../src/adapters/teams';

describe('TeamsAdapter', () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/teams-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new TeamsAdapter();
  });

  it('has platformName "teams"', () => {
    expect(adapter.platformName).toBe('teams');
  });

  describe('findInputField', () => {
    it('finds the ckeditor contenteditable input', () => {
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('contenteditable')).toBe('true');
      expect(field?.getAttribute('data-tid')).toBe('ckeditor');
    });

    it('falls back to role textbox inside compose box', () => {
      document.body.innerHTML = `
        <div data-tid="message-pane-compose-box">
          <div role="textbox" contenteditable="true">fallback</div>
        </div>`;
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('role')).toBe('textbox');
    });

    it('returns null when input is missing', () => {
      document.body.innerHTML = '<div>No input</div>';
      expect(adapter.findInputField()).toBeNull();
    });
  });

  describe('placeTriggerIcon', () => {
    it('appends icon to compose toolbar and returns cleanup', () => {
      const icon = document.createElement('div');
      icon.id = 'reword-trigger';
      const cleanup = adapter.placeTriggerIcon(icon);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-trigger')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-trigger')).toBeNull();
    });

    it('returns null when toolbar is missing', () => {
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
    it('returns prefixed name from chat header title', () => {
      expect(adapter.getRecipientIdentifier()).toBe('teams:Alice Smith');
    });

    it('returns null when header title is missing', () => {
      document.body.innerHTML = '<div>No header</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('scrapeThreadContext', () => {
    it('extracts messages with correct sender', () => {
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(2);
      expect(context[0].sender).toBe('other');
      expect(context[0].text).toContain('review the PR');
      expect(context[1].sender).toBe('self');
    });

    it('returns empty array when no messages exist', () => {
      document.body.innerHTML = '<div>No messages</div>';
      expect(adapter.scrapeThreadContext()).toEqual([]);
    });

    it('limits to 10 messages', () => {
      let html = '';
      for (let i = 0; i < 15; i++) {
        html += `<div data-tid="chat-pane-message"><span data-tid="message-author-name">Person</span><div data-tid="message-body">Msg ${i}</div></div>`;
      }
      document.body.innerHTML = html;
      expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
    });

    it('truncates messages to 500 chars', () => {
      document.body.innerHTML = `<div data-tid="chat-pane-message"><span data-tid="message-author-name">Person</span><div data-tid="message-body">${'A'.repeat(600)}</div></div>`;
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

  describe('placeIncomingIndicator', () => {
    it('attaches and removes indicator', () => {
      const elements = adapter.getIncomingMessageElements();
      expect(elements.length).toBeGreaterThan(0);
      const indicator = document.createElement('span');
      indicator.id = 'reword-indicator';
      const cleanup = adapter.placeIncomingIndicator(elements[0], indicator);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-indicator')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-indicator')).toBeNull();
    });
  });

  describe('checkHealth', () => {
    it('returns true when input and send button exist', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<button data-tid="newMessageCommands-send">Send</button>';
      expect(adapter.checkHealth()).toBe(false);
    });

    it('returns false when send button is missing', () => {
      document.body.innerHTML =
        '<div data-tid="ckeditor" contenteditable="true" role="textbox"></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
