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
    await saveStoredData(migrated);
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

type MigrationFn = (data: StoredData) => StoredData;

const migrations: Record<number, MigrationFn> = {
  // Example: when schema v2 is needed, add:
  // 2: (data) => { data.newField = defaultValue; data.schemaVersion = 2; return data; },
};

export function migrate(data: StoredData): StoredData {
  let current = { ...DEFAULT_STORED_DATA, ...data };

  // Apply each migration in order
  for (let v = current.schemaVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const fn = migrations[v];
    if (fn) {
      current = fn(current);
    }
    current.schemaVersion = v;
  }

  return current;
}
