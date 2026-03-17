import { describe, it, expect, vi } from 'vitest';

// We import the adapters to test detection logic and new platform support
import { GmailAdapter } from '../../src/adapters/gmail';
import { LinkedInAdapter } from '../../src/adapters/linkedin';
import { TwitterAdapter } from '../../src/adapters/twitter';
import { SlackAdapter } from '../../src/adapters/slack';
import { DiscordAdapter } from '../../src/adapters/discord';
import { GenericFallbackAdapter } from '../../src/adapters/base';

describe('adapter platform names', () => {
  it('GmailAdapter has platformName "gmail"', () => {
    expect(new GmailAdapter().platformName).toBe('gmail');
  });

  it('LinkedInAdapter has platformName "linkedin"', () => {
    expect(new LinkedInAdapter().platformName).toBe('linkedin');
  });

  it('TwitterAdapter has platformName "twitter"', () => {
    expect(new TwitterAdapter().platformName).toBe('twitter');
  });

  it('SlackAdapter has platformName "slack"', () => {
    expect(new SlackAdapter().platformName).toBe('slack');
  });

  it('DiscordAdapter has platformName "discord"', () => {
    expect(new DiscordAdapter().platformName).toBe('discord');
  });

  it('GenericFallbackAdapter has platformName "generic"', () => {
    expect(new GenericFallbackAdapter().platformName).toBe('generic');
  });
});

describe('adapter interface compliance', () => {
  const adapters = [
    new GmailAdapter(),
    new LinkedInAdapter(),
    new TwitterAdapter(),
    new SlackAdapter(),
    new DiscordAdapter(),
    new GenericFallbackAdapter(),
  ];

  for (const adapter of adapters) {
    describe(adapter.platformName, () => {
      it('implements all required PlatformAdapter methods', () => {
        expect(adapter.findInputField).toBeDefined();
        expect(adapter.placeTriggerIcon).toBeDefined();
        expect(adapter.writeBack).toBeDefined();
        expect(adapter.scrapeThreadContext).toBeDefined();
        expect(adapter.checkHealth).toBeDefined();
        expect(typeof adapter.platformName).toBe('string');
      });
    });
  }
});

describe('InputObserver.currentElement getter', () => {
  it('exposes currentElement and updates on observe/disconnect', async () => {
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
