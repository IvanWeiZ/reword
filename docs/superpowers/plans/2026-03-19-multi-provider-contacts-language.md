# Multi-Provider AI, Contact Profiles & Language Support — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude/OpenAI/Gemini provider selection, per-contact profiles with tone goals and cultural context, and auto-detect + configurable language support.

**Architecture:** Extract an `AIProvider` interface from `GeminiClient`, implement it for three providers. Add `ContactProfile` type and storage. Extend prompt builder with language and contact context. Extend adapters with `getRecipientIdentifier()`. Add options page sections for provider selection and contact management.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` (existing), Vite, Vitest

---

## File Structure

### [ ] New files

- `src/background/providers/provider.ts` — `AIProvider` interface and `StreamCallback` type
- `src/background/providers/gemini.ts` — Gemini provider (refactored from `gemini-client.ts`)
- `src/background/providers/claude.ts` — Claude/Anthropic provider
- `src/background/providers/openai.ts` — OpenAI provider
- `src/background/providers/index.ts` — barrel export + `createProvider()` factory
- `tests/background/providers/gemini.test.ts` — Gemini provider tests (moved from gemini-client.test.ts)
- `tests/background/providers/claude.test.ts` — Claude provider tests
- `tests/background/providers/openai.test.ts` — OpenAI provider tests
- `tests/background/providers/factory.test.ts` — createProvider factory tests

### [ ] Modified files

- `src/shared/types.ts` — add `AIProvider`, `ContactProfile`, `ProviderName`; update `Settings`, `StoredData`, `PlatformAdapter`, messages
- `src/shared/constants.ts` — bump schema version, update `DEFAULT_STORED_DATA`
- `src/shared/storage.ts` — add migration v5→v6
- `src/shared/prompts.ts` — add language and contact profile blocks; replace `recipientStyle`
- `src/background/service-worker.ts` — use `createProvider()` instead of `GeminiClient` directly
- `src/background/gemini-client.ts` — kept as thin re-export for backwards compat (tests, etc.)
- `src/adapters/base.ts` — add `getRecipientIdentifier()` to `GenericFallbackAdapter`
- `src/adapters/gmail.ts` — add `getRecipientIdentifier()`
- `src/adapters/linkedin.ts` — add `getRecipientIdentifier()`
- `src/adapters/outlook.ts` — add `getRecipientIdentifier()`
- `src/adapters/slack.ts` — add `getRecipientIdentifier()`
- `src/adapters/discord.ts` — add `getRecipientIdentifier()`
- `src/adapters/teams.ts` — add `getRecipientIdentifier()`
- `src/adapters/whatsapp.ts` — add `getRecipientIdentifier()`
- `src/adapters/twitter.ts` — add `getRecipientIdentifier()`
- `src/content/index.ts` — pass `recipientId` and `preferredLanguage` in analyze message
- `src/content/popup-card.ts` — add "Save profile for this contact" UI
- `src/options/renderers.ts` — add provider section and contact profiles section
- `src/options/options.ts` — wire up new sections
- `tests/shared/prompts.test.ts` — test language and contact profile prompt blocks
- `tests/shared/storage-migration.test.ts` — test v5→v6 migration

---

## Chunk 1: Types, Storage & Provider Interface

### [ ] Task 1: Add new types to `src/shared/types.ts`

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add ProviderName, ContactProfile, and AIProvider types**

Add after the `DismissedPattern` interface (line 72):

```ts
// --- Provider types ---

export type ProviderName = 'gemini' | 'claude' | 'openai';

export interface ContactProfile {
  displayName: string;
  platformId: string;
  relationshipType: RelationshipType;
  sensitivity: Sensitivity;
  toneGoal: string;
  culturalContext: string;
  createdAt: string;
}

export type StreamCallback = (partialText: string) => void;

