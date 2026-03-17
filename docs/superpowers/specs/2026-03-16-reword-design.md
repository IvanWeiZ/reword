# Reword — Design Spec

A Chrome browser extension that flags potentially problematic messages before you send them and suggests kinder, clearer rewrites. Works across web messaging platforms (Gmail, LinkedIn, Twitter DMs) with relationship-aware AI analysis.

## Product Summary

- **Form factor:** Chrome extension (Manifest V3), also compatible with Edge, Brave, Arc
- **UX model:** Inline trigger icon near send button + popup card with AI analysis and rewrite options
- **Target platforms:** Gmail, LinkedIn DMs, Twitter/X DMs, with generic fallback for unknown sites
- **AI backend:** Chrome on-device AI for fast tone detection, Gemini 2.5 Flash for full analysis and rewrites
- **Privacy model:** Sender-side only — only modifies your own messages. No server, no accounts. All data stays in local extension storage. Note: when conversation context is used for analysis, visible thread messages (including the other party's messages) are sent to the Gemini API. This is disclosed during onboarding.
- **Monetization:** Open source, audience-first. No paid tier initially.

## Architecture

Four main components:

### 1. Content Script (per-platform)

Injected into supported messaging pages. Responsibilities:

- Monitor text input fields for changes via MutationObserver and input events
- Detect when a message is ready to send (non-trivial content in the input)
- Send message text to the background service worker for analysis
- Render the trigger icon near the send button when a message is flagged
- Render the popup card (Shadow DOM) when the trigger is clicked
- Swap the selected rewrite back into the input field

### 2. Platform Adapters

Thin adapter layer per platform. Each adapter implements three methods:

- `findInputField()` — CSS selector to locate the compose/reply box
- `placeTriggerIcon()` — where to anchor the trigger icon relative to the send button
- `writeBack(text)` — how to set text in the input. This is a known hard problem: contentEditable divs, textareas, and React controlled inputs all behave differently. Known approaches include `document.execCommand('insertText')`, `InputEvent` with `inputType: 'insertText'`, and native event dispatch via `nativeInputValueSetter`. Each adapter must implement and test its own writeBack strategy. **This is a high-risk area requiring early prototyping.**
- `scrapeThreadContext()` — extract recent visible messages from the conversation thread for AI context. Returns an array of `{sender: 'self' | 'other', text: string}` ordered chronologically (oldest first, most recent last). Optional — adapters that can't reliably scrape return an empty array.

```
adapters/
  base.ts        — adapter interface + generic fallback
  gmail.ts       — Gmail compose window
  linkedin.ts    — LinkedIn messaging
  twitter.ts     — Twitter/X DMs
```

The generic fallback adapter finds contentEditable elements or textareas near a submit button. Only activates on domains the user explicitly enables in settings to avoid false positives (e.g., matching search bars or comment boxes on unrelated sites).

Platform detection: content script checks `window.location.hostname` and loads the appropriate adapter. Unknown domains get the fallback.

### 3. Background Service Worker

- Routes messages between content scripts and AI services
- Manages Gemini API calls with context caching
- Stores relationship profiles and settings via Chrome Storage API
- Handles rate limiting and response caching

### 4. Options/Settings Page

- Configure relationship types per contact or domain
- Set sensitivity level (low / medium / high)
- Gemini API key input
- Manage relationship profiles
- View flagging statistics

## AI Strategy

Three-tier analysis for speed and cost efficiency:

### Tier 0: Local Heuristic Filter (instant, always available)

A lightweight keyword/pattern scorer that runs synchronously in the content script. No AI required. This is the baseline that always works, even offline.

- Checks for: negative sentiment keywords, excessive punctuation (!!!), ALL CAPS, known passive-aggressive patterns ("fine.", "whatever", "per my last email")
- Input: the draft message text
- Output: score 0-1
- If score < 0.3: clean, no further analysis
- If score >= 0.3: escalate to Tier 1 (or Tier 2 if Tier 1 unavailable)

### Tier 1: Chrome On-Device AI (instant, free, optional)

Uses Chrome's built-in Prompt API for a quick tone check. This runs locally on the device with zero latency and zero API cost. **This tier is optional** — the Prompt API is still rolling out and many users won't have it. If unavailable, Tier 0 escalates directly to Tier 2.

- Input: the draft message text
- Output: binary flag (likely problematic / clean) with a confidence score
- If clean (confidence > 0.8): no flag, message passes through untouched
- If flagged or uncertain: escalate to Tier 2

### Tier 2: Gemini 2.5 Flash (fast, cheap)

Full analysis with context caching and streaming.

- Uses Gemini context caching to cache the system prompt + active relationship profile, reducing cost and latency for repeated calls in the same conversation
- Streams rewrite responses into the popup card for progressive display

**Input to Gemini:**
- The user's draft message
- Relationship context (type, sensitivity setting)
- Recent conversation history (last 5-10 visible messages, scraped from the thread)
- System prompt defining the analysis framework

**Structured JSON output:**
```json
{
  "should_flag": true,
  "risk_level": "low | medium | high",
  "issues": ["passive-aggressive tone", "dismissive of concern"],
  "explanation": "Human-readable explanation of why this was flagged",
  "rewrites": [
    { "label": "Warmer", "text": "..." },
    { "label": "Direct but kind", "text": "..." },
    { "label": "Minimal change", "text": "..." }
  ]
}
```

### Relationship-Specific Behavior

- **Romantic** — flags sarcasm, emotional dismissal, bringing up past arguments. Rewrites add empathy and validation.
- **Workplace** — flags passive-aggression, overly casual tone to superiors, unclear requests. Rewrites professionalize.
- **Family** — flags guilt-tripping, generational tension patterns. Rewrites de-escalate.

### When NOT to Flag

- Short affirmative messages ("ok", "sounds good", "thanks")
- Factual/logistical messages ("meeting at 3", "see attached")
- Messages that are already warm and clear

### Performance Targets

- Tier 0 (heuristic): < 5ms, synchronous
- Tier 1 (on-device): < 100ms for tone check (when available)
- Tier 2 (Gemini Flash): ~1-2s for full analysis with streamed rewrites
- Most messages are filtered out by Tier 0/1 and never hit the API

## Trigger Timing

Analysis does NOT run on every keystroke. The trigger point:

1. **Debounce:** Content script waits until the user pauses typing for **2 seconds**
2. **Minimum length:** Message must be at least 10 characters (skip "ok", "thanks", etc.)
3. **Tier 0 runs first:** The local heuristic filter runs synchronously. If it scores below 0.3, no further analysis — no icon, no API call.
4. **Tier 1/2 run async:** If Tier 0 flags the message, the background worker handles AI analysis. The trigger icon appears only after analysis completes and confirms the flag.
5. **Re-analysis on edit:** If the user modifies the message after the trigger icon appeared, the icon is removed, any in-flight Tier 2 API request is cancelled via `AbortController` (its results are discarded using a generation counter), and the debounce timer restarts.

This means:
- No flickering icon while typing mid-sentence
- No API calls for short/harmless messages
- The icon only appears when AI has actually analyzed the final draft

## UX Design

### Trigger Icon

A small badge that appears next to the send button only when a message is flagged. Styled per risk level:

- **Low risk:** subtle gray/blue badge
- **Medium risk:** orange badge with "Review tone" text
- **High risk:** red badge with "Review tone" text

Does not block sending. The user can always ignore it.

### Popup Card

Appears when the user clicks the trigger icon. Rendered in Shadow DOM for style isolation. Contains:

1. **Risk indicator** — colored dot + one-line summary (e.g., "Medium risk — might come across as dismissive")
2. **Original message** — displayed for reference
3. **AI explanation** — why this was flagged, in plain language
4. **Three rewrite options:**
   - Warmer — maximum empathy and warmth
   - Direct but kind — honest and clear without harshness
   - Minimal change — smallest edit to fix the issue
5. **Actions:**
   - Click a rewrite to accept (swaps into the input field)
   - "Send original" — dismiss and keep the original message
   - "Cancel" — close the popup without doing anything

### Design Principles

- Never block sending — always offer "send original"
- Always explain why — not just "this is bad" but what specifically could be misread
- Always offer multiple rewrite intensities — users have different comfort levels
- Minimal footprint — invisible when not needed

## Onboarding Flow

1. **Welcome screen** — brief explanation of what Reword does
2. **API key setup** — paste Gemini API key (with link to get one free)
3. **First relationship profile** — pick a platform, set default relationship type
4. **Sensitivity calibration** — show 3 example messages, ask which ones should be flagged. Sets sensitivity threshold.
5. **Done** — extension is active, 3-second animation showing how the trigger icon works

No account creation, no server, no sign-up.

## Error States and Degradation

- **Gemini API key invalid/expired:** Show inline error in popup card: "API key issue — check settings." Link to options page. Message sends normally (no blocking).
- **API unreachable / offline:** Skip analysis silently. No trigger icon appears. Extension is invisible when it can't help.
- **API rate limited:** Queue the request with exponential backoff. If still blocked after 5s, skip silently for this message.
- **Malformed API response:** Log the error for debugging. Show generic message in popup: "Couldn't analyze this message. Try again?" with a retry button.
- **Loading state:** When Tier 2 is running, the popup card shows a skeleton UI with a shimmer animation. Rewrites stream in progressively as they arrive.
- **On-device AI unavailable:** Tier 0 (heuristic) escalates directly to Tier 2 (Gemini). No user-visible change — just slightly more API calls.

## API Key Management

- **Validation on save:** When the user enters their API key in settings, make a test API call to validate it. Show success/error feedback immediately.
- **Quota display:** Show approximate usage count in the options page (tracked locally — number of Tier 2 calls this month).
- **Storage:** Key is stored in `chrome.storage.local`, which is unencrypted but scoped to the extension context. This is acceptable for a user-provided API key — documented in onboarding.

## Data Schema Versioning

All data in Chrome Storage includes a `schemaVersion` field. On extension update, a migration function runs in the service worker to transform stored data to the current schema version. Migrations are sequential (v1→v2→v3) and non-destructive (old data is backed up before migration).

**Top-level stored objects (v1):**
```typescript
interface StoredData {
  schemaVersion: number;
  settings: {
    geminiApiKey: string;
    sensitivity: 'low' | 'medium' | 'high';
    enabledDomains: string[];          // custom domains for fallback adapter
  };
  relationshipProfiles: {
    [domainOrContact: string]: {
      type: 'romantic' | 'workplace' | 'family';
      label: string;                    // user-defined label, e.g. "partner", "boss"
    };
  };
  stats: {
    totalAnalyzed: number;
    totalFlagged: number;
    rewritesAccepted: number;
    monthlyApiCalls: number;
    monthlyApiCallsResetDate: string;   // ISO date
  };
}
```

## Tech Stack

- **Language:** TypeScript
- **Extension format:** Chrome Manifest V3
- **UI isolation:** Shadow DOM (no CSS conflicts with host pages)
- **AI — on-device:** Chrome Prompt API / Summarizer API
- **AI — cloud:** Gemini 2.5 Flash via `@google/generative-ai` SDK
- **Storage:** Chrome Storage API (local)
- **Build:** Vite for fast bundling
- **Testing:** Vitest for unit tests, Playwright for extension E2E
- **No framework** — vanilla TypeScript, keeps bundle small
- **CSP compliance:** Manifest V3 enforces strict Content Security Policy. All styles use constructed stylesheets or CSS files (no inline styles in HTML). No dynamic script injection — popup card uses Shadow DOM with adopted stylesheets.

## Chrome Extension Permissions

```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://www.linkedin.com/*",
    "https://x.com/*",
    "https://twitter.com/*",
    "https://generativelanguage.googleapis.com/*"
  ]
}
```

The fallback adapter does NOT get broad host permissions. Users must explicitly add custom domains via the options page, which triggers a runtime permission request via `chrome.permissions.request()`.

**Platform ToS note:** Injecting content scripts and scraping DOM on Gmail, LinkedIn, and Twitter may conflict with those platforms' terms of service. This is an accepted risk for an open-source tool. The extension does not automate sending or scrape data for external storage.

## Testing Strategy

- **Unit tests (Vitest):** Adapter selectors and writeBack logic, prompt construction, Gemini response parsing, heuristic scorer, data migration functions
- **Integration tests (Vitest + mocks):** Full analysis pipeline with mocked Gemini API responses, popup card rendering and interaction in JSDOM
- **E2E tests (Playwright):** Load the extension in a real Chrome instance against mock HTML pages that replicate Gmail/LinkedIn/Twitter DOM structures (not live sites — avoids auth complexity and flakiness)
- **Gemini API mocking:** A `MockGeminiClient` that returns canned structured responses, used in both unit and integration tests

## Project Structure

```
reword/
  manifest.json
  src/
    background/
      service-worker.ts      — message routing, caching, rate limiting
      gemini-client.ts       — Gemini API wrapper, context caching, streaming
      ondevice-client.ts     — Chrome on-device AI wrapper
    content/
      index.ts               — content script entry, platform detection
      heuristic-scorer.ts    — Tier 0 keyword/pattern scorer
      observer.ts            — monitors input fields for changes
      trigger.ts             — renders/positions the trigger icon
      popup-card.ts          — Shadow DOM popup card component
    adapters/
      base.ts                — adapter interface + generic fallback
      gmail.ts
      linkedin.ts
      twitter.ts
    shared/
      types.ts               — shared types (RelationshipProfile, AnalysisResult, etc.)
      prompts.ts             — Gemini prompt templates per relationship type
    options/
      options.html           — settings page
      options.ts             — relationship profiles, sensitivity, API key config
  assets/
    icons/                   — extension icons (16, 48, 128px)
  tests/
    adapters/                — per-platform adapter tests
    gemini-client.test.ts    — prompt construction and response parsing
    ondevice-client.test.ts  — on-device AI integration
    popup-card.test.ts       — popup card rendering and interaction
```

## Data Flow

```
User types message → pauses for 2 seconds (debounce)
  → Content script checks minimum length (>= 10 chars)
  → Tier 0: Local heuristic scorer (synchronous, < 5ms)
    → Score < 0.3? Done, no flag.
    → Score >= 0.3? Continue.
  → Sends text + relationship context to background service worker
  → Tier 1: On-device AI tone check (if available)
    → Clean? Done, no flag.
    → Flagged or Tier 1 unavailable? Continue to Tier 2.
  → Tier 2: Gemini 2.5 Flash analysis (with context caching)
    → Returns structured analysis + 3 rewrites (streamed)
  → Content script shows trigger icon
  → User clicks trigger icon
  → Popup card appears with analysis and streamed rewrites
  → User picks a rewrite (or sends original)
  → Content script swaps text into input field
  → User sends message normally
```

## Open Questions

- **Multi-language support:** Gemini handles multilingual well, but the UI strings and prompt templates need i18n consideration for non-English users.
- **Sensitivity calibration mapping:** The onboarding step shows 3 example messages. Need to define exactly how user responses map to the low/medium/high sensitivity setting (simple mapping: 0/3 flagged = low, 1-2/3 = medium, 3/3 = high).
