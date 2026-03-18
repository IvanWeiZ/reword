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
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.settings.customPatterns).toEqual([]);
    expect(result.settings.theme).toBe('auto');
    expect(result.settings.rewritePersonas).toEqual([]);
    expect(result.settings.analyzeIncoming).toBe(false);
    expect(result.stats.recentFlags).toEqual([]);
    // Preserved existing data
    expect(result.settings.geminiApiKey).toBe('test-key');
    expect(result.stats.totalAnalyzed).toBe(5);
  });

  it('v1 to v2 migration adds enabledDomains when missing', () => {
    const v1Data = {
      schemaVersion: 1,
      settings: {
        geminiApiKey: '',
        sensitivity: 'medium' as const,
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 0,
        totalFlagged: 0,
        rewritesAccepted: 0,
        monthlyApiCalls: 0,
        monthlyApiCallsResetDate: '2026-01-01',
      },
      dismissedPatterns: [],
    };
    const result = migrate(v1Data);
    expect(result.settings.enabledDomains).toEqual([]);
    expect(result.settings.customPatterns).toEqual([]);
    expect(result.settings.rewritePersonas).toEqual([]);
    expect(result.settings.theme).toBe('auto');
    expect(result.settings.analyzeIncoming).toBe(false);
  });

  it('v1 to v2 migration is idempotent', () => {
    const v1Data = {
      schemaVersion: 1,
      settings: {
        geminiApiKey: 'my-key',
        sensitivity: 'high' as const,
        enabledDomains: ['mail.google.com'],
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 10,
        totalFlagged: 3,
        rewritesAccepted: 2,
        monthlyApiCalls: 5,
        monthlyApiCallsResetDate: '2026-03-01',
      },
      dismissedPatterns: [],
    };

    // Migrate once
    const first = migrate(v1Data);
    // Migrate the already-migrated result again
    const second = migrate(first);

    expect(second).toEqual(first);
    expect(second.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(second.settings.geminiApiKey).toBe('my-key');
    expect(second.settings.customPatterns).toEqual([]);
    expect(second.settings.theme).toBe('auto');
    expect(second.settings.rewritePersonas).toEqual([]);
    expect(second.settings.analyzeIncoming).toBe(false);
    expect(second.stats.recentFlags).toEqual([]);
  });

  it('current version data passes through unchanged', () => {
    const currentData = {
      ...DEFAULT_STORED_DATA,
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        geminiApiKey: 'existing-key',
        sensitivity: 'high' as const,
        customPatterns: ['pattern1'],
        theme: 'dark' as const,
        rewritePersonas: [{ label: 'Friendly', instruction: 'Be friendly' }],
        analyzeIncoming: true,
        enabledDomains: ['mail.google.com', 'linkedin.com'],
      },
      stats: {
        ...DEFAULT_STORED_DATA.stats,
        totalAnalyzed: 100,
        recentFlags: [
          {
            date: '2026-03-01',
            platform: 'gmail',
            riskLevel: 'high' as const,
            issues: ['passive-aggressive'],
            textSnippet: 'test',
          },
        ],
      },
    };

    const result = migrate(currentData);

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.settings.geminiApiKey).toBe('existing-key');
    expect(result.settings.sensitivity).toBe('high');
    expect(result.settings.customPatterns).toEqual(['pattern1']);
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.rewritePersonas).toEqual([
      { label: 'Friendly', instruction: 'Be friendly' },
    ]);
    expect(result.settings.analyzeIncoming).toBe(true);
    expect(result.settings.enabledDomains).toEqual(['mail.google.com', 'linkedin.com']);
    expect(result.stats.totalAnalyzed).toBe(100);
    expect(result.stats.recentFlags).toHaveLength(1);
  });

  it('v2 to v3 migration adds suppressedPhrases', () => {
    const v2Data = {
      schemaVersion: 2,
      settings: {
        geminiApiKey: 'test-key',
        sensitivity: 'medium' as const,
        enabledDomains: ['example.com'],
        customPatterns: ['test'],
        theme: 'auto' as const,
        rewritePersonas: [],
        analyzeIncoming: false,
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 10,
        totalFlagged: 3,
        rewritesAccepted: 1,
        monthlyApiCalls: 5,
        monthlyApiCallsResetDate: '2026-01-01',
        recentFlags: [],
      },
      dismissedPatterns: [],
    };
    const result = migrate(v2Data);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.settings.suppressedPhrases).toEqual([]);
    expect(result.settings.geminiApiKey).toBe('test-key');
    expect(result.settings.customPatterns).toEqual(['test']);
  });

  it('handles unknown future version gracefully', () => {
    const futureData = {
      ...DEFAULT_STORED_DATA,
      schemaVersion: 999,
      settings: {
        ...DEFAULT_STORED_DATA.settings,
        geminiApiKey: 'future-key',
      },
    };

    // Should not throw and should preserve the data
    const result = migrate(futureData);
    expect(result.schemaVersion).toBe(999);
    expect(result.settings.geminiApiKey).toBe('future-key');
  });

  it('does not mutate the original data object', () => {
    const v1Data = {
      schemaVersion: 1,
      settings: {
        geminiApiKey: 'key',
        sensitivity: 'medium' as const,
        enabledDomains: [],
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 0,
        totalFlagged: 0,
        rewritesAccepted: 0,
        monthlyApiCalls: 0,
        monthlyApiCallsResetDate: '2026-01-01',
      },
      dismissedPatterns: [],
    };

    const originalVersion = v1Data.schemaVersion;
    migrate(v1Data);
    // The original object's schemaVersion should not be changed
    expect(v1Data.schemaVersion).toBe(originalVersion);
  });
});