export interface AIProvider {
  name: ProviderName;
  configure(apiKey: string): void;
  isConfigured(): boolean;
  analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    options?: AnalysisOptions,
  ): Promise<AnalysisResult>;
  analyzeStreaming(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    onStream: StreamCallback,
    signal?: AbortSignal,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult>;
  analyzeIncoming(message: string, threadContext: ThreadMessage[]): Promise<IncomingAnalysis>;
  validateApiKey(apiKey: string): Promise<boolean>;
}

export interface AnalysisOptions {
  personas?: RewritePersona[];
  contactProfile?: ContactProfile;
  preferredLanguage?: string;
}
```

- [ ] **Step 2: Update Settings interface**

Replace the `Settings` interface:

```ts
export interface Settings {
  aiProvider: ProviderName;
  providerApiKeys: Record<string, string>;
  sensitivity: Sensitivity;
  enabledDomains: string[];
  customPatterns: string[];
  theme: Theme;
  rewritePersonas: RewritePersona[];
  analyzeIncoming: boolean;
  suppressedPhrases: string[];
  preferredLanguage: string;
}
```

- [ ] **Step 3: Update StoredData to include contactProfiles**

Add `contactProfiles: Record<string, ContactProfile>;` to `StoredData`.

- [ ] **Step 4: Add getRecipientIdentifier to PlatformAdapter**

Add to the `PlatformAdapter` interface:

```ts
  /** Get a stable identifier for the current recipient (e.g., 'gmail:jane@example.com'). */
  getRecipientIdentifier?(): string | null;
```

- [ ] **Step 5: Update MessageToBackground**

Update the `analyze` message type — replace `recipientStyle?: string` with:

```ts
  recipientId?: string;
  preferredLanguage?: string;
```

Add new message types:

```ts
  | { type: 'save-contact-profile'; profile: ContactProfile }
  | { type: 'delete-contact-profile'; platformId: string }
  | { type: 'get-contact-profiles' }
  | { type: 'validate-api-key'; apiKey: string; provider: ProviderName }
```

Update `validate-api-key` to include provider name.

Add to `MessageFromBackground`:

```ts
  | { type: 'contact-profiles'; profiles: Record<string, ContactProfile> }
```

- [ ] **Step 6: Run lint to verify types compile**

Run: `npm run lint`
Expected: 0 errors (warnings OK). There will be downstream breakage in files that reference old fields — that's expected and fixed in later tasks.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add AIProvider interface, ContactProfile, and ProviderName types"
```

---

### [ ] Task 2: Update constants and storage with migration

**Files:**

- Modify: `src/shared/constants.ts`
- Modify: `src/shared/storage.ts`
- Test: `tests/shared/storage-migration.test.ts`

- [ ] **Step 1: Write failing migration test**

Add to `tests/shared/storage-migration.test.ts`:

```ts
describe('v5 → v6 migration', () => {
  it('moves geminiApiKey into providerApiKeys and adds new fields', () => {
    const v5Data = {
      schemaVersion: 5,
      settings: {
        geminiApiKey: 'test-key-123',
        sensitivity: 'medium' as const,
        enabledDomains: ['gmail.com'],
        customPatterns: [],
        theme: 'auto' as const,
        rewritePersonas: [],
        analyzeIncoming: false,
        suppressedPhrases: [],
      },
      relationshipProfiles: {},
      stats: {
        totalAnalyzed: 10,
        totalFlagged: 3,
        rewritesAccepted: 1,
        monthlyApiCalls: 5,
        monthlyApiCallsResetDate: '2026-03-01',
        recentFlags: [],
        dismissedCategories: {},
      },
      dismissedPatterns: [],
      weeklyStats: { weekStart: '', analyzed: 0, flagged: 0, rewritesAccepted: 0 },
      previousWeeklyStats: null,
      lastWeeklySummaryShown: '',
    };

    const result = migrate(v5Data as any);

    expect(result.schemaVersion).toBe(6);
    expect(result.settings.aiProvider).toBe('gemini');
    expect(result.settings.providerApiKeys).toEqual({ gemini: 'test-key-123' });
    expect(result.settings.preferredLanguage).toBe('');
    expect((result.settings as any).geminiApiKey).toBeUndefined();
    expect(result.contactProfiles).toEqual({});
  });

  it('handles missing geminiApiKey gracefully', () => {
    const v5Data = {
      schemaVersion: 5,
      settings: {
        geminiApiKey: '',
        sensitivity: 'medium' as const,
        enabledDomains: [],
        customPatterns: [],
        theme: 'auto' as const,
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
        monthlyApiCallsResetDate: '2026-03-01',
        recentFlags: [],
        dismissedCategories: {},
      },
      dismissedPatterns: [],
      weeklyStats: { weekStart: '', analyzed: 0, flagged: 0, rewritesAccepted: 0 },
      previousWeeklyStats: null,
      lastWeeklySummaryShown: '',
    };

    const result = migrate(v5Data as any);

    expect(result.settings.aiProvider).toBe('gemini');
    expect(result.settings.providerApiKeys).toEqual({ gemini: '' });
    expect(result.contactProfiles).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/storage-migration.test.ts`
