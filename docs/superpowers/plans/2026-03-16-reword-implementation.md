# Reword Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that flags potentially problematic messages and suggests AI-powered rewrites across Gmail, LinkedIn, and Twitter.

**Architecture:** Manifest V3 Chrome extension with content scripts injecting per-platform adapters, a background service worker for AI orchestration, and a Shadow DOM popup card for the rewrite UI. Three-tier AI analysis: local heuristic filter → Chrome on-device AI (optional) → Gemini 2.5 Flash.

**Tech Stack:** TypeScript, Vite, Chrome Manifest V3, Shadow DOM, Gemini 2.5 Flash (`@google/generative-ai`), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-16-reword-design.md`

---

## File Map

```
reword/
  package.json                          — dependencies and scripts
  tsconfig.json                         — TypeScript config
  vite.config.ts                        — Vite build config for Chrome extension
  manifest.json                         — Manifest V3 config
  src/
    shared/
      types.ts                          — all shared types (StoredData, AnalysisResult, RelationshipProfile, AdapterInterface, etc.)
      constants.ts                      — thresholds, debounce timing, defaults
      storage.ts                        — Chrome Storage API wrapper with schema versioning and migration
    background/
      service-worker.ts                 — message routing between content scripts and AI tiers
      gemini-client.ts                  — Gemini 2.5 Flash API wrapper with context caching and streaming
      ondevice-client.ts                — Chrome on-device Prompt API wrapper with availability detection
    content/
      index.ts                          — content script entry point, platform detection, adapter loading
      heuristic-scorer.ts               — Tier 0 keyword/pattern scorer
      observer.ts                       — input field monitoring with debounce and generation counter
      trigger.ts                        — trigger icon component (renders near send button)
      popup-card.ts                     — Shadow DOM popup card with rewrite options
      popup-card.css                    — popup card styles (adopted stylesheet for Shadow DOM)
    adapters/
      base.ts                           — AdapterInterface + GenericFallbackAdapter
      gmail.ts                          — Gmail compose adapter
      linkedin.ts                       — LinkedIn messaging adapter
      twitter.ts                        — Twitter/X DM adapter
    options/
      options.html                      — settings page HTML
      options.ts                        — settings page logic
      options.css                       — settings page styles
  assets/
    icons/
      icon-16.png
      icon-48.png
      icon-128.png
  tests/
    shared/
      storage.test.ts                   — storage wrapper and migration tests
    content/
      heuristic-scorer.test.ts          — heuristic scorer tests
      observer.test.ts                  — observer debounce and generation counter tests
      trigger.test.ts                   — trigger icon rendering tests
      popup-card.test.ts                — popup card rendering and interaction tests
    background/
      gemini-client.test.ts             — Gemini client prompt construction and response parsing
      service-worker.test.ts            — message routing and tier orchestration tests
    adapters/
      gmail.test.ts                     — Gmail adapter tests
      linkedin.test.ts                  — LinkedIn adapter tests
      twitter.test.ts                   — Twitter adapter tests
    mocks/
      mock-gemini-client.ts             — canned Gemini responses for testing
      mock-chrome-storage.ts            — Chrome Storage API mock
      mock-dom-fixtures/
        gmail-compose.html              — Gmail compose DOM fixture
        linkedin-message.html           — LinkedIn messaging DOM fixture
        twitter-dm.html                 — Twitter DM DOM fixture
    e2e/
      extension-load.test.ts            — Playwright E2E: extension loads and injects
      gmail-flow.test.ts                — Playwright E2E: full flag-and-rewrite flow on Gmail fixture
```

---

## Chunk 1: Project Scaffolding and Shared Types

### [ ] Task 1: Initialize Project

**Files:**
- Create: `reword/package.json`
- Create: `reword/tsconfig.json`
- Create: `reword/vite.config.ts`
- Create: `reword/manifest.json`

- [ ] **Step 1: Create project directory and initialize package.json**

```bash
mkdir -p reword && cd reword
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @google/generative-ai
npm install -D typescript vite vitest @vitest/browser playwright @types/chrome jsdom @vitest/coverage-v8
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content': resolve(__dirname, 'src/content/index.ts'),
        'options': resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        dir: 'dist',
        // Manifest V3 does not support dynamic imports or code splitting
        inlineDynamicImports: false,
        manualChunks: undefined,
      },
    },
    target: 'ES2022',
    minify: false,
    sourcemap: true,
  },
  plugins: [
    // Copy static assets to dist
    {
      name: 'copy-manifest-and-html',
      writeBundle() {
        const fs = require('fs');
        const path = require('path');
        // Copy manifest.json
        fs.copyFileSync('manifest.json', path.join('dist', 'manifest.json'));
        // Copy options HTML
        fs.mkdirSync(path.join('dist', 'options'), { recursive: true });
        fs.copyFileSync('src/options/options.html', path.join('dist', 'options', 'options.html'));
        fs.copyFileSync('src/options/options.css', path.join('dist', 'options', 'options.css'));
        // Copy icons
        fs.cpSync('assets', path.join('dist', 'assets'), { recursive: true });
      },
    },
  ],
});
```

- [ ] **Step 5: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Reword",
  "version": "0.1.0",
  "description": "Flag problematic messages and suggest kinder rewrites before you send them.",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://www.linkedin.com/*",
    "https://x.com/*",
    "https://twitter.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://mail.google.com/*",
        "https://www.linkedin.com/*",
        "https://x.com/*",
        "https://twitter.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options/options.html",
  "icons": {
    "16": "assets/icons/icon-16.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

- [ ] **Step 6: Create placeholder icon files**

```bash
mkdir -p assets/icons
# Create minimal placeholder PNGs (replace with real icons later)
convert -size 16x16 xc:#6366f1 assets/icons/icon-16.png 2>/dev/null || touch assets/icons/icon-16.png
convert -size 48x48 xc:#6366f1 assets/icons/icon-48.png 2>/dev/null || touch assets/icons/icon-48.png
convert -size 128x128 xc:#6366f1 assets/icons/icon-128.png 2>/dev/null || touch assets/icons/icon-128.png
```

- [ ] **Step 7: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    css: true,
  },
});
```

- [ ] **Step 8: Add scripts to package.json**

Update `scripts` in `package.json`:
```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 9: Commit**

```bash
git init
echo "node_modules/\ndist/\ncoverage/" > .gitignore
git add .
git commit -m "chore: scaffold Reword Chrome extension project"
```

---

### [ ] Task 2: Shared Types

**Files:**
- Create: `reword/src/shared/types.ts`

- [ ] **Step 1: Write types file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared types for storage, AI analysis, adapters, and messaging"
```

---

### [ ] Task 3: Constants

**Files:**
- Create: `reword/src/shared/constants.ts`

- [ ] **Step 1: Write constants file**

```typescript
import type { StoredData } from './types';

export const DEBOUNCE_MS = 2000;
export const MIN_MESSAGE_LENGTH = 10;
export const HEURISTIC_THRESHOLD = 0.3;
export const ONDEVICE_CONFIDENCE_THRESHOLD = 0.8;
export const API_TIMEOUT_MS = 5000;
export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_STORED_DATA: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  settings: {
    geminiApiKey: '',
    sensitivity: 'medium',
    enabledDomains: [],
  },
  relationshipProfiles: {},
  stats: {
    totalAnalyzed: 0,
    totalFlagged: 0,
    rewritesAccepted: 0,
    monthlyApiCalls: 0,
    monthlyApiCallsResetDate: new Date().toISOString().slice(0, 10),
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add constants and default stored data"
```

---

### [ ] Task 4: Storage Wrapper with Schema Versioning

**Files:**
- Create: `reword/src/shared/storage.ts`
- Create: `reword/tests/shared/storage.test.ts`
- Create: `reword/tests/mocks/mock-chrome-storage.ts`

- [ ] **Step 1: Write Chrome Storage mock**

