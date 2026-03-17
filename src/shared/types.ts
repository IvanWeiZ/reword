// src/shared/types.ts

// --- Storage types ---

export interface StoredData {
  schemaVersion: number;
  settings: Settings;
  relationshipProfiles: Record<string, RelationshipProfile>;
  stats: Stats;
}

export interface Settings {
  geminiApiKey: string;
  sensitivity: Sensitivity;
  enabledDomains: string[];
}

export type Sensitivity = 'low' | 'medium' | 'high';

export interface RelationshipProfile {
  type: RelationshipType;
  label: string;
}

export type RelationshipType = 'romantic' | 'workplace' | 'family';

export interface Stats {
  totalAnalyzed: number;
  totalFlagged: number;
  rewritesAccepted: number;
  monthlyApiCalls: number;
  monthlyApiCallsResetDate: string;
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
}

// --- Message passing between content script and service worker ---

export type MessageToBackground =
  | { type: 'analyze'; text: string; context: ThreadMessage[]; relationshipType: RelationshipType; sensitivity: Sensitivity }
  | { type: 'get-settings' }
  | { type: 'get-profile'; domain: string }
  | { type: 'increment-stat'; stat: keyof Stats };

export type MessageFromBackground =
  | { type: 'analysis-result'; result: AnalysisResult }
  | { type: 'analysis-error'; error: string }
  | { type: 'settings'; data: StoredData }
  | { type: 'profile'; profile: RelationshipProfile | null };
