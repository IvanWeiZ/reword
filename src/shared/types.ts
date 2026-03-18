// src/shared/types.ts

// --- Storage types ---

export interface WeeklyStats {
  weekStart: string;
  analyzed: number;
  flagged: number;
  rewritesAccepted: number;
}

export interface StoredData {
  schemaVersion: number;
  settings: Settings;
  relationshipProfiles: Record<string, RelationshipProfile>;
  stats: Stats;
  dismissedPatterns: DismissedPattern[];
  weeklyStats: WeeklyStats;
  previousWeeklyStats: WeeklyStats | null;
  lastWeeklySummaryShown: string;
}

export interface Settings {
  geminiApiKey: string;
  sensitivity: Sensitivity;
  enabledDomains: string[];
  customPatterns: string[];
  theme: Theme;
  rewritePersonas: RewritePersona[];
  analyzeIncoming: boolean;
  suppressedPhrases: string[];
}

export type Theme = 'auto' | 'light' | 'dark';
export type Sensitivity = 'low' | 'medium' | 'high';

export interface RewritePersona {
  label: string;
  instruction: string;
}

export interface RelationshipProfile {
  type: RelationshipType;
  label: string;
  sensitivity?: Sensitivity;
}

export type RelationshipType = 'romantic' | 'workplace' | 'family';

export interface Stats {
  totalAnalyzed: number;
  totalFlagged: number;
  rewritesAccepted: number;
  monthlyApiCalls: number;
  monthlyApiCallsResetDate: string;
  recentFlags: FlagEvent[];
  dismissedCategories: Record<string, number>;
}

export interface FlagEvent {
  date: string;
  platform: string;
  riskLevel: RiskLevel;
  issues: string[];
  textSnippet: string;
}

export interface DismissedPattern {
  normalized: string;
  count: number;
  suppressed: boolean;
}

// --- AI analysis types ---

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Rewrite {
  label: string;
  text: string;
}

export interface AnalysisResult {
  shouldFlag: boolean;
  riskLevel: RiskLevel;
  issues: string[];
  explanation: string;
  rewrites: Rewrite[];
}

export interface IncomingAnalysis {
  riskLevel: RiskLevel;
  issues: string[];
  interpretation: string;
}

// --- Thread context ---

export interface ThreadMessage {
  sender: 'self' | 'other';
  text: string;
}

// --- Adapter interface ---

export interface PlatformAdapter {
  /** CSS selector or method to find the active compose/input field */
  findInputField(): HTMLElement | null;

  /** Place the trigger icon near the send button. Returns cleanup function. */
  placeTriggerIcon(icon: HTMLElement): (() => void) | null;

  /** Write rewritten text back into the input field */
  writeBack(text: string): boolean;

  /** Scrape recent visible messages from the thread. Returns [] if not supported. */
  scrapeThreadContext(): ThreadMessage[];

  /** Check if expected DOM selectors are present. Logs warnings for missing elements. */
  checkHealth(): boolean;

  /** Get the platform name for telemetry/history. */
  platformName: string;

  /** Place an inline indicator next to an incoming message element. Returns cleanup. */
  placeIncomingIndicator?(messageEl: HTMLElement, indicator: HTMLElement): (() => void) | null;

  /** Find all visible incoming message elements (for two-way analysis). */
  getIncomingMessageElements?(): HTMLElement[];
}

// --- Message passing between content script and service worker ---

export type MessageToBackground =
  | {
      type: 'analyze';
      text: string;
      context: ThreadMessage[];
      relationshipType: RelationshipType;
      sensitivity: Sensitivity;
      personas?: RewritePersona[];
      recipientStyle?: string;
    }
  | { type: 'analyze-incoming'; text: string; context: ThreadMessage[] }
  | { type: 'get-settings' }
  | { type: 'get-profile'; domain: string }
  | { type: 'increment-stat'; stat: keyof Stats }
  | { type: 'validate-api-key'; apiKey: string }
  | { type: 'record-flag'; event: FlagEvent }
  | { type: 'record-dismiss'; textSnippet: string; categories?: string[] }
  | { type: 'check-suppressed'; textSnippet: string }
  | { type: 'suppress-phrase'; text: string }
  | { type: 'remove-suppressed-phrase'; text: string }
  | { type: 'get-category-boosts' }
  | { type: 'reset-learned-preferences' };

export type MessageFromBackground =
  | { type: 'analysis-result'; result: AnalysisResult }
  | { type: 'analysis-error'; error: string }
  | { type: 'settings'; data: StoredData }
  | { type: 'profile'; profile: RelationshipProfile | null }
  | { type: 'validate-api-key-result'; valid: boolean }
  | { type: 'incoming-result'; result: IncomingAnalysis }
  | { type: 'suppression-result'; suppressed: boolean }
  | { type: 'category-boosts'; boosts: Record<string, number> };
