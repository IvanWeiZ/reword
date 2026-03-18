import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { WhatsAppAdapter } from '../../src/adapters/whatsapp';

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/whatsapp-message.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new WhatsAppAdapter();
  });

  it('has platformName "whatsapp"', () => {
    expect(adapter.platformName).toBe('whatsapp');
  });

  it('finds the WhatsApp message input', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('contenteditable')).toBe('true');
    expect(field?.getAttribute('data-tab')).toBe('10');
  });

  it('returns null when input is missing', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon near the send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when send button is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.placeTriggerIcon(document.createElement('div'))).toBeNull();
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('scrapeThreadContext extracts messages with correct sender', () => {
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(3);
    expect(context[0].sender).toBe('other');
    expect(context[0].text).toBe('Hey, can we talk about the project?');
    expect(context[1].sender).toBe('self');
    expect(context[1].text).toBe("Sure, what's up?");
    expect(context[2].sender).toBe('other');
    expect(context[2].text).toBe('I think we need to change the deadline.');
  });

  it('getIncomingMessageElements returns non-self messages', () => {
    const elements = adapter.getIncomingMessageElements();
    // Two incoming messages (message-in), one outgoing (message-out)
    expect(elements.length).toBe(2);
  });

  it('checkHealth returns true when input exists', () => {
    expect(adapter.checkHealth()).toBe(true);
  });

  it('checkHealth returns false when input is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.checkHealth()).toBe(false);
  });
});
