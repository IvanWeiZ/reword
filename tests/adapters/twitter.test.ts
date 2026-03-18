import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('writeBack returns true when input exists and text is inserted', () => {
    const result = adapter.writeBack('Friendly rewrite here');
    expect(result).toBe(true);
  });

  it('writeBack replaces existing content in the input field', () => {
    adapter.writeBack('New DM text');
    const input = adapter.findInputField();
    expect(input?.textContent).toBe('New DM text');
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

  it('scrapeThreadContext returns empty array when no messages exist', () => {
    document.body.innerHTML = '<div>No messages here</div>';
    const context = adapter.scrapeThreadContext();
    expect(context).toEqual([]);
  });

  it('scrapeThreadContext skips entries without tweetText content', () => {
    document.body.innerHTML = `
      <div data-testid="messageEntry">
        <div data-testid="tweetText"></div>
      </div>
      <div data-testid="messageEntry">
        <div data-testid="tweetText">Real message</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(1);
    expect(context[0].text).toBe('Real message');
  });

  it('scrapeThreadContext truncates long messages to 500 chars', () => {
    const longText = 'X'.repeat(600);
    document.body.innerHTML = `
      <div data-testid="messageEntry">
        <div data-testid="tweetText">${longText}</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].text.length).toBeLessThanOrEqual(500);
  });

  it('scrapeThreadContext defaults all senders to other', () => {
    document.body.innerHTML = `
      <div data-testid="messageEntry">
        <div data-testid="tweetText">First</div>
      </div>
      <div data-testid="messageEntry">
        <div data-testid="tweetText">Second</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.every((m) => m.sender === 'other')).toBe(true);
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
