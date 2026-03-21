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

  // positionNear()
  it('positions popup near the target element based on bounding rect', () => {
    // Create a target element with a known bounding rect
    const target = document.createElement('div');
    document.body.appendChild(target);

    // Mock getBoundingClientRect on the target
    target.getBoundingClientRect = () => ({
      top: 300,
      bottom: 330,
      left: 500,
      right: 700,
      width: 200,
      height: 30,
      x: 500,
      y: 300,
      toJSON: () => ({}),
    });

    // Mock viewport dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });

    // The card needs to report a height for the measurement logic
    Object.defineProperty(card.element, 'offsetHeight', { value: 200, configurable: true });

    card.positionNear(target);

    // Should be positioned above the target (300 - 200 - 8 = 92)
    expect(card.element.style.top).toBe('92px');
    // Right-aligned to target: 700 - 400 = 300
    expect(card.element.style.left).toBe('300px');
    // Should have cleared bottom/right
    expect(card.element.style.bottom).toBe('');
    expect(card.element.style.right).toBe('');
  });

  it('positions popup below target when not enough space above', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    target.getBoundingClientRect = () => ({
      top: 50,
      bottom: 80,
      left: 500,
      right: 700,
      width: 200,
      height: 30,
      x: 500,
      y: 50,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
    Object.defineProperty(card.element, 'offsetHeight', { value: 200, configurable: true });

    card.positionNear(target);

    // Not enough space above (50 < 200+8), so place below: 80 + 8 = 88
    expect(card.element.style.top).toBe('88px');
  });

  it('falls back to fixed bottom-right when target is not in DOM', () => {
    const detached = document.createElement('div');
    // detached is not appended to document.body

    card.positionNear(detached);

    expect(card.element.style.bottom).toBe('80px');
    expect(card.element.style.right).toBe('24px');
  });

  it('clamps popup left edge when it would overflow left', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    // Target near left edge — right edge at 100, so 100-400 = -300 which is < 8
    target.getBoundingClientRect = () => ({
      top: 300,
      bottom: 330,
      left: 10,
      right: 100,
      width: 90,
      height: 30,
      x: 10,
      y: 300,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
    Object.defineProperty(card.element, 'offsetHeight', { value: 200, configurable: true });

    card.positionNear(target);

    // Should clamp to MARGIN (8)
    expect(card.element.style.left).toBe('8px');
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

  // ── Save profile inline form (lines 428–485) ───────────────

  describe('save profile inline form', () => {
    beforeEach(() => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({}),
          onMessage: { addListener: vi.fn() },
        },
      };
    });

    it('renders save-profile link when recipientId is set', () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      const link = card.element.querySelector('.reword-save-profile-link');
      expect(link).not.toBeNull();
      expect(link!.textContent).toContain('Save tone preferences');
    });

    it('does not render save-profile link when recipientId is null', () => {
      card.recipientId = null;
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      const link = card.element.querySelector('.reword-save-profile-link');
      expect(link).toBeNull();
    });

    it('does not render save-profile link when contact is already saved', () => {
      card.recipientId = 'gmail:jane@example.com';
      card.markContactSaved('gmail:jane@example.com');
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      const link = card.element.querySelector('.reword-save-profile-link');
      expect(link).toBeNull();
    });

    it('clicking save-profile link shows form and hides link', () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      const link = card.element.querySelector<HTMLElement>('.reword-save-profile-link')!;
      const form = card.element.querySelector<HTMLElement>('.reword-save-profile-form')!;

      expect(form.style.display).toBe('none');
      link.click();
      expect(form.style.display).toBe('block');
      expect(link.style.display).toBe('none');
    });

    it('clicking cancel hides form and shows link', () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      const link = card.element.querySelector<HTMLElement>('.reword-save-profile-link')!;
      const form = card.element.querySelector<HTMLElement>('.reword-save-profile-form')!;
      const cancelBtn = card.element.querySelector<HTMLElement>('.reword-save-profile-cancel')!;

      link.click();
      expect(form.style.display).toBe('block');

      cancelBtn.click();
      expect(form.style.display).toBe('none');
      expect(link.style.display).toBe('block');
    });

    it('pre-populates display name from recipientId (email part before @)', () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      const nameInput = card.element.querySelector<HTMLInputElement>(
        '.reword-profile-display-name',
      )!;
      expect(nameInput.value).toBe('jane');
    });

    it('pre-populates display name from recipientId without @ (e.g. linkedin)', () => {
      card.recipientId = 'linkedin:john-doe';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      const nameInput = card.element.querySelector<HTMLInputElement>(
        '.reword-profile-display-name',
      )!;
      expect(nameInput.value).toBe('john-doe');
    });

    it('saves profile via chrome.runtime.sendMessage on form submit', async () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      // Fill in form fields
      card.element.querySelector<HTMLInputElement>('.reword-profile-display-name')!.value =
        'Jane Smith';
      card.element.querySelector<HTMLSelectElement>('.reword-profile-relationship')!.value =
        'family';
      card.element.querySelector<HTMLSelectElement>('.reword-profile-sensitivity')!.value = 'high';
      card.element.querySelector<HTMLInputElement>('.reword-profile-tone-goal')!.value = 'be warm';
      card.element.querySelector<HTMLInputElement>('.reword-profile-cultural-context')!.value =
        'indirect';

      // Click save
      card.element.querySelector<HTMLElement>('.reword-save-profile-btn')!.click();
      await new Promise((r) => setTimeout(r, 0));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'save-contact-profile',
          profile: expect.objectContaining({
            displayName: 'Jane Smith',
            platformId: 'gmail:jane@example.com',
            relationshipType: 'family',
            sensitivity: 'high',
            toneGoal: 'be warm',
            culturalContext: 'indirect',
          }),
        }),
      );
    });

    it('removes form elements after successful save', async () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      card.element.querySelector<HTMLElement>('.reword-save-profile-btn')!.click();
      await new Promise((r) => setTimeout(r, 0));

      expect(card.element.querySelector('.reword-save-profile-form')).toBeNull();
      expect(card.element.querySelector('.reword-save-profile-link')).toBeNull();
    });

    it('uses platformId as displayName when display name input is empty', async () => {
      card.recipientId = 'gmail:jane@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');

      card.element.querySelector<HTMLInputElement>('.reword-profile-display-name')!.value = '  ';

      card.element.querySelector<HTMLElement>('.reword-save-profile-btn')!.click();
      await new Promise((r) => setTimeout(r, 0));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            displayName: 'gmail:jane@example.com',
          }),
        }),
      );
    });

    it('does not save when recipientId is null', async () => {
      card.recipientId = 'gmail:test@example.com';
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      // Clear recipientId after rendering the form
      card.recipientId = null;

      card.element.querySelector<HTMLElement>('.reword-save-profile-btn')!.click();
      await new Promise((r) => setTimeout(r, 0));

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'save-contact-profile' }),
      );
    });
  });

  // ── Suppress link (line 414-420) ────────────────────────────

  describe('suppress link', () => {
    it('renders suppress link', () => {
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      const suppressLink = card.element.querySelector('.reword-suppress-link');
      expect(suppressLink).not.toBeNull();
      expect(suppressLink!.textContent).toContain("Don't flag this again");
    });

    it('calls onSuppress with original text and hides card', () => {
      const onSuppress = vi.fn();
      const cardWithSuppress = new PopupCard({
        onRewrite,
        onDismiss,
        onUndo,
        onSuppress,
      });
      document.body.appendChild(cardWithSuppress.element);

      cardWithSuppress.show(MOCK_FLAGGED_RESULT, 'test message');
      cardWithSuppress.element.querySelector<HTMLElement>('.reword-suppress-link')!.click();

      expect(onSuppress).toHaveBeenCalledWith('test message');
      expect(cardWithSuppress.element.style.display).toBe('none');
    });
  });

  // ── Theme switching (isDark logic) ──────────────────────────

  describe('theme switching', () => {
    it('isDark returns true when theme is dark', () => {
      card.setTheme('dark');
      expect(card.isDark()).toBe(true);
    });

    it('isDark returns false when theme is light', () => {
      card.setTheme('light');
      expect(card.isDark()).toBe(false);
    });

    it('updates CSS when theme changes', () => {
      card.setTheme('light');
      const style = document.getElementById('reword-popup-styles');
      expect(style).not.toBeNull();
      const cssText = style!.textContent!;
      // Light theme uses white background
      expect(cssText).toContain('#ffffff');

      card.setTheme('dark');
      const darkCss = style!.textContent!;
      // Dark theme uses dark background
      expect(darkCss).toContain('#1e1e2e');
    });
  });

  // ── cap() method (line 547) ─────────────────────────────────

  describe('risk level display', () => {
    it('capitalizes unknown risk levels via cap()', () => {
      // Use a result with a non-standard risk level to trigger the cap() fallback
      const customResult = {
        ...MOCK_FLAGGED_RESULT,
        riskLevel: 'critical' as any,
      };
      card.show(customResult, 'Whatever');
      const indicator = card.element.querySelector('.reword-risk-indicator');
      expect(indicator!.textContent).toContain('Critical');
    });

    it('uses RISK_LABELS for known risk levels', () => {
      card.show(MOCK_FLAGGED_RESULT, 'Whatever');
      const indicator = card.element.querySelector('.reword-risk-indicator');
      // medium maps to 'Moderate'
      expect(indicator!.textContent).toContain('Moderate');
    });
  });
});
