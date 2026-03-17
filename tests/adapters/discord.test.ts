import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DiscordAdapter } from '../../src/adapters/discord';

describe('DiscordAdapter', () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/discord-message.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new DiscordAdapter();
  });

  it('has platformName "discord"', () => {
    expect(adapter.platformName).toBe('discord');
  });

  it('finds the Discord text input', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('returns null when input is missing', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon in buttons area', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when buttons area is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.placeTriggerIcon(document.createElement('div'))).toBeNull();
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('scrapeThreadContext extracts messages', () => {
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(2);
    expect(context[0].text).toBe('Hello there');
    expect(context[1].text).toBe('Hey!');
  });

  it('getIncomingMessageElements returns non-self messages', () => {
    const elements = adapter.getIncomingMessageElements();
    // First message has no .mentioned, second has .mentioned (self)
    expect(elements.length).toBe(1);
  });

  it('checkHealth returns true when input exists', () => {
    expect(adapter.checkHealth()).toBe(true);
  });

  it('checkHealth returns false when input is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.checkHealth()).toBe(false);
  });
});