Expected: FAIL — migration function for v6 doesn't exist yet.

- [ ] **Step 3: Update constants**

In `src/shared/constants.ts`:

Change `CURRENT_SCHEMA_VERSION` from `5` to `6`.

Update `DEFAULT_STORED_DATA.settings`:

```ts
  settings: {
    aiProvider: 'gemini',
    providerApiKeys: {},
    sensitivity: 'medium',
    enabledDomains: [],
    customPatterns: [],
    theme: 'auto',
    rewritePersonas: [],
    analyzeIncoming: false,
    suppressedPhrases: [],
    preferredLanguage: '',
  },
```

Add `contactProfiles: {},` to `DEFAULT_STORED_DATA`.

Remove the old `geminiApiKey: ''` field.

- [ ] **Step 4: Add v5→v6 migration**

In `src/shared/storage.ts`, add migration `6`:

```ts
  6: (data) => {
    // v5 → v6: Multi-provider support, contact profiles, language preference
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
```

- [ ] **Step 5: Run migration tests**

Run: `npm test -- tests/shared/storage-migration.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/constants.ts src/shared/storage.ts tests/shared/storage-migration.test.ts
git commit -m "feat: add v5→v6 migration for multi-provider and contact profiles"
```

---

### [ ] Task 3: Update prompt builder with language and contact profile support

**Files:**

- Modify: `src/shared/prompts.ts`
- Test: `tests/shared/prompts.test.ts`

- [ ] **Step 1: Write failing tests for language and contact profile blocks**

Add to `tests/shared/prompts.test.ts`:

```ts
describe('buildAnalysisPrompt language support', () => {
  it('adds auto-detect instruction when no language specified', () => {
    const prompt = buildAnalysisPrompt('Hello', 'workplace', 'medium', []);
    expect(prompt).toContain('Detect the language');
  });

  it('adds specific language instruction when preferredLanguage set', () => {
    const prompt = buildAnalysisPrompt('Hola', 'workplace', 'medium', [], {
      preferredLanguage: 'Spanish',
    });
    expect(prompt).toContain('Spanish');
    expect(prompt).not.toContain('Detect the language');
  });
});

describe('buildAnalysisPrompt contact profile', () => {
  it('injects tone goal and cultural context from contact profile', () => {
    const prompt = buildAnalysisPrompt('Hello', 'workplace', 'medium', [], {
      contactProfile: {
        displayName: 'Jane',
        platformId: 'gmail:jane@example.com',
        relationshipType: 'workplace',
        sensitivity: 'high',
        toneGoal: 'more formal and respectful',
        culturalContext: 'prefers indirect communication',
        createdAt: '2026-03-19',
      },
    });
    expect(prompt).toContain('more formal and respectful');
    expect(prompt).toContain('prefers indirect communication');
  });

  it('omits contact block when profile has empty fields', () => {
    const prompt = buildAnalysisPrompt('Hello', 'workplace', 'medium', [], {
      contactProfile: {
        displayName: 'Jane',
        platformId: 'gmail:jane@example.com',
        relationshipType: 'workplace',
        sensitivity: 'medium',
        toneGoal: '',
        culturalContext: '',
        createdAt: '2026-03-19',
      },
    });
    expect(prompt).not.toContain('Contact-specific context');
  });

  it('replaces recipientStyle with contactProfile', () => {
    const prompt = buildAnalysisPrompt('Hello', 'workplace', 'medium', [], {
      contactProfile: {
        displayName: 'Bob',
        platformId: 'slack:@bob',
        relationshipType: 'workplace',
        sensitivity: 'medium',
        toneGoal: 'match their casual energy',
        culturalContext: '',
        createdAt: '2026-03-19',
      },
    });
    expect(prompt).toContain('match their casual energy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/shared/prompts.test.ts`
