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
});
