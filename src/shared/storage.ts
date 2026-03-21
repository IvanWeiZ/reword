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
  2: (data) => {
    // v1 → v2: Add new settings fields, dismissedPatterns, recentFlags
    data.settings = {
      ...DEFAULT_STORED_DATA.settings,
      ...data.settings,
      customPatterns: data.settings.customPatterns ?? [],
      theme: data.settings.theme ?? 'auto',
      rewritePersonas: data.settings.rewritePersonas ?? [],
      analyzeIncoming: data.settings.analyzeIncoming ?? false,
    };
    data.stats = {
      ...data.stats,
      recentFlags: data.stats.recentFlags ?? [],
    };
    data.dismissedPatterns = data.dismissedPatterns ?? [];
    data.schemaVersion = 2;
    return data;
  },
  3: (data) => {
    // v2 → v3: Add suppressedPhrases to settings
    data.settings = {
      ...data.settings,
      suppressedPhrases: data.settings.suppressedPhrases ?? [],
    };
    data.schemaVersion = 3;
    return data;
  },
  4: (data) => {
    // v3 → v4: Add weekly stats tracking
    data.weeklyStats = data.weeklyStats ?? {
      weekStart: '',
      analyzed: 0,
      flagged: 0,
      rewritesAccepted: 0,
    };
    data.previousWeeklyStats = data.previousWeeklyStats ?? null;
    data.lastWeeklySummaryShown = data.lastWeeklySummaryShown ?? '';
    data.schemaVersion = 4;
    return data;
  },
  5: (data) => {
    // v4 → v5: Add dismissedCategories to stats for adaptive false positive reduction
    data.stats = {
      ...data.stats,
      dismissedCategories: data.stats.dismissedCategories ?? {},
    };
    data.schemaVersion = 5;
    return data;
  },
  6: (data) => {
    // v5 → v6: Migrate geminiApiKey to providerApiKeys, add aiProvider and preferredLanguage
    const oldKey = (data.settings as any).geminiApiKey ?? '';
    data.settings = {
      ...data.settings,
      aiProvider: 'gemini' as any,
      providerApiKeys: { gemini: oldKey },
      preferredLanguage: '',
    };
    delete (data.settings as any).geminiApiKey;
    (data as any).contactProfiles = (data as any).contactProfiles ?? {};
    data.schemaVersion = 6;
    return data;
  },
  7: (data) => {
    // v6 → v7: Convert suppressedPhrases from string[] to SuppressionRecord[]
    if (
      Array.isArray(data.settings?.suppressedPhrases) &&
      data.settings.suppressedPhrases.length > 0
    ) {
      if (typeof (data.settings.suppressedPhrases as any)[0] === 'string') {
        data.settings.suppressedPhrases = (data.settings.suppressedPhrases as any).map(
          (phrase: string) => ({
            phrase,
            recipientId: null, // Global suppression (legacy)
          }),
        );
      }
    }
    data.schemaVersion = 7;
    return data;
  },
};

export function migrate(data: StoredData): StoredData {
  // If data is from a future version (e.g. downgrade scenario), return as-is
  // to avoid corrupting data we don't understand
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ...data };
  }

  let current = { ...DEFAULT_STORED_DATA, ...data };

  // Apply each migration in order from stored version to current
  for (let v = current.schemaVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const fn = migrations[v];
    if (fn) {
      current = fn(current);
    }
    current.schemaVersion = v;
  }

  return current;
}
