import type { StoredData } from './types';

export const DEBOUNCE_MS = 2000;
export const MIN_MESSAGE_LENGTH = 10;
export const HEURISTIC_THRESHOLD = 0.3;
export const ONDEVICE_CONFIDENCE_THRESHOLD = 0.8;
export const API_TIMEOUT_MS = 5000;
export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_RECENT_FLAGS = 100;
export const DISMISS_SUPPRESS_THRESHOLD = 3;
export const INCOMING_CHECK_INTERVAL_MS = 5000;

export const DEFAULT_STORED_DATA: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  settings: {
    geminiApiKey: '',
    sensitivity: 'medium',
    enabledDomains: [],
    customPatterns: [],
    theme: 'auto',
    rewritePersonas: [],
    analyzeIncoming: false,
  },
  relationshipProfiles: {},
  stats: {
    totalAnalyzed: 0,
    totalFlagged: 0,
    rewritesAccepted: 0,
    monthlyApiCalls: 0,
    monthlyApiCallsResetDate: new Date().toISOString().slice(0, 10),
    recentFlags: [],
  },
  dismissedPatterns: [],
};
