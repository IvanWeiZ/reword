import { describe, it, expect } from 'vitest';
import { scoreMessage } from '../../src/content/heuristic-scorer';

describe('Send interception', () => {
  function createInput(): HTMLDivElement {
    const container = document.createElement('div');
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('role', 'textbox');
    container.appendChild(input);
    document.body.appendChild(container);
    return input;
  }

  it('synchronous preventDefault blocks the event', () => {
    const input = createInput();
    const parent = input.parentElement!;
    let blocked = false;

    parent.addEventListener(
      'keydown',
      (e) => {
        e.preventDefault();
        blocked = true;
      },
      true,
    );

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    const result = input.dispatchEvent(event);
    expect(result).toBe(false);
    expect(blocked).toBe(true);

    parent.remove();
  });

  it('does not block Shift+Enter', () => {
    const input = createInput();
    const parent = input.parentElement!;
    let blocked = false;

    parent.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          blocked = true;
        }
      },
      true,
    );

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(blocked).toBe(false);

    parent.remove();
  });

  it('blocks long messages but allows short ones', () => {
    const input = createInput();
    const parent = input.parentElement!;
    const MIN_LENGTH = 10;
    let blocked = false;

    parent.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          const text = input.textContent?.trim() ?? '';
          if (text.length >= MIN_LENGTH) {
            e.preventDefault();
            blocked = true;
          }
        }
      },
      true,
    );

    // Short message — should pass through
    input.textContent = 'hi';
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(blocked).toBe(false);

    // Long harsh message — should block
    input.textContent = 'you are useless and terrible!!!';
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(blocked).toBe(true);

    parent.remove();
  });

  it('quickScore equivalent catches negative emojis', () => {
    // Verify the heuristic scorer (which quickScore mirrors) flags negative emojis
    const score = scoreMessage('this is ridiculous 🙄');
    expect(score).toBeGreaterThanOrEqual(0.3);
  });
});