```typescript
// tests/mocks/mock-chrome-storage.ts

type StorageData = Record<string, unknown>;

export function createMockChromeStorage() {
  let store: StorageData = {};

  return {
    local: {
      get: async (keys?: string | string[] | null): Promise<StorageData> => {
        if (!keys) return { ...store };
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const result: StorageData = {};
        for (const k of keyList) {
          if (k in store) result[k] = store[k];
        }
        return result;
      },
      set: async (items: StorageData): Promise<void> => {
        Object.assign(store, items);
      },
      clear: async (): Promise<void> => {
        store = {};
      },
    },
    _getStore: () => store,
    _setStore: (data: StorageData) => { store = data; },
  };
}
```

- [ ] **Step 2: Write failing storage tests**

```typescript
// tests/shared/storage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { loadStoredData, saveStoredData } from '../../src/shared/storage';
import { DEFAULT_STORED_DATA, CURRENT_SCHEMA_VERSION } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = { storage: mockStorage };
});

describe('loadStoredData', () => {
  it('returns defaults when storage is empty', async () => {
    const data = await loadStoredData();
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.settings.sensitivity).toBe('medium');
  });

  it('returns saved data when present', async () => {
    const custom = { ...DEFAULT_STORED_DATA, settings: { ...DEFAULT_STORED_DATA.settings, sensitivity: 'high' as const } };
    await mockStorage.local.set({ reword: custom });
    const data = await loadStoredData();
    expect(data.settings.sensitivity).toBe('high');
  });
});

describe('saveStoredData', () => {
  it('persists data to chrome storage', async () => {
    const custom = { ...DEFAULT_STORED_DATA, settings: { ...DEFAULT_STORED_DATA.settings, sensitivity: 'low' as const } };
    await saveStoredData(custom);
    const raw = await mockStorage.local.get('reword');
    expect((raw.reword as any).settings.sensitivity).toBe('low');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/shared/storage.test.ts
```

Expected: FAIL — `loadStoredData` and `saveStoredData` not found.

- [ ] **Step 4: Write storage implementation**

```typescript
// src/shared/storage.ts
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
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
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
  // Sequential migrations: v0→v1, v1→v2, etc.
  // Currently only v1 exists, so no migrations needed yet.
  // Future migrations go here as: if (data.schemaVersion < 2) { ... data.schemaVersion = 2; }
  return { ...DEFAULT_STORED_DATA, ...data, schemaVersion: CURRENT_SCHEMA_VERSION };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/shared/storage.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage.ts tests/shared/storage.test.ts tests/mocks/mock-chrome-storage.ts
git commit -m "feat: add storage wrapper with schema versioning and migration"
```

---

## Chunk 2: Tier 0 Heuristic Scorer

### [ ] Task 5: Heuristic Scorer

**Files:**
- Create: `reword/src/content/heuristic-scorer.ts`
- Create: `reword/tests/content/heuristic-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/content/heuristic-scorer.test.ts
import { describe, it, expect } from 'vitest';
import { scoreMessage } from '../../src/content/heuristic-scorer';

describe('scoreMessage', () => {
  it('scores short affirmative messages as clean', () => {
    expect(scoreMessage('ok')).toBeLessThan(0.3);
    expect(scoreMessage('sounds good')).toBeLessThan(0.3);
    expect(scoreMessage('thanks!')).toBeLessThan(0.3);
  });

  it('scores factual/logistical messages as clean', () => {
    expect(scoreMessage('meeting at 3')).toBeLessThan(0.3);
    expect(scoreMessage('see the attached file')).toBeLessThan(0.3);
  });

  it('flags passive-aggressive patterns', () => {
    expect(scoreMessage('fine.')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('whatever')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('per my last email')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('as I already mentioned')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags ALL CAPS as potentially aggressive', () => {
    expect(scoreMessage('I TOLD YOU THIS ALREADY')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags excessive punctuation', () => {
    expect(scoreMessage('are you serious??!!')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags dismissive language', () => {
    expect(scoreMessage('not like I had plans or anything')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('I guess that works')).toBeGreaterThanOrEqual(0.3);
  });

  it('scores warm, clear messages as clean', () => {
    expect(scoreMessage('I really appreciate your help with this project')).toBeLessThan(0.3);
    expect(scoreMessage('That sounds like a great idea, let me know how I can help')).toBeLessThan(0.3);
  });

  it('returns a number between 0 and 1', () => {
    const score = scoreMessage('whatever, I guess that works. Not like I had plans or anything!!!');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/content/heuristic-scorer.test.ts
```

Expected: FAIL — `scoreMessage` not found.

- [ ] **Step 3: Write heuristic scorer implementation**

```typescript
// src/content/heuristic-scorer.ts

const PASSIVE_AGGRESSIVE_PATTERNS = [
  /\bfine\.\s*$/i,
  /\bwhatever\b/i,
  /\bper my last email\b/i,
  /\bas I already mentioned\b/i,
  /\bas previously stated\b/i,
  /\bnot like I\b.*\bor anything\b/i,
  /\bI guess\b.*\b(works|fine|so|whatever)\b/i,
  /\bthanks for nothing\b/i,
  /\bno worries\b.*\bI'll just\b/i,
  /\bmust be nice\b/i,
  /\bgood for you\b/i,
];

const NEGATIVE_KEYWORDS = [
  'stupid', 'idiot', 'hate', 'annoying', 'useless',
  'pathetic', 'ridiculous', 'disgusting', 'terrible', 'awful',
  'never mind', 'forget it', 'don\'t bother',
];

/**
 * Scores a message from 0 (clean) to 1 (very problematic).
 * Runs synchronously in < 5ms.
 */
export function scoreMessage(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  let score = 0;
  const lower = text.toLowerCase();

  // Check passive-aggressive patterns (high signal)
  for (const pattern of PASSIVE_AGGRESSIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.25;
    }
  }

  // Check negative keywords
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 0.2;
    }
  }

  // ALL CAPS detection (exclude short words, check if >50% of alpha chars are uppercase)
  const alphaChars = text.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 10) {
    const upperRatio = (text.replace(/[^A-Z]/g, '').length) / alphaChars.length;
    if (upperRatio > 0.5) {
      score += 0.3;
    }
  }

  // Excessive punctuation (!! or ?? or ?!)
  const excessivePunctuation = text.match(/[!?]{2,}/g);
  if (excessivePunctuation) {
    score += 0.15 * excessivePunctuation.length;
  }

  // Clamp between 0 and 1
  return Math.min(1, Math.max(0, score));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/content/heuristic-scorer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/heuristic-scorer.ts tests/content/heuristic-scorer.test.ts
git commit -m "feat: add Tier 0 heuristic scorer for local tone detection"
```

---

## Chunk 3: Gemini Client and Prompts

### [ ] Task 6: Gemini Prompt Templates

**Files:**
- Create: `reword/src/shared/prompts.ts`

- [ ] **Step 1: Write prompt templates**

```typescript
// src/shared/prompts.ts
import type { RelationshipType, Sensitivity, ThreadMessage } from './types';

const RELATIONSHIP_INSTRUCTIONS: Record<RelationshipType, string> = {
  romantic: `You are analyzing a message in a romantic relationship context.
Flag: sarcasm, emotional dismissal, bringing up past arguments, passive-aggression, coldness.
Rewrites should add empathy, validation, and warmth while preserving the sender's actual point.`,

  workplace: `You are analyzing a message in a professional workplace context.
Flag: passive-aggression, overly casual tone to superiors, unclear requests, blame-shifting, condescension.
Rewrites should professionalize tone, clarify intent, and maintain respect while preserving the sender's actual point.`,

  family: `You are analyzing a message in a family relationship context.
Flag: guilt-tripping, generational tension patterns, dismissiveness, controlling language, emotional manipulation.
Rewrites should de-escalate, validate feelings, and set boundaries kindly while preserving the sender's actual point.`,
};

