import type { StoredData } from './types';

export const DEBOUNCE_MS = 800;
export const AI_DEBOUNCE_MS = 2000;
export const MIN_MESSAGE_LENGTH = 3;
export const HEURISTIC_THRESHOLD = 0.38;
export const ONDEVICE_CONFIDENCE_THRESHOLD = 0.8;
export const API_TIMEOUT_MS = 5000;
export const CURRENT_SCHEMA_VERSION = 5;
export const WEEKLY_SUMMARY_DISPLAY_MS = 8000;
export const MAX_RECENT_FLAGS = 100;
export const DISMISS_SUPPRESS_THRESHOLD = 3;
export const CATEGORY_BOOST_AMOUNT = 0.15;
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
    suppressedPhrases: [],
  },
  relationshipProfiles: {},
  stats: {
    totalAnalyzed: 0,
    totalFlagged: 0,
    rewritesAccepted: 0,
    monthlyApiCalls: 0,
    monthlyApiCallsResetDate: new Date().toISOString().slice(0, 10),
    recentFlags: [],
    dismissedCategories: {},
  },
  dismissedPatterns: [],
  weeklyStats: { weekStart: '', analyzed: 0, flagged: 0, rewritesAccepted: 0 },
  previousWeeklyStats: null,
  lastWeeklySummaryShown: '',
};
