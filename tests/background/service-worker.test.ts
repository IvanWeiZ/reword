import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../../src/background/service-worker';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: { onMessage: { addListener: vi.fn() } },
  };
});

describe('handleMessage', () => {
  it('returns settings on get-settings message', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-settings' });
    expect(result.type).toBe('settings');
  });

  it('returns null profile for unknown domain', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-profile', domain: 'unknown.com' });
    expect(result.type).toBe('profile');
    expect((result as any).profile).toBeNull();
  });

  it('returns a known profile for a configured domain', async () => {
    const dataWithProfile = {
      ...DEFAULT_STORED_DATA,
      relationshipProfiles: {
        'mail.google.com': { type: 'romantic' as const, label: 'partner' },
      },
    };
    await mockStorage.local.set({ reword: dataWithProfile });
    const result = await handleMessage({ type: 'get-profile', domain: 'mail.google.com' });
    expect(result.type).toBe('profile');
    expect((result as any).profile?.type).toBe('romantic');
  });

  it('increments stat on increment-stat message', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    const result = await handleMessage({ type: 'get-settings' });
    expect((result as any).data.stats.rewritesAccepted).toBe(1);
  });

  it('returns analysis-error when gemini is not configured', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA }); // no API key
    const result = await handleMessage({
      type: 'analyze',
      text: 'whatever',
      context: [],
      relationshipType: 'workplace',
      sensitivity: 'medium',
    });
    expect(result.type).toBe('analysis-error');
  });

  it('records flag event in history (#1)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({
      type: 'record-flag',
      event: {
        date: '2026-01-01T00:00:00Z',
        platform: 'gmail',
        riskLevel: 'medium',
        issues: ['passive-aggressive'],
        textSnippet: 'whatever',
      },
    });
    const result = await handleMessage({ type: 'get-settings' });
    expect((result as any).data.stats.recentFlags).toHaveLength(1);
    expect((result as any).data.stats.recentFlags[0].platform).toBe('gmail');
  });

  it('records dismiss and suppresses after threshold (#6)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });

    // Dismiss 3 times (DISMISS_SUPPRESS_THRESHOLD = 3)
    for (let i = 0; i < 3; i++) {
      await handleMessage({ type: 'record-dismiss', textSnippet: 'whatever i guess' });
    }

    const result = await handleMessage({
      type: 'check-suppressed',
      textSnippet: 'whatever i guess',
    });
    expect(result.type).toBe('suppression-result');
    expect((result as any).suppressed).toBe(true);
  });

  it('does not suppress before threshold (#6)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({ type: 'record-dismiss', textSnippet: 'test snippet' });
    const result = await handleMessage({ type: 'check-suppressed', textSnippet: 'test snippet' });
    expect((result as any).suppressed).toBe(false);
  });

  it('returns not-suppressed for unknown snippet', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'check-suppressed', textSnippet: 'never seen' });
    expect((result as any).suppressed).toBe(false);
  });
});