const SENSITIVITY_INSTRUCTIONS: Record<Sensitivity, string> = {
  low: 'Only flag messages that are clearly hostile, insulting, or very likely to cause a fight. Borderline cases should pass.',
  medium: 'Flag messages that could reasonably be misread or that contain subtle negative tone. Use your best judgment.',
  high: 'Flag anything that could possibly be taken the wrong way, even if the intent seems harmless. Better safe than sorry.',
};

export function buildAnalysisPrompt(
  message: string,
  relationshipType: RelationshipType,
  sensitivity: Sensitivity,
  threadContext: ThreadMessage[],
): string {
  const contextBlock = threadContext.length > 0
    ? `\n\nRecent conversation for context:\n${threadContext.map(m => `[${m.sender}]: ${m.text}`).join('\n')}`
    : '';

  return `You are Reword, an AI that helps people communicate better. Analyze the following draft message and decide if it should be flagged for tone issues.

${RELATIONSHIP_INSTRUCTIONS[relationshipType]}

Sensitivity: ${SENSITIVITY_INSTRUCTIONS[sensitivity]}

Rules:
- Do NOT flag short affirmative messages (ok, sounds good, thanks, etc.)
- Do NOT flag factual/logistical messages (meeting at 3, see attached, etc.)
- Do NOT flag messages that are already warm and clear
- If you flag a message, provide exactly 3 rewrites at different intensity levels
${contextBlock}

Draft message to analyze:
"${message}"

Respond with ONLY valid JSON in this exact format:
{
  "should_flag": true/false,
  "risk_level": "low" | "medium" | "high",
  "issues": ["issue1", "issue2"],
  "explanation": "One sentence explaining why this was flagged",
  "rewrites": [
    {"label": "Warmer", "text": "..."},
    {"label": "Direct but kind", "text": "..."},
    {"label": "Minimal change", "text": "..."}
  ]
}

If should_flag is false, set risk_level to "low", issues to [], explanation to "", and rewrites to [].`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/prompts.ts
git commit -m "feat: add Gemini prompt templates with relationship-specific instructions"
```

---

### [ ] Task 7: Gemini Client

**Files:**
- Create: `reword/src/background/gemini-client.ts`
- Create: `reword/tests/mocks/mock-gemini-client.ts`
- Create: `reword/tests/background/gemini-client.test.ts`

- [ ] **Step 1: Write mock Gemini client**

```typescript
// tests/mocks/mock-gemini-client.ts
import type { AnalysisResult } from '../../src/shared/types';

export const MOCK_FLAGGED_RESULT: AnalysisResult = {
  shouldFlag: true,
  riskLevel: 'medium',
  issues: ['passive-aggressive tone', 'dismissive'],
  explanation: 'This might come across as dismissive of their feelings',
  rewrites: [
    { label: 'Warmer', text: 'That works for me! I was looking forward to our original plan though — can we reschedule?' },
    { label: 'Direct but kind', text: 'Honestly I\'m a little disappointed, but I understand. Let\'s find another time.' },
    { label: 'Minimal change', text: 'That works, though I had plans. Can we find another time?' },
  ],
};

export const MOCK_CLEAN_RESULT: AnalysisResult = {
  shouldFlag: false,
  riskLevel: 'low',
  issues: [],
  explanation: '',
  rewrites: [],
};
```

- [ ] **Step 2: Write failing Gemini client tests**

```typescript
// tests/background/gemini-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClient, parseAnalysisResponse } from '../../src/background/gemini-client';
import { MOCK_FLAGGED_RESULT } from '../mocks/mock-gemini-client';

describe('parseAnalysisResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      should_flag: true,
      risk_level: 'medium',
      issues: ['passive-aggressive tone'],
      explanation: 'This is dismissive',
      rewrites: [
        { label: 'Warmer', text: 'Better version' },
        { label: 'Direct but kind', text: 'Another version' },
        { label: 'Minimal change', text: 'Slight tweak' },
      ],
    });
    const result = parseAnalysisResponse(json);
    expect(result.shouldFlag).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.rewrites).toHaveLength(3);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const json = '```json\n{"should_flag": false, "risk_level": "low", "issues": [], "explanation": "", "rewrites": []}\n```';
    const result = parseAnalysisResponse(json);
    expect(result.shouldFlag).toBe(false);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseAnalysisResponse('not json')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => parseAnalysisResponse('{"should_flag": true}')).toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/background/gemini-client.test.ts
```

Expected: FAIL — `parseAnalysisResponse` not found.

- [ ] **Step 4: Write Gemini client implementation**

```typescript
// src/background/gemini-client.ts
import { GoogleGenerativeAI, type CachedContent } from '@google/generative-ai';
import type { AnalysisResult, RelationshipType, Sensitivity, ThreadMessage } from '../shared/types';
import { buildAnalysisPrompt } from '../shared/prompts';

export type StreamCallback = (partialText: string) => void;

export class GeminiClient {
  private client: GoogleGenerativeAI | null = null;
  private apiKey: string = '';
  private cachedSystemPrompts: Map<string, CachedContent> = new Map();

  configure(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  isConfigured(): boolean {
    return this.client !== null && this.apiKey.length > 0;
  }

  async analyzeStreaming(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    onStream: StreamCallback,
    signal?: AbortSignal,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('Gemini client not configured');

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildAnalysisPrompt(message, relationshipType, sensitivity, threadContext);

    const streamResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let fullText = '';
    for await (const chunk of streamResult.stream) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunkText = chunk.text();
      fullText += chunkText;
      onStream(fullText);
    }

    return parseAnalysisResponse(fullText);
  }

  /** Non-streaming analyze for backward compat and testing */
  async analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    signal?: AbortSignal,
  ): Promise<AnalysisResult> {
    return this.analyzeStreaming(message, relationshipType, sensitivity, threadContext, () => {}, signal);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new GoogleGenerativeAI(apiKey);
      const model = testClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('Say "ok"');
      return true;
    } catch {
      return false;
    }
  }
}

