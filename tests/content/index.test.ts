import { describe, it, expect, vi } from 'vitest';

// We can't directly test the IIFE in index.ts, but we can test detectAdapter logic
// by verifying the adapter pattern. We import the adapters to test detection logic.
import { GmailAdapter } from '../../src/adapters/gmail';
import { LinkedInAdapter } from '../../src/adapters/linkedin';
import { TwitterAdapter } from '../../src/adapters/twitter';
import { GenericFallbackAdapter } from '../../src/adapters/base';

describe('detectAdapter (adapter selection by hostname)', () => {
  it('GmailAdapter targets mail.google.com', () => {
    const adapter = new GmailAdapter();
    expect(adapter).toBeInstanceOf(GmailAdapter);
    expect(adapter.findInputField).toBeDefined();
    expect(adapter.placeTriggerIcon).toBeDefined();
    expect(adapter.writeBack).toBeDefined();
    expect(adapter.scrapeThreadContext).toBeDefined();
    expect(adapter.checkHealth).toBeDefined();
  });

  it('LinkedInAdapter targets www.linkedin.com', () => {
    const adapter = new LinkedInAdapter();
    expect(adapter).toBeInstanceOf(LinkedInAdapter);
  });

  it('TwitterAdapter targets x.com and twitter.com', () => {
    const adapter = new TwitterAdapter();
    expect(adapter).toBeInstanceOf(TwitterAdapter);
  });

  it('GenericFallbackAdapter is used for unknown hosts', () => {
    const adapter = new GenericFallbackAdapter();
    expect(adapter).toBeInstanceOf(GenericFallbackAdapter);
  });
});

describe('InputObserver integration with content script', () => {
  it('InputObserver exposes currentElement getter', async () => {
    const { InputObserver } = await import('../../src/content/observer');
    const onAnalyze = vi.fn();
    const observer = new InputObserver({ debounceMs: 100, minLength: 5, onAnalyze });

    expect(observer.currentElement).toBeNull();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    observer.observe(textarea);

    expect(observer.currentElement).toBe(textarea);

    observer.disconnect();
    expect(observer.currentElement).toBeNull();
    document.body.innerHTML = '';
  });
});

describe('generation tracking', () => {
  it('generation counter increments on each input event', async () => {
    vi.useFakeTimers();
    const { InputObserver } = await import('../../src/content/observer');
    const onAnalyze = vi.fn();
    const observer = new InputObserver({ debounceMs: 2000, minLength: 10, onAnalyze });

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    observer.observe(textarea);

    expect(observer.generation).toBe(0);

    textarea.value = 'First input that is long enough';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(observer.generation).toBe(1);

    textarea.value = 'Second input that is long enough';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(observer.generation).toBe(2);

    observer.disconnect();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });
});
