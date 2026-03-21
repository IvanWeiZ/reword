import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OutlookAdapter } from '../../src/adapters/outlook';

describe('OutlookAdapter', () => {
  let adapter: OutlookAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/outlook-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new OutlookAdapter();
  });

  describe('findInputField', () => {
    it('finds the compose input with role textbox and Message body label', () => {
      const field = adapter.findInputField();
      expect(field).not.toBeNull();
      expect(field?.getAttribute('role')).toBe('textbox');
      expect(field?.getAttribute('aria-label')).toContain('Message body');
    });

    it('returns null when compose field is missing', () => {
      document.body.innerHTML = '<div>No compose area</div>';
      expect(adapter.findInputField()).toBeNull();
    });
  });

  describe('placeTriggerIcon', () => {
    it('appends icon to toolbar and returns cleanup', () => {
      const icon = document.createElement('div');
      icon.id = 'reword-trigger';
      const cleanup = adapter.placeTriggerIcon(icon);
      expect(cleanup).not.toBeNull();
      expect(document.getElementById('reword-trigger')).not.toBeNull();
      cleanup?.();
      expect(document.getElementById('reword-trigger')).toBeNull();
    });

    it('returns null when send button/toolbar is missing', () => {
      document.body.innerHTML =
        '<div role="textbox" aria-label="Message body" contenteditable="true"></div>';
      const icon = document.createElement('div');
      expect(adapter.placeTriggerIcon(icon)).toBeNull();
    });
  });

  describe('writeBack', () => {
    it('returns true when input exists', () => {
      expect(adapter.writeBack('Hello, this is a nicer message')).toBe(true);
    });

    it('returns false when no input exists', () => {
      document.body.innerHTML = '<div>empty</div>';
      expect(adapter.writeBack('test')).toBe(false);
    });

    it('replaces existing content in the compose field', () => {
      adapter.writeBack('Rewritten email body');
      const input = adapter.findInputField();
      expect(input?.textContent).toBe('Rewritten email body');
    });

    it('dispatches input event for framework compatibility', () => {
      const input = adapter.findInputField();
      expect(input).not.toBeNull();
      const handler = vi.fn();
      input!.addEventListener('input', handler);
      adapter.writeBack('New text');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getRecipientIdentifier', () => {
    it('returns prefixed name from well item', () => {
      expect(adapter.getRecipientIdentifier()).toBe('outlook:Jane Doe');
    });

    it('returns null when recipient element is missing', () => {
      document.body.innerHTML = '<div>No recipient</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('scrapeThreadContext', () => {
    it('returns an array', () => {
      const context = adapter.scrapeThreadContext();
      expect(Array.isArray(context)).toBe(true);
    });

    it('extracts messages from thread', () => {
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(2);
      expect(context[0].sender).toBe('other');
      expect(context[0].text).toContain("don't have time");
      expect(context[1].sender).toBe('self');
      expect(context[1].text).toContain('figure it out');
    });

    it('returns empty array when no thread messages exist', () => {
      document.body.innerHTML = '<div>No thread</div>';
      expect(adapter.scrapeThreadContext()).toEqual([]);
    });

    it('limits to 10 messages', () => {
      let threadHtml = '';
      for (let i = 0; i < 15; i++) {
        threadHtml += `<div role="listitem" data-convid="conv-${i}"><span class="lDdSm">Person</span><div role="document"><div class="XbIp4">Message ${i}</div></div></div>`;
      }
      document.body.innerHTML += threadHtml;
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBeLessThanOrEqual(10);
    });

    it('truncates long messages to 500 chars', () => {
      const longText = 'A'.repeat(600);
      document.body.innerHTML = `
        <div role="listitem" data-convid="conv-long">
          <span class="lDdSm">Other</span>
          <div role="document"><div class="XbIp4">${longText}</div></div>
        </div>
      `;
      const context = adapter.scrapeThreadContext();
      expect(context[0].text.length).toBeLessThanOrEqual(500);
    });

    it('skips messages with empty text content', () => {
      document.body.innerHTML = `
        <div role="listitem" data-convid="conv-empty">
          <span class="lDdSm">Person</span>
          <div role="document"><div class="XbIp4">   </div></div>
        </div>
        <div role="listitem" data-convid="conv-real">
          <span class="lDdSm">Person</span>
          <div role="document"><div class="XbIp4">Actual content here</div></div>
        </div>
      `;
      const context = adapter.scrapeThreadContext();
      expect(context.length).toBe(1);
      expect(context[0].text).toBe('Actual content here');
    });
  });

  describe('checkHealth', () => {
    it('returns true when both input and send button exist', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<button aria-label="Send">Send</button>';
      expect(adapter.checkHealth()).toBe(false);
    });

    it('returns false when send button is missing', () => {
      document.body.innerHTML =
        '<div role="textbox" contenteditable="true" aria-label="Message body"></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
