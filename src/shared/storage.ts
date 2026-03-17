import type { StoredData } from './types';
import { DEFAULT_STORED_DATA, CURRENT_SCHEMA_VERSION } from './constants';

const STORAGE_KEY = 'reword';

export async function loadStoredData(): Promise<StoredData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] as StoredData | undefined;
  if (!data) return { ...DEFAULT_STORED_DATA };

  let migrated = data;
  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    migrated = migrate(data);
  }

  // Reset monthly API call counter if month has rolled over
  const currentMonth = new Date().toISOString().slice(0, 7);
  const storedMonth = migrated.stats.monthlyApiCallsResetDate.slice(0, 7);
  if (currentMonth !== storedMonth) {
    migrated.stats.monthlyApiCalls = 0;
    migrated.stats.monthlyApiCallsResetDate = new Date().toISOString().slice(0, 10);
    await saveStoredData(migrated);
  }

  return migrated;
}

export async function saveStoredData(data: StoredData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function migrate(data: StoredData): StoredData {
  // v1 is the only version — no migrations yet
  // Future: if (data.schemaVersion < 2) { ... data.schemaVersion = 2; }
  return { ...DEFAULT_STORED_DATA, ...data, schemaVersion: CURRENT_SCHEMA_VERSION };
}
