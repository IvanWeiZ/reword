import { describe, it, expect, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { loadStoredData, saveStoredData } from '../../src/shared/storage';
import { DEFAULT_STORED_DATA, CURRENT_SCHEMA_VERSION } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = { storage: mockStorage };
});

describe('loadStoredData', () => {
  it('returns defaults when storage is empty', async () => {
    const data = await loadStoredData();
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.settings.sensitivity).toBe('medium');
  });

  it('returns saved data when present', async () => {
    const custom = {
      ...DEFAULT_STORED_DATA,
      settings: { ...DEFAULT_STORED_DATA.settings, sensitivity: 'high' as const },
    };
    await mockStorage.local.set({ reword: custom });
    const data = await loadStoredData();
    expect(data.settings.sensitivity).toBe('high');
  });

  it('resets monthly api calls when month has rolled over', async () => {
    const oldData = {
      ...DEFAULT_STORED_DATA,
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        monthlyApiCalls: 42,
        monthlyApiCallsResetDate: '2025-01-15', // old month
      },
    };
    await mockStorage.local.set({ reword: oldData });
    const data = await loadStoredData();
    expect(data.stats.monthlyApiCalls).toBe(0);
  });
});

describe('saveStoredData', () => {
  it('persists data to chrome storage', async () => {
    const custom = {
      ...DEFAULT_STORED_DATA,
      settings: { ...DEFAULT_STORED_DATA.settings, sensitivity: 'low' as const },
    };
    await saveStoredData(custom);
    const raw = await mockStorage.local.get('reword');
    expect((raw.reword as any).settings.sensitivity).toBe('low');
  });
});