Expected: FAIL

- [ ] **Step 3: Update prompt builder**

In `src/shared/prompts.ts`:

Import `ContactProfile` and `AnalysisOptions` from types.

Replace `buildRecipientStyleBlock` with:

```ts
function buildContactProfileBlock(contactProfile?: ContactProfile): string {
  if (!contactProfile) return '';
  const parts: string[] = [];
  if (contactProfile.toneGoal) parts.push(`- Tone goal: ${contactProfile.toneGoal}`);
  if (contactProfile.culturalContext)
    parts.push(`- Cultural context: ${contactProfile.culturalContext}`);
  if (parts.length === 0) return '';
  return `\n\nContact-specific context for this recipient:\n${parts.join('\n')}\nAdapt your rewrites to reflect these preferences.`;
}

function buildLanguageBlock(preferredLanguage?: string): string {
  if (preferredLanguage) {
    return `\n\nLanguage: Analyze and write all rewrites in ${preferredLanguage}. Keep JSON keys in English.`;
  }
  return "\n\nLanguage: Detect the language of the user's message. Write all rewrites in that same language. Keep JSON keys in English.";
}
```

Update `buildAnalysisPrompt` signature to use `AnalysisOptions`:

```ts
export function buildAnalysisPrompt(
  message: string,
  relationshipType: RelationshipType,
  sensitivity: Sensitivity,
  threadContext: ThreadMessage[],
  options?: AnalysisOptions,
): string {
```

Replace `recipientBlock` usage with `contactBlock` and add `languageBlock`:

```ts
const contactBlock = buildContactProfileBlock(options?.contactProfile);
const languageBlock = buildLanguageBlock(options?.preferredLanguage);
```

Insert `languageBlock` and `contactBlock` in the prompt string where `recipientBlock` was.

Remove `buildRecipientStyleBlock` function and `recipientStyle` references.

- [ ] **Step 4: Run prompt tests**

Run: `npm test -- tests/shared/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/prompts.ts tests/shared/prompts.test.ts
git commit -m "feat: add language auto-detect and contact profile blocks to prompt builder"
```

---

## Chunk 2: Provider Implementations

### [ ] Task 4: Create Gemini provider (refactor from GeminiClient)

**Files:**

- Create: `src/background/providers/provider.ts`
- Create: `src/background/providers/gemini.ts`
- Create: `src/background/providers/index.ts`
- Modify: `src/background/gemini-client.ts` (thin re-export)
- Move: `tests/background/gemini-client.test.ts` → update imports

- [ ] **Step 1: Create provider interface file**

Create `src/background/providers/provider.ts`:

```ts
// Re-export the interface from shared types for convenience
export type { AIProvider, StreamCallback, AnalysisOptions } from '../../shared/types';
```

- [ ] **Step 2: Create Gemini provider**

Create `src/background/providers/gemini.ts`. This is the existing `GeminiClient` refactored to implement `AIProvider`:

