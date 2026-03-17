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
});
