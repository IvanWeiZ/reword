import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SlackAdapter } from '../../src/adapters/slack';

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/slack-message.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new SlackAdapter();
  });

  it('has platformName "slack"', () => {
    expect(adapter.platformName).toBe('slack');
  });

  it('finds the Slack message input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('contenteditable')).toBe('true');
  });

  it('returns null when input is missing', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon in composer button bar', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when button bar is missing', () => {
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
    expect(context[0].sender).toBe('other');
    expect(context[0].text).toContain('can you look at this');
    expect(context[1].sender).toBe('self');
  });

  it('getIncomingMessageElements returns non-self messages', () => {
    const elements = adapter.getIncomingMessageElements();
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
