import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerIcon } from '../../src/content/trigger';

describe('TriggerIcon', () => {
  let trigger: TriggerIcon;
  let onClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onClick = vi.fn();
    trigger = new TriggerIcon(onClick);
  });

  it('creates an element', () => {
    expect(trigger.element).toBeInstanceOf(HTMLElement);
  });

  it('shows with correct risk level', () => {
    trigger.show('medium');
    expect(trigger.element.style.display).not.toBe('none');
  });

  it('hides the trigger', () => {
    trigger.show('medium');
    trigger.hide();
    expect(trigger.element.style.display).toBe('none');
  });

  it('calls onClick when clicked', () => {
    document.body.appendChild(trigger.element);
    trigger.show('medium');
    trigger.element.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('applies pulse animation class when shown', () => {
    trigger.show('medium');
    expect(trigger.element.classList.contains('reword-pulse')).toBe(true);
  });

  it('restarts pulse animation on subsequent show calls', () => {
    trigger.show('medium');
    expect(trigger.element.classList.contains('reword-pulse')).toBe(true);
    // Second call should still have the class (removed and re-added)
    trigger.show('high');
    expect(trigger.element.classList.contains('reword-pulse')).toBe(true);
  });

  it('injects pulse keyframes stylesheet into document head', () => {
    trigger.show('low');
    const styles = document.querySelectorAll('style');
    const hasKeyframes = Array.from(styles).some((s) =>
      s.textContent?.includes('@keyframes reword-pulse'),
    );
    expect(hasKeyframes).toBe(true);
  });
});