export function parseAnalysisResponse(text: string): AnalysisResult {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${cleaned.slice(0, 100)}`);
  }

  // Validate required fields
  if (typeof parsed.should_flag !== 'boolean') {
    throw new Error('Missing or invalid "should_flag" in response');
  }
  if (!['low', 'medium', 'high'].includes(parsed.risk_level as string)) {
    throw new Error('Missing or invalid "risk_level" in response');
  }
  if (!Array.isArray(parsed.issues)) {
    throw new Error('Missing or invalid "issues" in response');
  }
  if (typeof parsed.explanation !== 'string') {
    throw new Error('Missing or invalid "explanation" in response');
  }
  if (!Array.isArray(parsed.rewrites)) {
    throw new Error('Missing or invalid "rewrites" in response');
  }

  return {
    shouldFlag: parsed.should_flag as boolean,
    riskLevel: parsed.risk_level as AnalysisResult['riskLevel'],
    issues: parsed.issues as string[],
    explanation: parsed.explanation as string,
    rewrites: (parsed.rewrites as Array<{ label: string; text: string }>).map(r => ({
      label: r.label,
      text: r.text,
    })),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/background/gemini-client.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/background/gemini-client.ts src/shared/prompts.ts tests/background/gemini-client.test.ts tests/mocks/mock-gemini-client.ts
git commit -m "feat: add Gemini client with prompt construction and response parsing"
```

---

## Chunk 4: Platform Adapters

### [ ] Task 8: Adapter Interface and Generic Fallback

**Files:**
- Create: `reword/src/adapters/base.ts`

- [ ] **Step 1: Write adapter base with interface re-export and fallback**

```typescript
// src/adapters/base.ts
import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export type { PlatformAdapter };

export class GenericFallbackAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    // Find contentEditable elements or textareas that are visible
    const editables = document.querySelectorAll<HTMLElement>(
      '[contenteditable="true"], textarea'
    );
    // Return the largest visible one (most likely the compose area)
    let best: HTMLElement | null = null;
    let bestArea = 0;
    for (const el of editables) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const input = this.findInputField();
    if (!input) return null;
    // Place icon after the input field's parent
    const parent = input.parentElement;
    if (!parent) return null;
    parent.style.position = 'relative';
    icon.style.position = 'absolute';
    icon.style.bottom = '8px';
    icon.style.right = '8px';
    icon.style.zIndex = '10000';
    parent.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    if (input instanceof HTMLTextAreaElement) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (input.isContentEditable) {
      input.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
      return true;
    }
    return false;
  }

  scrapeThreadContext(): ThreadMessage[] {
    // Generic fallback cannot reliably scrape thread context
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/base.ts
git commit -m "feat: add adapter interface and generic fallback adapter"
```

---

### [ ] Task 9: Gmail Adapter

**Files:**
- Create: `reword/src/adapters/gmail.ts`
- Create: `reword/tests/mocks/mock-dom-fixtures/gmail-compose.html`
- Create: `reword/tests/adapters/gmail.test.ts`

- [ ] **Step 1: Create Gmail DOM fixture**

```html
<!-- tests/mocks/mock-dom-fixtures/gmail-compose.html -->
<div class="nH">
  <div class="iN">
    <div class="Am" role="textbox" contenteditable="true" aria-label="Message Body" g_editable="true">
      Whatever, I guess that works.
    </div>
  </div>
  <div class="btC">
    <div class="dC">
      <div role="button" class="T-I J-J5-Ji aoO v7 T-I-atl L3" data-tooltip="Send">Send</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Write failing Gmail adapter tests**

```typescript
// tests/adapters/gmail.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GmailAdapter } from '../../src/adapters/gmail';

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    const html = readFileSync(resolve(__dirname, '../mocks/mock-dom-fixtures/gmail-compose.html'), 'utf-8');
    document.body.innerHTML = html;
    adapter = new GmailAdapter();
  });

  it('finds the Gmail compose input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
    cleanup?.();
    expect(document.getElementById('reword-trigger')).toBeNull();
  });

  it('writes text back to the compose field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    // Note: execCommand may not work in jsdom, testing the method doesn't throw
    const result = adapter.writeBack('Hello, this is a nicer message');
    expect(typeof result).toBe('boolean');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/adapters/gmail.test.ts
```

Expected: FAIL — `GmailAdapter` not found.

- [ ] **Step 4: Write Gmail adapter**

```typescript
// src/adapters/gmail.ts
import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export class GmailAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    // Gmail compose uses contentEditable div with role="textbox" and g_editable="true"
    return document.querySelector<HTMLElement>(
      'div[role="textbox"][g_editable="true"]'
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    // Find the send button row (.btC contains the send button area)
    const sendButtonRow = document.querySelector('.btC .dC');
    if (!sendButtonRow) return null;

    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginLeft = '8px';
    sendButtonRow.appendChild(icon);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    input.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    return true;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    // Gmail conversation messages are in .a3s.aiL divs
    const messageEls = document.querySelectorAll('.a3s.aiL');
    for (const el of messageEls) {
      const text = el.textContent?.trim();
      if (!text) continue;
      // Check if sent by self — Gmail marks sent messages with a "from me" indicator
      const container = el.closest('.adn');
      const senderEl = container?.querySelector('.gD');
      const senderEmail = senderEl?.getAttribute('email') ?? '';
      // Gmail shows the user's own email on their sent messages
      // We check for the "Me" name attribute as a heuristic
      const senderName = senderEl?.getAttribute('name') ?? '';
      const sender = (senderName === 'Me' || senderName === 'me') ? 'self' as const : 'other' as const;
      messages.push({ sender, text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/adapters/gmail.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/gmail.ts tests/adapters/gmail.test.ts tests/mocks/mock-dom-fixtures/gmail-compose.html
git commit -m "feat: add Gmail platform adapter"
```

---

### [ ] Task 10: LinkedIn Adapter

**Files:**
- Create: `reword/src/adapters/linkedin.ts`
- Create: `reword/tests/mocks/mock-dom-fixtures/linkedin-message.html`
- Create: `reword/tests/adapters/linkedin.test.ts`

- [ ] **Step 1: Create LinkedIn DOM fixture**

```html
<!-- tests/mocks/mock-dom-fixtures/linkedin-message.html -->
<div class="msg-form">
  <div class="msg-form__contenteditable">
    <div role="textbox" contenteditable="true" class="msg-form__msg-content-container--scrollable">
      <p>I guess that works</p>
    </div>
  </div>
  <div class="msg-form__right-actions">
    <button class="msg-form__send-button" type="submit">Send</button>
  </div>
</div>
```

- [ ] **Step 2: Write failing LinkedIn adapter tests**

```typescript
// tests/adapters/linkedin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LinkedInAdapter } from '../../src/adapters/linkedin';

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    const html = readFileSync(resolve(__dirname, '../mocks/mock-dom-fixtures/linkedin-message.html'), 'utf-8');
    document.body.innerHTML = html;
    adapter = new LinkedInAdapter();
  });

  it('finds the LinkedIn message input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('role')).toBe('textbox');
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/adapters/linkedin.test.ts
```

Expected: FAIL

- [ ] **Step 4: Write LinkedIn adapter**

```typescript
// src/adapters/linkedin.ts
import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export class LinkedInAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '.msg-form__msg-content-container--scrollable[role="textbox"]'
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const actionsRow = document.querySelector('.msg-form__right-actions');
    if (!actionsRow) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '8px';
    actionsRow.insertBefore(icon, actionsRow.firstChild);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    input.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    return true;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('.msg-s-event-listitem');
    for (const el of messageEls) {
      const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim();
      if (!text) continue;
      const isSelf = el.classList.contains('msg-s-event-listitem--other') ? 'other' : 'self';
      messages.push({ sender: isSelf as 'self' | 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/adapters/linkedin.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/linkedin.ts tests/adapters/linkedin.test.ts tests/mocks/mock-dom-fixtures/linkedin-message.html
git commit -m "feat: add LinkedIn platform adapter"
```

---

### [ ] Task 11: Twitter Adapter

**Files:**
- Create: `reword/src/adapters/twitter.ts`
- Create: `reword/tests/mocks/mock-dom-fixtures/twitter-dm.html`
- Create: `reword/tests/adapters/twitter.test.ts`

- [ ] **Step 1: Create Twitter DOM fixture**

```html
<!-- tests/mocks/mock-dom-fixtures/twitter-dm.html -->
<div data-testid="DmActivityViewport">
  <div data-testid="messageEntry">
    <div data-testid="dmComposerTextInput" role="textbox" contenteditable="true">
      <div data-contents="true">
        <div><span data-text="true">Whatever</span></div>
      </div>
    </div>
  </div>
  <div data-testid="dmComposerSendButton" role="button" tabindex="0">
    <span>Send</span>
  </div>
</div>
```

- [ ] **Step 2: Write failing Twitter adapter tests**

```typescript
// tests/adapters/twitter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TwitterAdapter } from '../../src/adapters/twitter';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    const html = readFileSync(resolve(__dirname, '../mocks/mock-dom-fixtures/twitter-dm.html'), 'utf-8');
    document.body.innerHTML = html;
    adapter = new TwitterAdapter();
  });

  it('finds the Twitter DM input field', () => {
    const field = adapter.findInputField();
    expect(field).not.toBeNull();
    expect(field?.getAttribute('data-testid')).toBe('dmComposerTextInput');
  });

  it('places trigger icon near send button', () => {
    const icon = document.createElement('div');
    icon.id = 'reword-trigger';
    const cleanup = adapter.placeTriggerIcon(icon);
    expect(cleanup).not.toBeNull();
    expect(document.getElementById('reword-trigger')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/adapters/twitter.test.ts
```

Expected: FAIL

- [ ] **Step 4: Write Twitter adapter**

```typescript
// src/adapters/twitter.ts
import type { PlatformAdapter, ThreadMessage } from '../shared/types';

export class TwitterAdapter implements PlatformAdapter {
  findInputField(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '[data-testid="dmComposerTextInput"]'
    );
  }

  placeTriggerIcon(icon: HTMLElement): (() => void) | null {
    const sendButton = document.querySelector('[data-testid="dmComposerSendButton"]');
    if (!sendButton?.parentElement) return null;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.marginRight = '8px';
    sendButton.parentElement.insertBefore(icon, sendButton);
    return () => icon.remove();
  }

  writeBack(text: string): boolean {
    const input = this.findInputField();
    if (!input) return false;
    input.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    return true;
  }

  scrapeThreadContext(): ThreadMessage[] {
    const messages: ThreadMessage[] = [];
    const messageEls = document.querySelectorAll('[data-testid="messageEntry"]');
    for (const el of messageEls) {
      const text = el.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
      if (!text) continue;
      // Twitter DMs don't easily distinguish self vs other in DOM; return as 'other' by default
      messages.push({ sender: 'other', text: text.slice(0, 500) });
    }
    return messages.slice(-10);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/adapters/twitter.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/twitter.ts tests/adapters/twitter.test.ts tests/mocks/mock-dom-fixtures/twitter-dm.html
git commit -m "feat: add Twitter/X DM platform adapter"
```

---

## Chunk 5: Content Script (Observer, Trigger, Popup Card)

### [ ] Task 12: Input Observer with Debounce

**Files:**
- Create: `reword/src/content/observer.ts`
- Create: `reword/tests/content/observer.test.ts`

- [ ] **Step 1: Write failing observer tests**

```typescript
// tests/content/observer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputObserver } from '../../src/content/observer';

describe('InputObserver', () => {
  let observer: InputObserver;
  let onAnalyze: ReturnType<typeof vi.fn>;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    vi.useFakeTimers();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    onAnalyze = vi.fn();
    observer = new InputObserver({ debounceMs: 2000, minLength: 10, onAnalyze });
  });

  afterEach(() => {
    observer.disconnect();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not fire for short messages', () => {
    observer.observe(textarea);
    textarea.value = 'hi';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(3000);
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('fires after debounce for long messages', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message that should be analyzed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(2000);
    expect(onAnalyze).toHaveBeenCalledWith('This is a longer message that should be analyzed');
  });

  it('resets debounce on continued typing', () => {
    observer.observe(textarea);
    textarea.value = 'This is a longer message';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    textarea.value = 'This is a longer message that changed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(onAnalyze).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('increments generation on each input change', () => {
    observer.observe(textarea);
    expect(observer.generation).toBe(0);
    textarea.value = 'Some text here that is long enough';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(observer.generation).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/content/observer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write observer implementation**

```typescript
// src/content/observer.ts

interface ObserverOptions {
  debounceMs: number;
  minLength: number;
  onAnalyze: (text: string) => void;
}

export class InputObserver {
  private options: ObserverOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private element: HTMLElement | null = null;
  private handler: ((e: Event) => void) | null = null;
  generation = 0;

  constructor(options: ObserverOptions) {
    this.options = options;
  }

  observe(element: HTMLElement): void {
    this.disconnect();
    this.element = element;

    this.handler = () => {
      this.generation++;
      if (this.timer) clearTimeout(this.timer);

      this.timer = setTimeout(() => {
        const text = this.getText();
        if (text.length < this.options.minLength) return;
        this.options.onAnalyze(text);
      }, this.options.debounceMs);
    };

    element.addEventListener('input', this.handler);
  }

  disconnect(): void {
    if (this.element && this.handler) {
      this.element.removeEventListener('input', this.handler);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.element = null;
    this.handler = null;
  }

  getText(): string {
    if (!this.element) return '';
    if (this.element instanceof HTMLTextAreaElement || this.element instanceof HTMLInputElement) {
      return this.element.value;
    }
    return this.element.textContent?.trim() ?? '';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/content/observer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/observer.ts tests/content/observer.test.ts
git commit -m "feat: add input observer with debounce and generation counter"
```

---

### [ ] Task 13: Trigger Icon Component

**Files:**
- Create: `reword/src/content/trigger.ts`
- Create: `reword/tests/content/trigger.test.ts`

- [ ] **Step 1: Write failing trigger tests**

```typescript
// tests/content/trigger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerIcon } from '../../src/content/trigger';

describe('TriggerIcon', () => {
  let trigger: TriggerIcon;
  let onClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onClick = vi.fn();
    trigger = new TriggerIcon(onClick);
  });

  it('creates an element with shadow DOM', () => {
    expect(trigger.element).toBeInstanceOf(HTMLElement);
    expect(trigger.element.shadowRoot).not.toBeNull();
  });

  it('shows with correct risk level styling', () => {
    trigger.show('medium');
    expect(trigger.element.style.display).not.toBe('none');
  });

  it('hides the trigger', () => {
    trigger.show('medium');
    trigger.hide();
    expect(trigger.element.style.display).toBe('none');
  });

  it('calls onClick when clicked', () => {
    trigger.show('medium');
    trigger.element.shadowRoot?.querySelector('button')?.click();
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/content/trigger.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write trigger icon implementation**

```typescript
// src/content/trigger.ts
import type { RiskLevel } from '../shared/types';

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string }> = {
  low: { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' },
  medium: { bg: '#fff3e0', border: '#f0a030', text: '#e65100' },
  high: { bg: '#ffebee', border: '#ef5350', text: '#c62828' },
};

export class TriggerIcon {
  element: HTMLElement;
  private button: HTMLButtonElement;
  private shadow: ShadowRoot;

  constructor(onClick: () => void) {
    this.element = document.createElement('reword-trigger');
    this.element.style.display = 'none';
    this.shadow = this.element.attachShadow({ mode: 'open' });

    const style = new CSSStyleSheet();
    style.replaceSync(`
      button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        font-family: system-ui, sans-serif;
        cursor: pointer;
        border: 1px solid;
        transition: opacity 0.15s;
      }
      button:hover { opacity: 0.85; }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
    `);
    this.shadow.adoptedStyleSheets = [style];

    this.button = document.createElement('button');
    this.button.innerHTML = '<span class="dot"></span><span class="label">Review tone</span>';
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    this.shadow.appendChild(this.button);
  }

  show(riskLevel: RiskLevel): void {
    const colors = RISK_COLORS[riskLevel];
    this.button.style.backgroundColor = colors.bg;
    this.button.style.borderColor = colors.border;
    this.button.style.color = colors.text;
    const dot = this.shadow.querySelector<HTMLElement>('.dot');
    if (dot) dot.style.backgroundColor = colors.border;
    this.element.style.display = '';
  }

  hide(): void {
    this.element.style.display = 'none';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/content/trigger.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/trigger.ts tests/content/trigger.test.ts
git commit -m "feat: add trigger icon component with risk-level styling"
```

---

### [ ] Task 14: Popup Card Component

**Files:**
- Create: `reword/src/content/popup-card.ts`
- Create: `reword/src/content/popup-card.css`
- Create: `reword/tests/content/popup-card.test.ts`

- [ ] **Step 1: Write failing popup card tests**

```typescript
// tests/content/popup-card.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PopupCard } from '../../src/content/popup-card';
import type { AnalysisResult } from '../../src/shared/types';
import { MOCK_FLAGGED_RESULT } from '../mocks/mock-gemini-client';

describe('PopupCard', () => {
  let card: PopupCard;
  let onRewrite: ReturnType<typeof vi.fn>;
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onRewrite = vi.fn();
    onDismiss = vi.fn();
    card = new PopupCard({ onRewrite, onDismiss });
  });

  it('creates an element with shadow DOM', () => {
    expect(card.element).toBeInstanceOf(HTMLElement);
    expect(card.element.shadowRoot).not.toBeNull();
  });

  it('shows analysis result with rewrites', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever, I guess that works.');
    const shadow = card.element.shadowRoot!;
    expect(shadow.querySelector('.explanation')?.textContent).toContain('dismissive');
    const rewriteButtons = shadow.querySelectorAll('.rewrite-option');
    expect(rewriteButtons.length).toBe(3);
  });

  it('calls onRewrite when a rewrite is clicked', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever, I guess that works.');
    const shadow = card.element.shadowRoot!;
    const firstRewrite = shadow.querySelector<HTMLElement>('.rewrite-option');
    firstRewrite?.click();
    expect(onRewrite).toHaveBeenCalledWith(MOCK_FLAGGED_RESULT.rewrites[0].text);
  });

  it('calls onDismiss when send original is clicked', () => {
    card.show(MOCK_FLAGGED_RESULT, 'Whatever, I guess that works.');
    const shadow = card.element.shadowRoot!;
    const sendOriginal = shadow.querySelector<HTMLElement>('.send-original');
    sendOriginal?.click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('hides the card', () => {
    card.show(MOCK_FLAGGED_RESULT, 'test');
    card.hide();
    expect(card.element.style.display).toBe('none');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/content/popup-card.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write popup card CSS**

```css
/* src/content/popup-card.css */
:host {
  all: initial;
  font-family: system-ui, -apple-system, sans-serif;
}

.card {
  position: fixed;
  bottom: 80px;
  right: 24px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 20px;
  z-index: 99999;
  font-size: 14px;
  line-height: 1.5;
}

.risk-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 600;
}

.risk-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.risk-low { color: #90caf9; }
.risk-low .risk-dot { background: #90caf9; }
.risk-medium { color: #f0a030; }
.risk-medium .risk-dot { background: #f0a030; }
.risk-high { color: #ef5350; }
.risk-high .risk-dot { background: #ef5350; }

.original {
  background: #2a2a3e;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
  border-left: 3px solid #666;
}

.original-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.explanation {
  font-size: 13px;
  color: #aaa;
  margin-bottom: 16px;
  padding: 0 4px;
}

.rewrites {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rewrite-option {
  background: #2a2a3e;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #444;
  cursor: pointer;
  transition: border-color 0.15s;
}

.rewrite-option:hover {
  border-color: #6366f1;
}

.rewrite-option:first-child {
  background: #2a3a2e;
  border-color: #3a5a3e;
}

.rewrite-label {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  justify-content: flex-end;
}

.send-original, .cancel-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  background: none;
  border: none;
}

.send-original { color: #888; }
.send-original:hover { color: #bbb; }
.cancel-btn { color: #666; }
.cancel-btn:hover { color: #999; }
```

- [ ] **Step 4: Write popup card implementation**

```typescript
// src/content/popup-card.ts
import type { AnalysisResult } from '../shared/types';
import popupStyles from './popup-card.css?inline';

interface PopupCardOptions {
  onRewrite: (text: string) => void;
  onDismiss: () => void;
}

export class PopupCard {
  element: HTMLElement;
  private shadow: ShadowRoot;
  private options: PopupCardOptions;

  constructor(options: PopupCardOptions) {
    this.options = options;
    this.element = document.createElement('reword-popup');
    this.element.style.display = 'none';
    this.shadow = this.element.attachShadow({ mode: 'open' });

    const style = new CSSStyleSheet();
    style.replaceSync(popupStyles);
    this.shadow.adoptedStyleSheets = [style];
  }

  show(result: AnalysisResult, originalText: string): void {
    const riskClass = `risk-${result.riskLevel}`;

    this.shadow.innerHTML = `
      <div class="card">
        <div class="risk-indicator ${riskClass}">
          <span class="risk-dot"></span>
          <span>${this.capitalize(result.riskLevel)} risk — ${result.explanation}</span>
        </div>

        <div class="original">
          <div class="original-label">Your message</div>
          <div>${this.escapeHtml(originalText)}</div>
        </div>

        <div class="explanation">${this.escapeHtml(result.issues.join('. '))}</div>

        <div class="rewrites">
          ${result.rewrites.map((r, i) => `
            <div class="rewrite-option" data-index="${i}">
              <div class="rewrite-label">${this.escapeHtml(r.label)}</div>
              <div>${this.escapeHtml(r.text)}</div>
            </div>
          `).join('')}
        </div>

        <div class="actions">
          <button class="send-original">Send original</button>
          <button class="cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Re-attach adopted stylesheets after innerHTML
    const style = new CSSStyleSheet();
    style.replaceSync(popupStyles);
    this.shadow.adoptedStyleSheets = [style];

    // Bind rewrite clicks
    this.shadow.querySelectorAll<HTMLElement>('.rewrite-option').forEach((el) => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index ?? '0', 10);
        this.options.onRewrite(result.rewrites[index].text);
        this.hide();
      });
    });

    // Bind action buttons
    this.shadow.querySelector('.send-original')?.addEventListener('click', () => {
      this.options.onDismiss();
      this.hide();
    });
    this.shadow.querySelector('.cancel-btn')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.style.display = '';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/content/popup-card.test.ts
```

Expected: PASS (note: CSS import may need Vitest config for `?inline` — add `css: true` to vitest config if needed)

- [ ] **Step 6: Commit**

```bash
git add src/content/popup-card.ts src/content/popup-card.css tests/content/popup-card.test.ts
git commit -m "feat: add popup card component with Shadow DOM and rewrite options"
```

---

## Chunk 6: Background Service Worker

### [ ] Task 15: On-Device AI Client

**Files:**
- Create: `reword/src/background/ondevice-client.ts`

- [ ] **Step 1: Write on-device client with availability detection**

```typescript
// src/background/ondevice-client.ts

interface OnDeviceResult {
  shouldFlag: boolean;
  confidence: number;
}

export class OnDeviceClient {
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      // Check if the Chrome AI Prompt API exists
      this.available = typeof (globalThis as any).ai?.languageModel?.create === 'function';
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async checkTone(text: string): Promise<OnDeviceResult | null> {
    if (!(await this.isAvailable())) return null;

    try {
      const ai = (globalThis as any).ai;
      const session = await ai.languageModel.create({
        systemPrompt: 'You analyze message tone. Respond with ONLY a JSON object: {"problematic": true/false, "confidence": 0.0-1.0}',
      });
      const response = await session.prompt(`Is this message potentially problematic in tone? "${text}"`);
      session.destroy();

      const parsed = JSON.parse(response);
      return {
        shouldFlag: parsed.problematic === true,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/background/ondevice-client.ts
git commit -m "feat: add on-device AI client with availability detection"
```

---

### [ ] Task 16: Service Worker Message Router

**Files:**
- Create: `reword/src/background/service-worker.ts`
- Create: `reword/tests/background/service-worker.test.ts`

- [ ] **Step 1: Write failing service worker tests**

```typescript
// tests/background/service-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../../src/background/service-worker';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: { onMessage: { addListener: vi.fn() } },
  };
});

describe('handleMessage', () => {
  it('returns settings on get-settings message', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-settings' });
    expect(result.type).toBe('settings');
  });

  it('returns null profile for unknown domain', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-profile', domain: 'unknown.com' });
    expect(result.type).toBe('profile');
    expect((result as any).profile).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd reword && npx vitest run tests/background/service-worker.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write service worker implementation**

```typescript
// src/background/service-worker.ts
import { GeminiClient } from './gemini-client';
import { OnDeviceClient } from './ondevice-client';
import { loadStoredData, saveStoredData } from '../shared/storage';
import { ONDEVICE_CONFIDENCE_THRESHOLD } from '../shared/constants';
import type { MessageToBackground, MessageFromBackground, AnalysisResult } from '../shared/types';

const gemini = new GeminiClient();
const ondevice = new OnDeviceClient();

export async function handleMessage(message: MessageToBackground & { type: string }): Promise<MessageFromBackground | { valid: boolean }> {
  switch (message.type) {
    case 'validate-api-key': {
      const valid = await gemini.validateApiKey((message as any).apiKey);
      return { valid };
    }
    case 'get-settings': {
      const data = await loadStoredData();
      return { type: 'settings', data };
    }

    case 'get-profile': {
      const data = await loadStoredData();
      const profile = data.relationshipProfiles[message.domain] ?? null;
      return { type: 'profile', profile };
    }

    case 'increment-stat': {
      const data = await loadStoredData();
      (data.stats[message.stat] as number)++;
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'analyze': {
      try {
        const data = await loadStoredData();

        // Ensure Gemini is configured
        if (!gemini.isConfigured() && data.settings.geminiApiKey) {
          gemini.configure(data.settings.geminiApiKey);
        }

        // Tier 1: try on-device AI first
        const ondeviceResult = await ondevice.checkTone(message.text);
        if (ondeviceResult && !ondeviceResult.shouldFlag && ondeviceResult.confidence > ONDEVICE_CONFIDENCE_THRESHOLD) {
          return {
            type: 'analysis-result',
            result: { shouldFlag: false, riskLevel: 'low', issues: [], explanation: '', rewrites: [] },
          };
        }

        // Tier 2: Gemini full analysis
        if (!gemini.isConfigured()) {
          return { type: 'analysis-error', error: 'Gemini API key not configured' };
        }

        // Update stats
        data.stats.totalAnalyzed++;
        data.stats.monthlyApiCalls++;
        await saveStoredData(data);

        const result = await gemini.analyze(
          message.text,
          message.relationshipType,
          message.sensitivity,
          message.context,
        );

        if (result.shouldFlag) {
          data.stats.totalFlagged++;
          await saveStoredData(data);
        }

        return { type: 'analysis-result', result };
      } catch (error) {
        return { type: 'analysis-error', error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  }
}

// Register message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as MessageToBackground).then(sendResponse);
  return true; // indicates async response
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd reword && npx vitest run tests/background/service-worker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.ts src/background/ondevice-client.ts tests/background/service-worker.test.ts
git commit -m "feat: add background service worker with tier orchestration"
```

---

## Chunk 7: Content Script Entry Point

### [ ] Task 17: Content Script Wiring

**Files:**
- Create: `reword/src/content/index.ts`

- [ ] **Step 1: Write content script entry point**

```typescript
// src/content/index.ts
import type { PlatformAdapter, AnalysisResult, MessageToBackground, MessageFromBackground } from '../shared/types';
import { DEBOUNCE_MS, MIN_MESSAGE_LENGTH, HEURISTIC_THRESHOLD } from '../shared/constants';
import { scoreMessage } from './heuristic-scorer';
import { InputObserver } from './observer';
import { TriggerIcon } from './trigger';
import { PopupCard } from './popup-card';
import { GmailAdapter } from '../adapters/gmail';
import { LinkedInAdapter } from '../adapters/linkedin';
import { TwitterAdapter } from '../adapters/twitter';
import { GenericFallbackAdapter } from '../adapters/base';

function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  return new GenericFallbackAdapter();
}

async function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
}

function init(): void {
  const adapter = detectAdapter();
  let currentResult: AnalysisResult | null = null;
  let currentText = '';
  let triggerCleanup: (() => void) | null = null;
  let generation = 0;
  let abortController: AbortController | null = null;

  const popup = new PopupCard({
    onRewrite: (text) => {
      adapter.writeBack(text);
      sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    },
    onDismiss: () => {},
  });

  const trigger = new TriggerIcon(() => {
    if (currentResult) {
      popup.show(currentResult, currentText);
    }
  });

  document.body.appendChild(popup.element);

  const observer = new InputObserver({
    debounceMs: DEBOUNCE_MS,
    minLength: MIN_MESSAGE_LENGTH,
    onAnalyze: async (text) => {
      const thisGeneration = ++generation;

      // Cancel any in-flight Tier 2 request
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      // Tier 0: local heuristic
      const score = scoreMessage(text);
      if (score < HEURISTIC_THRESHOLD) {
        trigger.hide();
        currentResult = null;
        return;
      }

      currentText = text;

      // Get relationship context
      const host = window.location.hostname;
      const profileResp = await sendMessage({ type: 'get-profile', domain: host });
      if (signal.aborted || thisGeneration !== generation) return;
      const profile = profileResp.type === 'profile' ? profileResp.profile : null;

      const settingsResp = await sendMessage({ type: 'get-settings' });
      if (signal.aborted || thisGeneration !== generation) return;
      const settings = settingsResp.type === 'settings' ? settingsResp.data.settings : null;

      const threadContext = adapter.scrapeThreadContext();

      // Send to background for Tier 1/2 analysis
      const response = await sendMessage({
        type: 'analyze',
        text,
        context: threadContext,
        relationshipType: profile?.type ?? 'workplace',
        sensitivity: settings?.sensitivity ?? 'medium',
      });

      // Check if generation is still current (discard stale results)
      if (signal.aborted || thisGeneration !== generation) return;

      if (response.type === 'analysis-result' && response.result.shouldFlag) {
        currentResult = response.result;
        trigger.show(response.result.riskLevel);
        // Place trigger icon via adapter
        if (triggerCleanup) triggerCleanup();
        triggerCleanup = adapter.placeTriggerIcon(trigger.element);
      } else {
        trigger.hide();
        currentResult = null;
      }
    },
  });

  // Watch for input fields appearing (SPAs dynamically add them)
  // Throttle to avoid excessive DOM queries on busy pages
  let domCheckTimer: ReturnType<typeof setTimeout> | null = null;
  const domObserver = new MutationObserver(() => {
    if (domCheckTimer) return;
    domCheckTimer = setTimeout(() => {
      domCheckTimer = null;
      const input = adapter.findInputField();
      if (input && input !== observer['element']) {
        observer.observe(input);
      }
    }, 500);
  });

  domObserver.observe(document.body, { childList: true, subtree: true });

  // Initial check for already-present input fields
  const input = adapter.findInputField();
  if (input) observer.observe(input);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: add content script entry point wiring all components together"
```

---

## Chunk 8: Options Page

### [ ] Task 18: Options Page

**Files:**
- Create: `reword/src/options/options.html`
- Create: `reword/src/options/options.css`
- Create: `reword/src/options/options.ts`

- [ ] **Step 1: Write options HTML**

```html
<!-- src/options/options.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reword Settings</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="container">
    <h1>Reword Settings</h1>

    <section>
      <h2>Gemini API Key</h2>
      <div class="field">
        <input type="password" id="api-key" placeholder="Enter your Gemini API key">
        <button id="validate-key">Validate</button>
        <span id="key-status"></span>
      </div>
      <p class="hint">Get a free API key at <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a></p>
    </section>

    <section>
      <h2>Sensitivity</h2>
      <select id="sensitivity">
        <option value="low">Low — only flag clearly hostile messages</option>
        <option value="medium" selected>Medium — flag messages that could be misread</option>
        <option value="high">High — flag anything that could be taken wrong</option>
      </select>
    </section>

    <section>
      <h2>Relationship Profiles</h2>
      <div id="profiles-list"></div>
      <div class="add-profile">
        <input type="text" id="new-profile-domain" placeholder="Domain or contact (e.g. linkedin.com)">
        <select id="new-profile-type">
          <option value="romantic">Romantic</option>
          <option value="workplace">Workplace</option>
          <option value="family">Family</option>
        </select>
        <input type="text" id="new-profile-label" placeholder="Label (e.g. partner, boss)">
        <button id="add-profile">Add</button>
      </div>
    </section>

    <section>
      <h2>Custom Domains</h2>
      <p class="hint">Enable Reword on additional websites beyond Gmail, LinkedIn, and Twitter.</p>
      <div id="domains-list"></div>
      <div class="add-domain">
        <input type="text" id="new-domain" placeholder="e.g. slack.com">
        <button id="add-domain">Add</button>
      </div>
    </section>

    <section>
      <h2>Usage Stats</h2>
      <div id="stats"></div>
    </section>
  </div>
  <script src="../options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write options CSS**

```css
/* src/options/options.css */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f0f1a;
  color: #e0e0e0;
  padding: 40px;
  line-height: 1.6;
}

.container { max-width: 640px; margin: 0 auto; }

h1 { font-size: 24px; margin-bottom: 32px; color: #fff; }
h2 { font-size: 16px; margin-bottom: 12px; color: #ccc; }

section { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #2a2a3e; }

.field { display: flex; gap: 8px; align-items: center; }

input, select {
  background: #1a1a2e;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
}

input:focus, select:focus { outline: none; border-color: #6366f1; }
input[type="text"], input[type="password"] { flex: 1; }

button {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

button:hover { background: #5558e6; }

.hint { font-size: 12px; color: #666; margin-top: 6px; }
.hint a { color: #6366f1; }

#key-status { font-size: 13px; margin-left: 8px; }

.profile-item, .domain-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.profile-item button, .domain-item button {
  background: #333;
  font-size: 12px;
  padding: 4px 8px;
}

.add-profile, .add-domain {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

#stats { font-size: 14px; color: #aaa; }
#stats div { margin-bottom: 4px; }
```

- [ ] **Step 3: Write options page logic**

```typescript
// src/options/options.ts
import { loadStoredData, saveStoredData } from '../shared/storage';
import type { StoredData, RelationshipType } from '../shared/types';

let data: StoredData;

async function init() {
  data = await loadStoredData();
  renderAll();
  bindEvents();
}

function renderAll() {
  // API key
  const keyInput = document.getElementById('api-key') as HTMLInputElement;
  if (data.settings.geminiApiKey) {
    keyInput.value = '••••••••' + data.settings.geminiApiKey.slice(-4);
  }

  // Sensitivity
  const sensitivitySelect = document.getElementById('sensitivity') as HTMLSelectElement;
  sensitivitySelect.value = data.settings.sensitivity;

  // Profiles
  renderProfiles();

  // Domains
  renderDomains();

  // Stats
  renderStats();
}

function renderProfiles() {
  const list = document.getElementById('profiles-list')!;
  list.innerHTML = Object.entries(data.relationshipProfiles)
    .map(([domain, profile]) => `
      <div class="profile-item">
        <span><strong>${domain}</strong> — ${profile.type} (${profile.label})</span>
        <button data-remove-profile="${domain}">Remove</button>
      </div>
    `).join('');

  list.querySelectorAll<HTMLElement>('[data-remove-profile]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.removeProfile!;
      delete data.relationshipProfiles[domain];
      await saveStoredData(data);
      renderProfiles();
    });
  });
}

function renderDomains() {
  const list = document.getElementById('domains-list')!;
  list.innerHTML = data.settings.enabledDomains
    .map(d => `
      <div class="domain-item">
        <span>${d}</span>
        <button data-remove-domain="${d}">Remove</button>
      </div>
    `).join('');

  list.querySelectorAll<HTMLElement>('[data-remove-domain]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.removeDomain!;
      data.settings.enabledDomains = data.settings.enabledDomains.filter(d => d !== domain);
      await saveStoredData(data);
      renderDomains();
    });
  });
}

function renderStats() {
  const stats = document.getElementById('stats')!;
  stats.innerHTML = `
    <div>Messages analyzed: ${data.stats.totalAnalyzed}</div>
    <div>Messages flagged: ${data.stats.totalFlagged}</div>
    <div>Rewrites accepted: ${data.stats.rewritesAccepted}</div>
    <div>API calls this month: ${data.stats.monthlyApiCalls}</div>
  `;
}

function bindEvents() {
  // Validate API key
  document.getElementById('validate-key')!.addEventListener('click', async () => {
    const keyInput = document.getElementById('api-key') as HTMLInputElement;
    const status = document.getElementById('key-status')!;
    const key = keyInput.value.startsWith('••') ? data.settings.geminiApiKey : keyInput.value;

    status.textContent = 'Validating...';
    status.style.color = '#aaa';

    try {
      // Delegate validation to service worker via message passing (dynamic imports are blocked by Manifest V3 CSP)
      const response = await chrome.runtime.sendMessage({ type: 'validate-api-key', apiKey: key });
      const valid = response?.valid === true;
      if (valid) {
        data.settings.geminiApiKey = key;
        await saveStoredData(data);
        status.textContent = 'Valid!';
        status.style.color = '#4caf50';
      } else {
        status.textContent = 'Invalid key';
        status.style.color = '#ef5350';
      }
    } catch {
      status.textContent = 'Error validating';
      status.style.color = '#ef5350';
    }
  });

  // Sensitivity change
  document.getElementById('sensitivity')!.addEventListener('change', async (e) => {
    data.settings.sensitivity = (e.target as HTMLSelectElement).value as StoredData['settings']['sensitivity'];
    await saveStoredData(data);
  });

  // Add profile
  document.getElementById('add-profile')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-profile-domain') as HTMLInputElement).value.trim();
    const type = (document.getElementById('new-profile-type') as HTMLSelectElement).value as RelationshipType;
    const label = (document.getElementById('new-profile-label') as HTMLInputElement).value.trim();
    if (!domain) return;

    data.relationshipProfiles[domain] = { type, label: label || type };
    await saveStoredData(data);
    (document.getElementById('new-profile-domain') as HTMLInputElement).value = '';
    (document.getElementById('new-profile-label') as HTMLInputElement).value = '';
    renderProfiles();
  });

  // Add domain
  document.getElementById('add-domain')!.addEventListener('click', async () => {
    const domain = (document.getElementById('new-domain') as HTMLInputElement).value.trim();
    if (!domain || data.settings.enabledDomains.includes(domain)) return;

    data.settings.enabledDomains.push(domain);
    await saveStoredData(data);
    (document.getElementById('new-domain') as HTMLInputElement).value = '';
    renderDomains();
  });
}

init();
```

- [ ] **Step 4: Commit**

```bash
git add src/options/options.html src/options/options.css src/options/options.ts
git commit -m "feat: add options/settings page with profiles, domains, and stats"
```

---

## Chunk 9: Build, Test, and Polish

### [ ] Task 19: Run All Tests and Fix Issues

- [ ] **Step 1: Run all unit tests**

```bash
cd reword && npx vitest run
```

- [ ] **Step 2: Fix any failing tests**

Address any import resolution issues, missing mocks, or test failures.

- [ ] **Step 3: Build the extension**

```bash
cd reword && npm run build
```

- [ ] **Step 4: Fix any build issues**

Address any TypeScript compilation errors or Vite bundling issues.

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test and build issues"
```

---

### [ ] Task 20: Manual Extension Testing

- [ ] **Step 1: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `reword/dist` directory

- [ ] **Step 2: Test on Gmail**

1. Open Gmail, compose a new email
2. Type a passive-aggressive message: "Whatever, I guess that works. Not like I had plans or anything."
3. Wait 2 seconds — verify trigger icon appears
4. Click trigger icon — verify popup card shows with rewrites
5. Click a rewrite — verify text is replaced in compose box

- [ ] **Step 3: Test options page**

1. Right-click extension icon → Options
2. Enter Gemini API key and validate
3. Add a relationship profile
4. Change sensitivity

- [ ] **Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

### [ ] Task 21: Final Commit

- [ ] **Step 1: Final review and commit**

```bash
git add -A
git commit -m "feat: Reword v0.1.0 — Chrome extension for better communication"
```
