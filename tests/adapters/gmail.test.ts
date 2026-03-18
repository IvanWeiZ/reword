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

  it('writeBack returns true when input exists', () => {
    const result = adapter.writeBack('Hello, this is a nicer message');
    expect(result).toBe(true);
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div>empty</div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('writeBack replaces existing content in the compose field', () => {
    adapter.writeBack('Rewritten email body');
    const input = adapter.findInputField();
    expect(input?.textContent).toBe('Rewritten email body');
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

  it('scrapeThreadContext returns empty array when no thread messages exist', () => {
    document.body.innerHTML = '<div>No thread</div>';
    const context = adapter.scrapeThreadContext();
    expect(context).toEqual([]);
  });

  it('scrapeThreadContext identifies "me" (lowercase) as self', () => {
    document.body.innerHTML = `
      <div class="adn">
        <span class="gD" name="me"></span>
        <div class="a3s aiL">My lowercase reply</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].sender).toBe('self');
  });

  it('scrapeThreadContext treats missing sender name as other', () => {
    document.body.innerHTML = `
      <div class="adn">
        <div class="a3s aiL">Message with no sender element</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].sender).toBe('other');
  });

  it('scrapeThreadContext skips messages with empty text content', () => {
    document.body.innerHTML = `
      <div class="adn">
        <span class="gD" name="Person"></span>
        <div class="a3s aiL">   </div>
      </div>
      <div class="adn">
        <span class="gD" name="Person"></span>
        <div class="a3s aiL">Actual content here</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(1);
    expect(context[0].text).toBe('Actual content here');
  });

  it('scrapeThreadContext preserves message order', () => {
    document.body.innerHTML = `
      <div class="adn">
        <span class="gD" name="Alice"></span>
        <div class="a3s aiL">First message</div>
      </div>
      <div class="adn">
        <span class="gD" name="Me"></span>
        <div class="a3s aiL">Second message</div>
      </div>
      <div class="adn">
        <span class="gD" name="Alice"></span>
        <div class="a3s aiL">Third message</div>
      </div>
    `;
    const context = adapter.scrapeThreadContext();
    expect(context[0].text).toBe('First message');
    expect(context[1].text).toBe('Second message');
    expect(context[2].text).toBe('Third message');
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
