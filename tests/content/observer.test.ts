import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputObserver } from '../../src/content/observer';

describe('InputObserver', () => {
  let observer: InputObserver;
  let onHeuristic: ReturnType<typeof vi.fn>;
  let onAiAnalyze: ReturnType<typeof vi.fn>;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    vi.useFakeTimers();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    onHeuristic = vi.fn();
    onAiAnalyze = vi.fn();
    observer = new InputObserver({
      debounceMs: 800,
      aiDebounceMs: 2000,
      minLength: 15,
      onHeuristic,
      onAiAnalyze,
    });
  });

  afterEach(() => {
    observer.disconnect();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not fire for short messages', () => {
    observer.observe(textarea);
    textarea.value = 'hi there';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(3000);
    expect(onHeuristic).not.toHaveBeenCalled();
    expect(onAiAnalyze).not.toHaveBeenCalled();
  });

  it('fires heuristic callback after short debounce', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message that should be analyzed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(800);
    expect(onHeuristic).toHaveBeenCalledWith('This is a longer message that should be analyzed');
    expect(onAiAnalyze).not.toHaveBeenCalled();
  });

  it('fires AI callback after longer debounce', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message that should be analyzed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(2000);
    expect(onHeuristic).toHaveBeenCalledWith('This is a longer message that should be analyzed');
    expect(onAiAnalyze).toHaveBeenCalledWith('This is a longer message that should be analyzed');
  });

  it('resets both debounces on continued typing', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message here';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    textarea.value = 'This is a longer message that changed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(onHeuristic).not.toHaveBeenCalled();
    expect(onAiAnalyze).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onHeuristic).toHaveBeenCalledTimes(1);
    expect(onAiAnalyze).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(onAiAnalyze).toHaveBeenCalledTimes(1);
  });

  it('increments generation on each input change', () => {
    observer.observe(textarea);
    expect(observer.generation).toBe(0);
    textarea.value = 'Some text here that is definitely long enough';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(observer.generation).toBe(1);
  });
});