- Class name stays `GeminiProvider`
- Remove the `StreamCallback` type alias (use from types)
- Add `name: ProviderName = 'gemini'` field
- Update `analyze` and `analyzeStreaming` to accept `AnalysisOptions` instead of the old options shape
- Pass `options.contactProfile` and `options.preferredLanguage` through to `buildAnalysisPrompt`
- Keep all existing logic (streaming, timeout, abort signal) unchanged

- [ ] **Step 3: Create Claude provider**

Create `src/background/providers/claude.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AnalysisOptions,
  AnalysisResult,
  IncomingAnalysis,
  ProviderName,
  RelationshipType,
  Sensitivity,
  StreamCallback,
  ThreadMessage,
} from '../../shared/types';
import { buildAnalysisPrompt, buildIncomingAnalysisPrompt } from '../../shared/prompts';
import { parseAnalysisResponse, parseIncomingAnalysisResponse } from '../response-parsers';
import { API_TIMEOUT_MS } from '../../shared/constants';

export class ClaudeProvider implements AIProvider {
  name: ProviderName = 'claude';
  private client: Anthropic | null = null;
  private apiKey = '';

  configure(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
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
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('Claude client not configured');
    const prompt = buildAnalysisPrompt(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      options,
    );

    const stream = this.client.messages.stream(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal, timeout: API_TIMEOUT_MS },
    );

    let accumulated = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        accumulated += event.delta.text;
        onStream(accumulated);
      }
    }

    return parseAnalysisResponse(accumulated);
  }

  async analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    return this.analyzeStreaming(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      () => {},
      undefined,
      options,
    );
  }

  async analyzeIncoming(
    message: string,
    threadContext: ThreadMessage[],
  ): Promise<IncomingAnalysis> {
    if (!this.client) throw new Error('Claude client not configured');
    const prompt = buildIncomingAnalysisPrompt(message, threadContext);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return parseIncomingAnalysisResponse(text);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Create OpenAI provider**

Create `src/background/providers/openai.ts`:

```ts
import OpenAI from 'openai';
import type {
  AIProvider,
  AnalysisOptions,
  AnalysisResult,
  IncomingAnalysis,
  ProviderName,
  RelationshipType,
  Sensitivity,
  StreamCallback,
  ThreadMessage,
} from '../../shared/types';
import { buildAnalysisPrompt, buildIncomingAnalysisPrompt } from '../../shared/prompts';
import { parseAnalysisResponse, parseIncomingAnalysisResponse } from '../response-parsers';
import { API_TIMEOUT_MS } from '../../shared/constants';

export class OpenAIProvider implements AIProvider {
  name: ProviderName = 'openai';
  private client: OpenAI | null = null;
  private apiKey = '';

  configure(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
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
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    if (!this.client) throw new Error('OpenAI client not configured');
    const prompt = buildAnalysisPrompt(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      options,
    );

    const stream = await this.client.chat.completions.create(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      },
      { signal, timeout: API_TIMEOUT_MS },
    );

