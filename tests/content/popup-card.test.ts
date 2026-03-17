import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PopupCard } from '../../src/content/popup-card';
import { MOCK_FLAGGED_RESULT } from '../mocks/mock-gemini-client';

describe('PopupCard', () => {
  let card: PopupCard;
  let onRewrite: ReturnType<typeof vi.fn>;
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onRewrite = vi.fn();
    onDismiss = vi.fn();
    card = new PopupCard({ onRewrite, onDismiss });
    document.body.appendChild(card.element);
  });

  it('creates a card element', () => {
    expect(card.element).toBeInstanceOf(HTMLElement);
  });

  it('shows with analysis result', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever, I guess that works.');
    expect(card.element.style.display).not.toBe('none');
    expect(card.element.querySelector('.reword-explanation')?.textContent).toContain('dismissive');
  });

  it('renders 3 rewrite options', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever, I guess that works.');
    const rewrites = card.element.querySelectorAll('.reword-rewrite-option');
    expect(rewrites.length).toBe(3);
  });

  it('calls onRewrite when a rewrite is clicked', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    const firstRewrite = card.element.querySelector<HTMLElement>('.reword-rewrite-option');
    firstRewrite?.click();
    expect(onRewrite).toHaveBeenCalledWith(MOCK_FLAGGED_RESULT.rewrites[0].text);
  });

  it('calls onDismiss when send original is clicked', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    card.element.querySelector<HTMLElement>('.reword-send-original')?.click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('hides the card', () => {
    card.show(MOCK_FLAGGED_RESULT, 'test');
    card.hide();
    expect(card.element.style.display).toBe('none');
  });
});
