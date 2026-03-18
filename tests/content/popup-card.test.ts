import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PopupCard } from '../../src/content/popup-card';
import { MOCK_FLAGGED_RESULT } from '../mocks/mock-gemini-client';

describe('PopupCard', () => {
  let card: PopupCard;
  let onRewrite: ReturnType<typeof vi.fn>;
  let onDismiss: ReturnType<typeof vi.fn>;
  let onUndo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onRewrite = vi.fn();
    onDismiss = vi.fn();
    onUndo = vi.fn();
    card = new PopupCard({ onRewrite, onDismiss, onUndo });
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

  // Feature #2: keyboard shortcuts
  it('accepts rewrite via number key (#2)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onRewrite).toHaveBeenCalledWith(MOCK_FLAGGED_RESULT.rewrites[0].text);
  });

  it('closes on Escape key (#2)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.element.style.display).toBe('none');
  });

  it('accepts rewrite via Alt+number key', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true }));
    expect(onRewrite).toHaveBeenCalledWith(MOCK_FLAGGED_RESULT.rewrites[1].text);
  });

  it('dismisses popup and sends original on Enter key', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(card.element.style.display).toBe('none');
  });

  it('does not respond to keys when popup is hidden', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    card.hide();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onRewrite).not.toHaveBeenCalled();
  });

  it('removes keyboard listener on hide', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    card.hide();
    // Show again and verify shortcuts still work (listener re-bound)
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onRewrite).toHaveBeenCalledWith(MOCK_FLAGGED_RESULT.rewrites[0].text);
  });

  it('shows shortcut hints with option key symbol', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    const hints = card.element.querySelectorAll('.reword-rewrite-shortcut');
    expect(hints[0]?.textContent).toContain('⌥1');
    expect(hints[1]?.textContent).toContain('⌥2');
    expect(hints[2]?.textContent).toContain('⌥3');
  });

  it('shows Esc and Enter hints on action buttons', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    const sendBtn = card.element.querySelector('.reword-send-original');
    const cancelBtn = card.element.querySelector('.reword-cancel');
    expect(sendBtn?.textContent).toContain('Enter');
    expect(cancelBtn?.textContent).toContain('Esc');
  });

  it('shows shortcut hints (#2)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    expect(card.element.querySelector('.reword-shortcut-hint')?.textContent).toContain('1\u20133');
  });

  // Feature #4: "Why was this flagged?" detail section
  it('renders details toggle (#4)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    const toggle = card.element.querySelector('.reword-details-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toContain('Why was this flagged');
  });

  it('toggles details content on click (#4)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    const toggle = card.element.querySelector<HTMLElement>('.reword-details-toggle');
    const content = card.element.querySelector('.reword-details-content');
    expect(content?.classList.contains('reword-expanded')).toBe(false);
    toggle?.click();
    expect(content?.classList.contains('reword-expanded')).toBe(true);
    toggle?.click();
    expect(content?.classList.contains('reword-expanded')).toBe(false);
  });

  // Feature #7: streaming
  it('shows streaming indicator (#7)', () => {
    card.showStreaming();
    expect(card.element.style.display).not.toBe('none');
    expect(card.element.textContent).toContain('Analyzing');
  });

  // Feature #10: theme support
  it('accepts theme setting (#10)', () => {
    card.setTheme('light');
    // Should update styles without throwing
    card.show(MOCK_FLAGGED_RESULT, 'test');
    expect(card.element.style.display).not.toBe('none');
  });

  // Feature #11: undo toast
  it('shows undo toast after accepting rewrite (#11)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    card.element.querySelector<HTMLElement>('.reword-rewrite-option')?.click();
    const toast = document.querySelector('.reword-undo-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Undo');
  });

  it('calls onUndo when undo button is clicked (#11)', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever');
    card.element.querySelector<HTMLElement>('.reword-rewrite-option')?.click();
    const undoBtn = document.querySelector<HTMLElement>('.reword-undo-btn');
    undoBtn?.click();
    expect(onUndo).toHaveBeenCalled();
  });
});
