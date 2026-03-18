import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TeamsAdapter } from '../../src/adapters/teams';

describe('TeamsAdapter', () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    const html = readFileSync(
      resolve(__dirname, '../mocks/mock-dom-fixtures/teams-message.html'),
      'utf-8',
    );
    document.body.innerHTML = html;
    adapter = new TeamsAdapter();
  });

  it('has platformName "teams"', () => {
    expect(adapter.platformName).toBe('teams');
  });

  it('finds the Teams message input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('contenteditable')).toBe('true');
    expect(field?.getAttribute('data-tid')).toBe('ckeditor');
  });

  it('returns null when input is missing', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(adapter.findInputField()).toBeNull();
  });

  it('places trigger icon in compose toolbar', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('placeTriggerIcon returns null when toolbar is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.placeTriggerIcon(document.createElement('div'))).toBeNull();
  });

  it('writeBack returns false when no input exists', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.writeBack('test')).toBe(false);
  });

  it('writeBack replaces content and dispatches input event', () => {
    const input = adapter.findInputField();
    expect(input).not.toBeNull();
    const handler = vi.fn();
    input!.addEventListener('input', handler);
    adapter.writeBack('Rewritten message');
    expect(input!.textContent).toBe('Rewritten message');
    expect(handler).toHaveBeenCalled();
  });

  it('scrapeThreadContext extracts messages', () => {
    const context = adapter.scrapeThreadContext();
    expect(context.length).toBe(2);
    expect(context[0].sender).toBe('other');
    expect(context[0].text).toContain('review the PR');
    expect(context[1].sender).toBe('self');
  });

  it('getIncomingMessageElements returns non-self messages', () => {
    const elements = adapter.getIncomingMessageElements();
    expect(elements.length).toBe(1);
  });

  it('placeIncomingIndicator attaches and removes indicator', () => {
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

  it('checkHealth returns true when input and send button exist', () => {
    expect(adapter.checkHealth()).toBe(true);
  });

  it('checkHealth returns false when input is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(adapter.checkHealth()).toBe(false);
  });
});
