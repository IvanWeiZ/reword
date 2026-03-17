import { describe, it, expect, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { migrate } from '../../src/shared/storage';
import { DEFAULT_STORED_DATA, CURRENT_SCHEMA_VERSION } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = { storage: mockStorage };
});

describe('migrate', () => {
  it('returns data with current schema version', () => {
    const oldData = { ...DEFAULT_STORED_DATA, schemaVersion: 0 };
    const result = migrate(oldData);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves existing data during migration', () => {
    const oldData = {
      ...DEFAULT_STORED_DATA,
      schemaVersion: 0,
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        sensitivity: 'high' as const,
      },
    };
    const result = migrate(oldData);
    expect(result.settings.sensitivity).toBe('high');
  });

  it('fills in missing fields from defaults', () => {
    const partialData = {
      schemaVersion: 0,
      settings: { geminiApiKey: '', sensitivity: 'low' as const, enabledDomains: [] },
      relationshipProfiles: {},
      stats: DEFAULT_STORED_DATA.stats,
      dismissedPatterns: [],
    };
    const result = migrate(partialData);
    expect(result.stats).toBeDefined();
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('handles data already at current version', () => {
    const result = migrate({ ...DEFAULT_STORED_DATA });
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('v1 to v2 migration adds new settings fields', () => {
    const v1Data = {
      schemaVersion: 1,
      settings: {
        geminiApiKey: 'test-key',
        sensitivity: 'medium' as const,
        enabledDomains: ['example.com'],
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 5,
        totalFlagged: 2,
        rewritesAccepted: 1,
        monthlyApiCalls: 3,
        monthlyApiCallsResetDate: '2026-01-01',
      },
      dismissedPatterns: [],
    };
    const result = migrate(v1Data);
    expect(result.schemaVersion).toBe(2);
    expect(result.settings.customPatterns).toEqual([]);
    expect(result.settings.theme).toBe('auto');
    expect(result.settings.rewritePersonas).toEqual([]);
    expect(result.settings.analyzeIncoming).toBe(false);
    expect(result.stats.recentFlags).toEqual([]);
    // Preserved existing data
    expect(result.settings.geminiApiKey).toBe('test-key');
    expect(result.stats.totalAnalyzed).toBe(5);
  });
});
