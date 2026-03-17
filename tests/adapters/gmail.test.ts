import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GmailAdapter } from '../../src/adapters/gmail';

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/gmail-compose.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new GmailAdapter();
  });

  it('finds the Gmail compose input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('returns null when compose field is missing', () => {
    document.body.innerHTML = '<div>No compose area</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when send button row is missing', () => {
    document.body.innerHTML = '<div role="textbox" g_editable="true"></div>';
    const icon = document.createElement('div');
    expect(adapter.placeTriggerIcon(icon)).toBeNull();
  });

  it('writeBack returns a boolean', () => {
    const result = adapter.writeBack('Hello, this is a nicer message');
    expect(typeof result).toBe('boolean');
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div>empty</div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('scrapeThreadContext returns an array', () => {
    const context = adapter.scrapeThreadContext();
    expect(Array.isArray(context)).toBe(true);
  });

  it('scrapeThreadContext extracts messages from thread', () => {
    document.body.innerHTML += `
      <div class="adn">
        <span class="gD" name="other-person"></span>
        <div class="a3s aiL">This is a reply from someone else</div>
      </div>
      <div class="adn">
        <span class="gD" name="Me"></span>
        <div class="a3s aiL">My own reply</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(2);
    expect(context[0].sender).toBe('other');
    expect(context[0].text).toContain('reply from someone else');
    expect(context[1].sender).toBe('self');
  });

  it('scrapeThreadContext limits to 10 messages', () => {
    let threadHtml = '';
    for (let i = 0; i < 15; i++) {
      threadHtml += `<div class="adn"><span class="gD" name="Person"></span><div class="a3s aiL">Message ${i}</div></div>`;
    }
    document.body.innerHTML += threadHtml;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBeLessThanOrEqual(10);
  });

  it('scrapeThreadContext truncates long messages to 500 chars', () => {
    const longText = 'A'.repeat(600);
    document.body.innerHTML += `
      <div class="adn">
        <span class="gD" name="Other"></span>
        <div class="a3s aiL">${longText}</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].text.length).toBeLessThanOrEqual(500);
  });

  describe('checkHealth', () => {
    it('returns true when both input and send button exist', () => {
      expect(adapter.checkHealth()).toBe(true);
    });

    it('returns false when input is missing', () => {
      document.body.innerHTML = '<div class="btC"><div class="dC"></div></div>';
      expect(adapter.checkHealth()).toBe(false);
    });

    it('returns false when send button row is missing', () => {
      document.body.innerHTML =
        '<div role="textbox" contenteditable="true" g_editable="true"></div>';
      expect(adapter.checkHealth()).toBe(false);
    });
  });
});
