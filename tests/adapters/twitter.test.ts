import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TwitterAdapter } from '../../src/adapters/twitter';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/twitter-dm.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new TwitterAdapter();
  });

  it('finds the Twitter DM input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('data-testid')).toBe('dmComposerTextInput');
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

  it('placeTriggerIcon returns null when send button is missing', () => {
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

  it('scrapeThreadContext extracts messages from DM thread', () => {
    document.body.innerHTML += `
      <div data-testid="messageEntry">
        <div data-testid="tweetText">Hello there!</div>
      </div>
      <div data-testid="messageEntry">
        <div data-testid="tweetText">How are you?</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(2);
    // Twitter adapter defaults to 'other' sender
    expect(context[0].sender).toBe('other');
    expect(context[0].text).toBe('Hello there!');
  });

  it('scrapeThreadContext limits to 10 messages', () => {
    let html = '';
    for (let i = 0; i < 15; i++) {
      html += `<div data-testid="messageEntry"><div data-testid="tweetText">Msg ${i}</div></div>`;
    }
    document.body.innerHTML += html;
    expect(adapter.scrapeThreadContext().length).toBeLessThanOrEqual(10);
  });

  describe('checkHealth', () => {
    it('returns true when input and send button both exist', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<div data-testid="dmComposerSendButton"></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
