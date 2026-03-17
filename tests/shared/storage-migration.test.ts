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
    };
    const result = migrate(partialData);
    expect(result.stats).toBeDefined();
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('handles data already at current version', () => {
    const result = migrate({ ...DEFAULT_STORED_DATA });
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
