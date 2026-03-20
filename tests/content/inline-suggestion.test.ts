import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InlineSuggestion } from '../../src/content/inline-suggestion';

describe('InlineSuggestion', () => {
  let suggestion: InlineSuggestion;
  let onAccept: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    suggestion = new InlineSuggestion();
    onAccept = vi.fn();
  });

  afterEach(() => {
    suggestion.dismiss();
  });

  describe('contentEditable elements', () => {
    let editableDiv: HTMLElement;

    beforeEach(() => {
      editableDiv = document.createElement('div');
      editableDiv.setAttribute('contenteditable', 'true');
      editableDiv.textContent = 'You should know better';
      document.body.appendChild(editableDiv);
    });

    it('shows ghost text after flagged result', () => {
      suggestion.show(
        editableDiv,
        'You should know better',
        'I think we can improve this',
        onAccept,
      );

      expect(suggestion.isVisible).toBe(true);
      const ghost = editableDiv.querySelector('.reword-ghost');
      expect(ghost).not.toBeNull();
      expect(ghost!.textContent).toContain('I think we can improve this');
      expect(ghost!.getAttribute('data-reword-ghost')).toBe('true');
    });

    it('ghost span has correct CSS class for styling', () => {
      suggestion.show(editableDiv, 'original', 'rewrite', onAccept);

      const ghost = editableDiv.querySelector('.reword-ghost');
      expect(ghost).not.toBeNull();
      expect(ghost!.className).toBe('reword-ghost');
    });

    it('injects ghost styles into document head', () => {
      suggestion.show(editableDiv, 'original', 'rewrite', onAccept);

      const styleEl = document.getElementById('reword-ghost-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.textContent).toContain('opacity: 0.4');
      expect(styleEl!.textContent).toContain('color: #888');
      expect(styleEl!.textContent).toContain('pointer-events: none');
      expect(styleEl!.textContent).toContain('user-select: none');
    });

    it('Tab accepts the suggestion', () => {
      suggestion.show(
        editableDiv,
        'You should know better',
        'I think we can improve this',
        onAccept,
      );

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(tabEvent);

      expect(onAccept).toHaveBeenCalledWith('I think we can improve this');
      expect(suggestion.isVisible).toBe(false);
    });

    it('Escape dismisses the ghost text', () => {
      suggestion.show(editableDiv, 'original', 'rewrite', onAccept);

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escEvent);

      expect(suggestion.isVisible).toBe(false);
      expect(onAccept).not.toHaveBeenCalled();
      expect(editableDiv.querySelector('.reword-ghost')).toBeNull();
    });

    it('typing dismisses the ghost text', () => {
      suggestion.show(editableDiv, 'original', 'rewrite', onAccept);

      editableDiv.dispatchEvent(new Event('input', { bubbles: true }));

      expect(suggestion.isVisible).toBe(false);
      expect(onAccept).not.toHaveBeenCalled();
    });

    it('ghost text is cleaned up before Send', () => {
      suggestion.show(editableDiv, 'original', 'rewrite', onAccept);
      expect(editableDiv.querySelector('.reword-ghost')).not.toBeNull();

      suggestion.cleanupBeforeSend();

      expect(editableDiv.querySelector('.reword-ghost')).toBeNull();
      expect(suggestion.isVisible).toBe(false);
    });

    it('replaces previous ghost text when show is called again', () => {
      suggestion.show(editableDiv, 'original', 'first rewrite', onAccept);
      suggestion.show(editableDiv, 'original', 'second rewrite', onAccept);

      const ghosts = editableDiv.querySelectorAll('.reword-ghost');
      expect(ghosts.length).toBe(1);
      expect(ghosts[0].textContent).toContain('second rewrite');
    });

    it('dismiss is safe to call when nothing is shown', () => {
      expect(() => suggestion.dismiss()).not.toThrow();
      expect(suggestion.isVisible).toBe(false);
    });
  });

  describe('textarea elements', () => {
    let textarea: HTMLTextAreaElement;
    let wrapper: HTMLElement;

    beforeEach(() => {
      wrapper = document.createElement('div');
      textarea = document.createElement('textarea');
      textarea.value = 'You should know better';
      wrapper.appendChild(textarea);
      document.body.appendChild(wrapper);
    });

    it('shows a tooltip for textarea elements', () => {
      suggestion.show(textarea, 'You should know better', 'I think we can improve this', onAccept);

      expect(suggestion.isVisible).toBe(true);
      const tooltip = wrapper.querySelector('.reword-ghost-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain('I think we can improve this');
    });

    it('Tab accepts the tooltip suggestion', () => {
      suggestion.show(textarea, 'original', 'rewrite text', onAccept);

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      document.dispatchEvent(tabEvent);

      expect(onAccept).toHaveBeenCalledWith('rewrite text');
      expect(suggestion.isVisible).toBe(false);
    });

    it('Escape dismisses the tooltip', () => {
      suggestion.show(textarea, 'original', 'rewrite', onAccept);

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escEvent);

      expect(suggestion.isVisible).toBe(false);
      expect(wrapper.querySelector('.reword-ghost-tooltip')).toBeNull();
    });

    it('typing dismisses the tooltip', () => {
      suggestion.show(textarea, 'original', 'rewrite', onAccept);

      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(suggestion.isVisible).toBe(false);
    });

    it('ghost tooltip is cleaned up before Send', () => {
      suggestion.show(textarea, 'original', 'rewrite', onAccept);
      expect(wrapper.querySelector('.reword-ghost-tooltip')).not.toBeNull();

      suggestion.cleanupBeforeSend();

      expect(wrapper.querySelector('.reword-ghost-tooltip')).toBeNull();
    });
  });
});