    let accumulated = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      accumulated += delta;
      if (delta) onStream(accumulated);
    }

    return parseAnalysisResponse(accumulated);
  }

  async analyze(
    message: string,
    relationshipType: RelationshipType,
    sensitivity: Sensitivity,
    threadContext: ThreadMessage[],
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    return this.analyzeStreaming(
      message,
      relationshipType,
      sensitivity,
      threadContext,
      () => {},
      undefined,
      options,
    );
  }

  async analyzeIncoming(
    message: string,
    threadContext: ThreadMessage[],
  ): Promise<IncomingAnalysis> {
    if (!this.client) throw new Error('OpenAI client not configured');
    const prompt = buildIncomingAnalysisPrompt(message, threadContext);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    return parseIncomingAnalysisResponse(response.choices[0]?.message?.content ?? '');
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Create provider factory**

Create `src/background/providers/index.ts`:

```ts
import type { AIProvider, ProviderName } from '../../shared/types';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';

export { GeminiProvider } from './gemini';
export { ClaudeProvider } from './claude';
export { OpenAIProvider } from './openai';

export function createProvider(name: ProviderName): AIProvider {
  switch (name) {
    case 'gemini':
      return new GeminiProvider();
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}
```

- [ ] **Step 6: Write factory test**

Create `tests/background/providers/factory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createProvider,
  GeminiProvider,
  ClaudeProvider,
  OpenAIProvider,
} from '../../../src/background/providers';

describe('createProvider', () => {
  it('creates GeminiProvider for "gemini"', () => {
    const p = createProvider('gemini');
    expect(p).toBeInstanceOf(GeminiProvider);
    expect(p.name).toBe('gemini');
  });

  it('creates ClaudeProvider for "claude"', () => {
    const p = createProvider('claude');
    expect(p).toBeInstanceOf(ClaudeProvider);
    expect(p.name).toBe('claude');
  });

  it('creates OpenAIProvider for "openai"', () => {
    const p = createProvider('openai');
    expect(p).toBeInstanceOf(OpenAIProvider);
    expect(p.name).toBe('openai');
  });

  it('throws for unknown provider', () => {
    expect(() => createProvider('unknown' as any)).toThrow('Unknown provider');
  });
});
```

- [ ] **Step 7: Update gemini-client.ts as thin re-export**

Replace `src/background/gemini-client.ts` with:

```ts
// Backwards-compatible re-export — new code should import from providers/
export { GeminiProvider as GeminiClient } from './providers/gemini';
```

- [ ] **Step 8: Install new SDK dependencies**

Run: `npm install @anthropic-ai/sdk openai`

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: Some existing tests may need mock updates. Fix any import-related failures.

- [ ] **Step 10: Commit**

```bash
git add src/background/providers/ src/background/gemini-client.ts tests/background/providers/ package.json package-lock.json
git commit -m "feat: add Claude and OpenAI providers with factory pattern"
```

---

## Chunk 3: Service Worker, Adapters & Content Script

### [ ] Task 5: Update service worker to use provider factory

**Files:**

- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Replace GeminiClient with provider factory**

Update imports and module-level variables:

```ts
import { createProvider } from './providers';
import type { AIProvider } from '../shared/types';

let provider: AIProvider | null = null;
const ondevice = new OnDeviceClient();
```

- [ ] **Step 2: Update the analyze handler**

In the `analyze` case:

- Load settings, create/reconfigure provider if needed:
  ```ts
  const providerName = data.settings.aiProvider;
  const apiKey = data.settings.providerApiKeys[providerName] ?? '';
  if (!provider || provider.name !== providerName) {
    provider = createProvider(providerName);
  }
  if (!provider.isConfigured() && apiKey) {
    provider.configure(apiKey);
  }
  ```
- Look up contact profile from `data.contactProfiles[message.recipientId]` if `recipientId` is present
- Pass `{ personas, contactProfile, preferredLanguage }` as options to `provider.analyze()`

- [ ] **Step 3: Update validate-api-key handler**

Use `message.provider` to create a temporary provider for validation:

```ts
case 'validate-api-key': {
  const tempProvider = createProvider(message.provider);
  const valid = await tempProvider.validateApiKey(message.apiKey);
  return { type: 'validate-api-key-result', valid };
}
```

- [ ] **Step 4: Add contact profile CRUD handlers**

Add handlers for `save-contact-profile`, `delete-contact-profile`, and `get-contact-profiles` messages.

- [ ] **Step 5: Update analyze-incoming handler**

Use the provider factory same as analyze.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: Service worker tests may need mock updates for the new provider interface.

- [ ] **Step 7: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: wire service worker to multi-provider factory with contact profile lookup"
```

---

### [ ] Task 6: Add getRecipientIdentifier to all adapters

**Files:**

- Modify: All adapter files in `src/adapters/`
- Test: `tests/adapters/*.test.ts`

- [ ] **Step 1: Add to GenericFallbackAdapter (base.ts)**

```ts
  getRecipientIdentifier(): string | null {
    return null;
  }
```

- [ ] **Step 2: Add to each platform adapter**

Each adapter extracts the recipient identifier from platform-specific DOM:

Gmail: `document.querySelector('span[email]')?.getAttribute('email')` → `gmail:email`
LinkedIn: `.msg-entity-lockup__entity-title` text → `linkedin:Name`
Outlook: `span[class*="wellItemName"]` text → `outlook:email-or-name`
Slack: `.p-dm_header__name_text` or channel name → `slack:@name`
Discord: `.channel-1Shao0` header text → `discord:name`
Teams: chat header name → `teams:Name`
WhatsApp: header contact name → `whatsapp:Name`
Twitter: DM header name → `twitter:@handle`

- [ ] **Step 3: Write a test for at least Gmail and LinkedIn adapters**

Add to existing adapter tests — verify `getRecipientIdentifier()` returns expected format when DOM fixture has the right elements, and `null` when elements are missing.

- [ ] **Step 4: Run adapter tests**

Run: `npm test -- tests/adapters/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/ tests/adapters/
git commit -m "feat: add getRecipientIdentifier to all platform adapters"
```

---

### [ ] Task 7: Update content script to pass recipientId and language

**Files:**

- Modify: `src/content/index.ts`

- [ ] **Step 1: Update analyzeMessage to include recipientId and language**

Before sending the `analyze` message, get the recipient ID and settings:

```ts
const recipientId = adapter.getRecipientIdentifier?.() ?? undefined;
```

Include `recipientId` and `preferredLanguage` (from the settings response) in the `analyze` message.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS (index.test.ts mocks should still work — new fields are optional)

- [ ] **Step 3: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: pass recipientId and preferredLanguage in analyze messages"
```

---

## Chunk 4: Options Page & Popup Card UI

### [ ] Task 8: Add provider selection and contact profiles to options page

**Files:**

- Modify: `src/options/renderers.ts`
- Modify: `src/options/options.ts`
- Modify: `src/options/options.html` (if needed for new sections)

- [ ] **Step 1: Add renderProviderSection**

New function that renders:

- Provider dropdown (Gemini/Claude/OpenAI)
- API key input (label changes based on provider)
- Validate button
- Language preference dropdown

- [ ] **Step 2: Add renderContactProfiles**

New function that renders:

- Table of existing contact profiles
- Add/edit/delete controls
- Form for new profiles

- [ ] **Step 3: Update options.ts to wire new sections**

Wire event listeners for provider selection, API key changes, language changes, and contact profile CRUD.

- [ ] **Step 4: Run build to verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/options/
git commit -m "feat: add provider selection and contact profiles to options page"
```

---

### [ ] Task 9: Add "Save profile" to popup card

**Files:**

- Modify: `src/content/popup-card.ts`

- [ ] **Step 1: Add save-profile link to popup card**

In `PopupCard.show()`, after the rewrite buttons, add a "Save profile for this contact" link when:

- `recipientId` is available (passed as a new param)
- No profile exists for this contact yet

Clicking shows a compact inline form and sends `save-contact-profile` message.

- [ ] **Step 2: Run build and tests**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/content/popup-card.ts
git commit -m "feat: add save-profile-for-contact UI to popup card"
```

---

## Chunk 5: Final Integration & Verification

### [ ] Task 10: Fix all remaining test failures and lint

**Files:**

- Various test files

- [ ] **Step 1: Run full check**

Run: `npm run check`

- [ ] **Step 2: Fix any test failures**

Update test mocks that reference old `geminiApiKey` field, old `recipientStyle` param, etc.

- [ ] **Step 3: Run check again**

Run: `npm run check`
Expected: ALL PASS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: update tests for multi-provider and contact profile changes"
```

- [ ] **Step 5: Push and verify CI**

```bash
git push origin master
```

Watch CI: `gh run watch --exit-status`
Expected: GREEN
