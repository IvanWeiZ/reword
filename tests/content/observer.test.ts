import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputObserver } from '../../src/content/observer';

describe('InputObserver', () => {
  let observer: InputObserver;
  let onAnalyze: ReturnType<typeof vi.fn>;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    vi.useFakeTimers();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    onAnalyze = vi.fn();
    observer = new InputObserver({ debounceMs: 2000, minLength: 10, onAnalyze });
  });

  afterEach(() => {
    observer.disconnect();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not fire for short messages', () => {
    observer.observe(textarea);
    textarea.value = 'hi';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(3000);
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('fires after debounce for long messages', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message that should be analyzed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(2000);
    expect(onAnalyze).toHaveBeenCalledWith('This is a longer message that should be analyzed');
  });

  it('resets debounce on continued typing', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    textarea.value = 'This is a longer message that changed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(onAnalyze).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('increments generation on each input change', () => {
    observer.observe(textarea);
    expect(observer.generation).toBe(0);
    textarea.value = 'Some text here that is long enough';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(observer.generation).toBe(1);
  });
});
