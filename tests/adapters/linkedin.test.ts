import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('placeTriggerIcon falls back to placing near input when no actions row exists', () => {
    document.body.innerHTML = `
      <div>
        <div role="textbox" contenteditable="true" class="msg-form__msg-content-container--scrollable">
          <p>Some text</p>
        </div>
      </div>
    `;
    const icon = document.createElement('div');
    icon.id = 'reword-trigger-fallback';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger-fallback')).not.toBeNull();
    expect(icon.style.position).toBe('absolute');
    expect(icon.style.right).toBe('8px');
    expect(icon.style.top).toBe('8px');
    // Verify cleanup removes it
    cleanup?.();
    expect(document.getElementById('reword-trigger-fallback')).toBeNull();
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div>empty</div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('writeBack returns true when input exists and text is inserted', () => {
    const result = adapter.writeBack('Hello, nice to meet you!');
    expect(result).toBe(true);
  });

  it('writeBack replaces existing content in the input field', () => {
    adapter.writeBack('Rewritten message');
    const input = adapter.findInputField();
    expect(input?.textContent).toBe('Rewritten message');
  });

  it('writeBack dispatches input event for framework compatibility', () => {
    const input = adapter.findInputField();
    expect(input).not.toBeNull();
    const handler = vi.fn();
    input!.addEventListener('input', handler);
    adapter.writeBack('New text');
    expect(handler).toHaveBeenCalled();
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

  it('scrapeThreadContext returns empty array when no messages exist', () => {
    document.body.innerHTML = '<div>No messages</div>';
    const context = adapter.scrapeThreadContext();
    expect(context).toEqual([]);
  });

  it('scrapeThreadContext skips messages with empty body text', () => {
    document.body.innerHTML = `
      <div class="msg-s-event-listitem">
        <div class="msg-s-event-listitem__body">   </div>
      </div>
      <div class="msg-s-event-listitem">
        <div class="msg-s-event-listitem__body">Actual content</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(1);
    expect(context[0].text).toBe('Actual content');
  });

  it('scrapeThreadContext truncates long messages to 500 chars', () => {
    const longText = 'B'.repeat(600);
    document.body.innerHTML = `
      <div class="msg-s-event-listitem">
        <div class="msg-s-event-listitem__body">${longText}</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].text.length).toBeLessThanOrEqual(500);
  });

  it('scrapeThreadContext identifies self vs other messages correctly', () => {
    document.body.innerHTML = `
      <div class="msg-s-event-listitem msg-s-event-listitem--other">
        <div class="msg-s-event-listitem__body">From other person</div>
      </div>
      <div class="msg-s-event-listitem">
        <div class="msg-s-event-listitem__body">From me</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0]).toEqual({ sender: 'other', text: 'From other person' });
    expect(context[1]).toEqual({ sender: 'self', text: 'From me' });
  });

  describe('getRecipientIdentifier', () => {
    it('returns prefixed name when .msg-entity-lockup__entity-title is present', () => {
      document.body.innerHTML += `<div class="msg-entity-lockup__entity-title">Bob Smith</div>`;
      expect(adapter.getRecipientIdentifier()).toBe('linkedin:Bob Smith');
    });

    it('returns null when .msg-entity-lockup__entity-title is missing', () => {
      document.body.innerHTML = '<div>No recipient</div>';
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });

    it('returns null when entity title element has empty text', () => {
      document.body.innerHTML += `<div class="msg-entity-lockup__entity-title">   </div>`;
      expect(adapter.getRecipientIdentifier()).toBeNull();
    });
  });

  describe('getIncomingMessageElements', () => {
    it('returns only messages from others', () => {
      document.body.innerHTML = `
        <div class="msg-s-event-listitem msg-s-event-listitem--other">Other 1</div>
        <div class="msg-s-event-listitem">Self 1</div>
        <div class="msg-s-event-listitem msg-s-event-listitem--other">Other 2</div>
      `;
      const els = adapter.getIncomingMessageElements();
      expect(els.length).toBe(2);
    });

    it('limits to last 5 incoming messages', () => {
      let html = '';
      for (let i = 0; i < 10; i++) {
        html += `<div class="msg-s-event-listitem msg-s-event-listitem--other">Other ${i}</div>`;
      }
      document.body.innerHTML = html;
      const els = adapter.getIncomingMessageElements();
      expect(els.length).toBe(5);
    });

    it('returns empty array when no incoming messages exist', () => {
      document.body.innerHTML = '<div>No messages</div>';
      expect(adapter.getIncomingMessageElements()).toEqual([]);
    });
  });

  describe('findSendButton', () => {
    it('finds .msg-form__send-button', () => {
      const btn = adapter.findSendButton();
      expect(btn).not.toBeNull();
      expect(btn?.classList.contains('msg-form__send-button')).toBe(true);
    });

    it('returns null when no send button exists', () => {
      document.body.innerHTML = '<div>No button</div>';
      expect(adapter.findSendButton()).toBeNull();
    });
  });

  describe('placeIncomingIndicator', () => {
    it('places indicator inside message body and returns cleanup', () => {
      const messageEl = document.createElement('div');
      messageEl.classList.add('msg-s-event-listitem');
      const body = document.createElement('div');
      body.classList.add('msg-s-event-listitem__body');
      body.textContent = 'Some message';
      messageEl.appendChild(body);

      const indicator = document.createElement('span');
      indicator.id = 'test-indicator';
      const cleanup = adapter.placeIncomingIndicator(messageEl, indicator);

      expect(cleanup).not.toBeNull();
      expect(body.querySelector('#test-indicator')).not.toBeNull();
      expect(indicator.style.display).toBe('inline-flex');

      cleanup?.();
      expect(body.querySelector('#test-indicator')).toBeNull();
    });

    it('returns null when message body element is missing', () => {
      const messageEl = document.createElement('div');
      const indicator = document.createElement('span');
      expect(adapter.placeIncomingIndicator(messageEl, indicator)).toBeNull();
    });
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
