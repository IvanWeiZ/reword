# Multi-Provider AI, Contact Profiles & Language Support

## Overview

Five features unified into one design:

1. **Multi-provider AI** — Claude, OpenAI, and Gemini backends via a shared `AIProvider` interface
2. **Multi-language support** — auto-detect message language with optional override in settings
3. **Recipient tone mirroring** — via contact profile `toneGoal` field
4. **Per-contact profiles** — rich profiles keyed by `platform:identifier`
5. **Cultural context** — via contact profile `culturalContext` field

Features 3, 4, and 5 collapse into the contact profile system.

## Architecture

### [ ] AI Provider Interface

New `AIProvider` interface in `src/shared/types.ts`:

```ts
interface AIProvider {
  name: string;
  configure(apiKey: string): void;
  isConfigured(): boolean;
  analyze(message, relationshipType, sensitivity, threadContext, options?): Promise<AnalysisResult>;
  analyzeStreaming(
    message,
    relationshipType,
    sensitivity,
    threadContext,
    onStream,
    signal?,
    options?,
  ): Promise<AnalysisResult>;
  analyzeIncoming(message, threadContext): Promise<IncomingAnalysis>;
  validateApiKey(apiKey: string): Promise<boolean>;
}
```

Three implementations in `src/background/providers/`:

- `gemini.ts` — refactored from `GeminiClient`, uses `@google/generative-ai`
- `claude.ts` — uses `@anthropic-ai/sdk`
- `openai.ts` — uses `openai` SDK
- `index.ts` — barrel export + `createProvider(name): AIProvider` factory

Existing `buildAnalysisPrompt()` and `parseAnalysisResponse()` are provider-agnostic — reused by all providers.

### [ ] Settings & Storage (Schema v6)

New fields in `Settings`:

- `aiProvider: 'gemini' | 'claude' | 'openai'` — active provider
- `providerApiKeys: Record<string, string>` — per-provider API keys
- `preferredLanguage: string | ''` — empty = auto-detect

New top-level field in `StoredData`:

- `contactProfiles: Record<string, ContactProfile>`

```ts
interface ContactProfile {
  displayName: string;
  platformId: string; // 'gmail:jane@example.com'
  relationshipType: RelationshipType;
  sensitivity: Sensitivity;
  toneGoal: string; // 'more formal', 'match their energy'
  culturalContext: string; // 'prefers direct communication'
  createdAt: string;
}
```

Migration v5→v6: move `geminiApiKey` into `providerApiKeys.gemini`, add defaults.

Lookup order: contact profile → domain profile → defaults.

### [ ] Prompt Changes

`buildAnalysisPrompt()` gains `contactProfile` and `preferredLanguage` options, replacing `recipientStyle`.

Language block: "Write all rewrites in {language}" or "Detect the language and respond in it."

Contact profile block: injects tone goal and cultural context when present.

### [ ] Adapter Changes

New method on `PlatformAdapter`:

```ts
getRecipientIdentifier(): string | null;
```

Returns `platform:identifier` per platform (email for Gmail/Outlook, display name for LinkedIn/Slack/etc., null for generic).

### [ ] Options Page

- AI Provider section: provider dropdown + per-provider API key input + validate + language preference
- Contact Profiles section: table with add/edit/delete

### [ ] Popup Card

"Save profile for this contact" link when recipient is identified and no profile exists. Pre-fills from current context.

### [ ] Message Types

New/modified messages:

- `analyze` gains optional `recipientId` and `preferredLanguage`
- New `save-contact-profile` message
- New `delete-contact-profile` message
- New `get-contact-profiles` message
