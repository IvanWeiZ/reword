# How Reword Works — A Guide for New Engineers

Welcome to Reword! This document explains how the entire system works, from the moment a user types a message to the moment a rewrite suggestion appears. No prior knowledge of Chrome extensions required.

---

## What Reword Does (in one sentence)

Reword is a Chrome extension that watches you type a message, quietly decides if it might cause a fight, and — if so — offers you kinder ways to say the same thing before you hit Send.

---

## The Big Picture

```
You type a message
       │
       ▼
  Content Script                ← runs inside the webpage (Gmail, LinkedIn, etc.)
  (src/content/)
       │
       │  "hey, analyze this text"
       ▼
  Background Service Worker     ← runs in the background, owns the AI logic
  (src/background/)
       │
       ├─ Tier 0: Local heuristic (instant, no network)
       ├─ Tier 1: Chrome on-device AI (fast, free, optional)
       └─ Tier 2: Gemini 2.5 Flash API (1-2 seconds, costs money)
       │
       │  "flagged: medium risk, here are 3 rewrites"
       ▼
  Content Script shows trigger icon + popup card
       │
       ▼
  You pick a rewrite (or ignore it and send the original)
```

That's the whole system. Everything else is details about how each piece works.

---

## Part 1: Chrome Extension Basics

If you've never built a Chrome extension, here's the minimum you need to know.

### Three contexts, three scripts

A Chrome extension runs code in three completely separate environments. They can't share variables — they communicate by sending messages.

| Context | File | What it can do |
|---|---|---|
| **Content Script** | `content.js` | Runs *inside* the webpage. Can read and modify the page's HTML. |
| **Background Service Worker** | `service-worker.js` | Runs in the background. Can make network requests (Gemini API). Persists between tabs. |
| **Options Page** | `options/options.html` | A regular webpage that opens when the user clicks "Options". |

Think of the content script as the eyes and hands (it sees the page and can touch it), and the service worker as the brain (it does the thinking).

### How they talk

They use `chrome.runtime.sendMessage()` to pass messages. In this codebase:

```typescript
// Content script sends a message to the service worker
const response = await chrome.runtime.sendMessage({ type: 'analyze', text: 'whatever...' });

// Service worker receives it in service-worker.ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // "I'll respond async"
});
```

All message types are defined in `src/shared/types.ts` as `MessageToBackground` and `MessageFromBackground`. If you want to add a new message type, that's the file to edit.

### The manifest

`manifest.json` is the extension's config file. The key parts:

```json
"content_scripts": [{ "matches": ["https://mail.google.com/*", ...], "js": ["content.js"] }]
```
→ Chrome automatically injects `content.js` into Gmail, LinkedIn, Twitter pages.

```json
"background": { "service_worker": "service-worker.js" }
```
→ Chrome runs `service-worker.js` in the background.

```json
"host_permissions": ["https://generativelanguage.googleapis.com/*"]
```
→ Allows the service worker to call the Gemini API.

---

## Part 2: The Content Script

**Location:** `src/content/`

This is what runs inside the user's Gmail tab. It has five main jobs.

### 1. Detect the platform and load an adapter

```typescript
// src/content/index.ts
function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  return new GenericFallbackAdapter();
}
```

The adapter is a thin wrapper that knows Gmail-specific things like "the compose box is `div[role='textbox'][g_editable='true']`". All adapters implement the same `PlatformAdapter` interface (`src/shared/types.ts`), so the rest of the code doesn't care which platform it's on.

If you want to add support for a new platform (say, Slack), you create `src/adapters/slack.ts`, implement the four methods, and add a line here.

### 2. Watch for typing (the Observer)

```typescript
// src/content/observer.ts
const observer = new InputObserver({
  debounceMs: 2000,      // wait 2 seconds after the user stops typing
  minLength: 10,         // ignore "ok" and "thanks"
  onAnalyze: async (text) => { /* ... */ },
});
observer.observe(inputField);
```

`InputObserver` listens for `input` events on the compose box. It waits until you've paused typing for 2 seconds, then fires `onAnalyze`. This prevents us from calling the AI on every single keystroke.

**Generation counter:** Every time you type something, `observer.generation` increments. When the analysis comes back from the AI, we check if the generation still matches. If you edited the text while the AI was thinking, we discard the stale result.

### 3. Tier 0 — the local heuristic scorer

Before anything hits the network, `scoreMessage()` runs:

```typescript
// src/content/heuristic-scorer.ts
const score = scoreMessage(text);
if (score < 0.3) {
  // Clean. Do nothing. No API call.
  return;
}
```

It checks for passive-aggressive patterns (`"whatever"`, `"per my last email"`), negative keywords (`"hate"`, `"stupid"`), ALL CAPS, and excessive punctuation. This filters out the vast majority of normal messages so we never pay for an API call on `"sounds good"` or `"meeting at 3"`.

### 4. Send to the service worker for AI analysis

If Tier 0 flags something, the content script asks the background service worker to analyze it:

```typescript
const response = await sendMessage({
  type: 'analyze',
  text,
  context: adapter.scrapeThreadContext(), // recent messages from the thread
  relationshipType: profile?.type ?? 'workplace',
  sensitivity: settings?.sensitivity ?? 'medium',
});
```

It also fetches the user's relationship profile for this domain first (e.g., Gmail → `romantic`, LinkedIn → `workplace`).

### 5. Show the trigger icon and popup card

If the service worker comes back with `shouldFlag: true`:

```typescript
trigger.show(response.result.riskLevel);  // shows the orange "Review tone" badge
triggerCleanup = adapter.placeTriggerIcon(trigger.element); // pins it near Send
```

When the user clicks the badge, the `PopupCard` appears with the explanation and 3 rewrite options. If the user picks a rewrite, `adapter.writeBack(text)` swaps the text back into the compose box.

---

## Part 3: The Background Service Worker

**Location:** `src/background/`

The service worker is the brain. It handles AI logic, storage, and API calls. The main entry point is `handleMessage()` in `service-worker.ts`.

### The three AI tiers

When an `analyze` message arrives, the service worker runs three tiers in order:

```
Tier 0: heuristic scorer        (runs in content script, never reaches here)
Tier 1: Chrome on-device AI     ← ondevice-client.ts
Tier 2: Gemini 2.5 Flash        ← gemini-client.ts
```

**Tier 1 — on-device AI (`src/background/ondevice-client.ts`):**
Chrome ships a built-in language model on some devices (it's an origin trial, still rolling out). If it's available, we ask it for a quick yes/no: "is this message problematic?". If it says no with high confidence (> 0.8), we stop here. No Gemini call needed. Free and instant.

```typescript
const ondeviceResult = await ondevice.checkTone(text);
if (ondeviceResult && !ondeviceResult.shouldFlag && ondeviceResult.confidence > 0.8) {
  return { type: 'analysis-result', result: { shouldFlag: false, ... } };
}
```

**Tier 2 — Gemini (`src/background/gemini-client.ts`):**
The full analysis. We build a detailed prompt that includes:
- The draft message
- The relationship type and sensitivity level
- Recent messages from the thread (for context)

The prompt is in `src/shared/prompts.ts`. It instructs Gemini to return structured JSON with the risk level, issues, and 3 rewrites. We use `generateContentStream()` so rewrites appear progressively in the popup card.

```typescript
// gemini-client.ts
const streamResult = await model.generateContentStream({ ... });
let fullText = '';
for await (const chunk of streamResult.stream) {
  fullText += chunk.text();
  onStream(fullText);  // updates the popup card as text arrives
}
return parseAnalysisResponse(fullText);
```

`parseAnalysisResponse()` validates the JSON structure and maps snake_case fields (`should_flag`) to camelCase (`shouldFlag`).

---

## Part 4: Storage

**Location:** `src/shared/storage.ts`

All data lives in `chrome.storage.local` — it's per-device, never synced, never sent to a server. The shape is defined in `StoredData` (`src/shared/types.ts`):

```typescript
interface StoredData {
  schemaVersion: number;        // for migrations when we change the schema
  settings: {
    geminiApiKey: string;       // user's Gemini API key
    sensitivity: 'low' | 'medium' | 'high';
    enabledDomains: string[];   // custom domains for the fallback adapter
  };
  relationshipProfiles: {
    [domain: string]: {         // e.g. { 'mail.google.com': { type: 'romantic', label: 'partner' } }
      type: 'romantic' | 'workplace' | 'family';
      label: string;
    };
  };
  stats: { ... };               // usage counters
}
```

`loadStoredData()` handles two things automatically:
1. **Schema migration** — if the stored data has an older `schemaVersion`, it merges with defaults
2. **Monthly counter reset** — if the month has rolled over, `monthlyApiCalls` resets to 0

---

## Part 5: The Options Page

**Location:** `src/options/`

A standard HTML page (`options.html`) with a TypeScript file (`options.ts`) for logic. Nothing fancy — it reads from and writes to `chrome.storage.local` using the same `loadStoredData`/`saveStoredData` functions.

One notable design decision: when the user validates their API key, instead of importing the Gemini SDK directly (blocked by Manifest V3's Content Security Policy), we send a message to the service worker:

```typescript
// options.ts
const response = await chrome.runtime.sendMessage({ type: 'validate-api-key', apiKey: key });
```

The service worker makes a test API call and sends back `{ valid: true/false }`.

---

## Part 6: File Map

```
reword/
├── manifest.json                   ← extension config (permissions, entry points)
├── vite.config.ts                  ← builds src/ → dist/, copies HTML/assets
├── vitest.config.ts                ← test config (jsdom environment)
│
├── src/
│   ├── shared/
│   │   ├── types.ts                ← ALL shared types — start here when confused
│   │   ├── constants.ts            ← thresholds, defaults, schema version
│   │   ├── storage.ts              ← read/write chrome.storage.local
│   │   └── prompts.ts              ← Gemini prompt templates
│   │
│   ├── content/                    ← runs inside the webpage
│   │   ├── index.ts                ← entry point, wires everything together
│   │   ├── observer.ts             ← watches input field with debounce
│   │   ├── heuristic-scorer.ts     ← Tier 0: local keyword scorer
│   │   ├── trigger.ts              ← the "Review tone" badge
│   │   └── popup-card.ts           ← the rewrite popup
│   │
│   ├── background/                 ← runs in the background
│   │   ├── service-worker.ts       ← message router + AI orchestration
│   │   ├── gemini-client.ts        ← Tier 2: Gemini 2.5 Flash
│   │   └── ondevice-client.ts      ← Tier 1: Chrome on-device AI
│   │
│   ├── adapters/                   ← platform-specific DOM knowledge
│   │   ├── base.ts                 ← PlatformAdapter interface + generic fallback
│   │   ├── gmail.ts
│   │   ├── linkedin.ts
│   │   └── twitter.ts
│   │
│   └── options/                    ← settings page
│       ├── options.html
│       ├── options.ts
│       └── options.css
│
├── tests/
│   ├── shared/                     ← storage tests
│   ├── content/                    ← observer, heuristic, trigger, popup card tests
│   ├── background/                 ← gemini client, service worker tests
│   ├── adapters/                   ← per-platform adapter tests
│   ├── mocks/
│   │   ├── mock-chrome-storage.ts  ← in-memory chrome.storage mock for tests
│   │   ├── mock-gemini-client.ts   ← canned AI responses for tests
│   │   └── mock-dom-fixtures/      ← HTML fixtures that mimic Gmail/LinkedIn/Twitter DOM
│   └── e2e/                        ← Playwright end-to-end tests (not yet implemented)
│
└── docs/
    ├── HOW_IT_WORKS.md             ← you are here
    └── superpowers/
        ├── specs/                  ← design spec (the "why" behind decisions)
        └── plans/                  ← implementation plan
```

---

## Part 7: Full Message Flow (step by step)

Here's what happens when you type `"Whatever, I guess that's fine."` in Gmail and pause:

1. **`observer.ts`** — detects `input` event, starts 2-second debounce timer, increments `generation` to 1.

2. **`observer.ts`** — 2 seconds pass. Calls `onAnalyze("Whatever, I guess that's fine.")`.

3. **`index.ts`** — cancels any in-flight `AbortController`, creates a new one, sets `thisGeneration = 1`.

4. **`heuristic-scorer.ts`** — `scoreMessage()` runs. Matches `/\bwhatever\b/i` (score += 0.35) and `/\bI guess\b.*\b(works|fine|so|whatever)\b/i` (score += 0.35). Total: 0.7. Above threshold (0.3). Continue.

5. **`index.ts`** — sends `{ type: 'get-profile', domain: 'mail.google.com' }` to service worker. Gets back `{ type: 'profile', profile: { type: 'romantic', label: 'partner' } }`.

6. **`index.ts`** — sends `{ type: 'get-settings' }`. Gets back sensitivity = `'medium'`.

7. **`index.ts`** — calls `adapter.scrapeThreadContext()` to get the last few messages from the Gmail thread.

8. **`index.ts`** — sends `{ type: 'analyze', text: '...', context: [...], relationshipType: 'romantic', sensitivity: 'medium' }` to service worker.

9. **`service-worker.ts`** — receives the message in `handleMessage()`, enters the `analyze` case.

10. **`ondevice-client.ts`** — asks Chrome's built-in AI: "is this problematic?" If unavailable or uncertain, skip to Tier 2.

11. **`gemini-client.ts`** — calls `analyzeStreaming()`. Builds a prompt via `prompts.ts` with the romantic relationship instructions. Calls `model.generateContentStream()`.

12. **`gemini-client.ts`** — as chunks arrive, calls `onStream(partialText)` (currently a no-op — streaming to the popup card is a future improvement). Accumulates full response text.

13. **`gemini-client.ts`** — calls `parseAnalysisResponse()` on the final text. Returns:
    ```json
    { "shouldFlag": true, "riskLevel": "medium", "explanation": "Might come across as dismissive", "rewrites": [...] }
    ```

14. **`service-worker.ts`** — updates stats (`totalAnalyzed++`, `totalFlagged++`), returns `{ type: 'analysis-result', result: {...} }`.

15. **`index.ts`** — checks `thisGeneration === generation` (still 1, so not stale). Calls `trigger.show('medium')`.

16. **`trigger.ts`** — renders the orange "Review tone" badge. `adapter.placeTriggerIcon()` appends it next to Gmail's Send button.

17. **User clicks the badge.** `trigger.ts` fires the `onClick` callback.

18. **`index.ts`** — calls `popup.show(result, originalText)`.

19. **`popup-card.ts`** — renders the card: risk indicator, original message, AI explanation, 3 rewrite options, "Send original" button.

20. **User clicks "Direct but kind".** `popup-card.ts` calls `onRewrite(rewrites[1].text)`.

21. **`index.ts`** — calls `adapter.writeBack(newText)`. The text in the Gmail compose box is replaced.

22. **User hits Send.** Gmail sends the nicer version.

---

## Part 8: How to Run Locally

```bash
# 1. Clone and install
cd /Users/weizheng/Documents/projects/reword
npm install

# 2. Run tests
npm test
# Expected: 42/42 passing

# 3. Build the extension
npm run build
# Output goes to dist/

# 4. Load in Chrome
# Open chrome://extensions/
# Enable "Developer mode" (top right toggle)
# Click "Load unpacked" → select the dist/ folder

# 5. Get a Gemini API key
# Go to https://aistudio.google.com/apikey
# Create a free key

# 6. Set the API key
# Right-click the Reword icon → Options
# Paste your key → click Validate

# 7. Test it
# Open Gmail, compose a message, type something passive-aggressive
# e.g., "Whatever, per my last email I already covered this."
# Wait 2 seconds — the "Review tone" badge should appear
```

---

## Part 9: Adding a New Platform

Want to add support for Slack? Here's exactly what to do:

1. **Create `src/adapters/slack.ts`** and implement the 4 methods:
   - `findInputField()` — return the Slack message input element
   - `placeTriggerIcon()` — place the badge near the Send button
   - `writeBack()` — put the rewritten text back in the input
   - `scrapeThreadContext()` — return recent messages (or `[]`)

2. **Add the adapter to `src/content/index.ts`**:
   ```typescript
   import { SlackAdapter } from '../adapters/slack';
   // in detectAdapter():
   if (host === 'app.slack.com') return new SlackAdapter();
   ```

3. **Add host permissions to `manifest.json`**:
   ```json
   "host_permissions": ["https://app.slack.com/*"]
   ```

4. **Add a DOM fixture for tests** in `tests/mocks/mock-dom-fixtures/slack-message.html`.

5. **Add tests** in `tests/adapters/slack.test.ts`.

---

## Part 10: Key Design Decisions (and why)

**Why 3 tiers of AI?**
Most messages are harmless. Running Gemini on every message would be slow and expensive. Tier 0 (heuristic) filters out ~95% of messages in < 5ms for free. Tier 1 (on-device) handles borderline cases for free. Only genuinely suspicious messages reach Tier 2 (paid API).

**Why sender-side only?**
We only intercept messages the user is about to send, not messages they receive. This avoids consent issues (the other person never installed anything) and keeps the privacy model simple.

**Why no server?**
Zero infrastructure to maintain, zero data breaches possible, zero trust needed. Everything lives in `chrome.storage.local`. The user brings their own API key.

**Why `AbortController` + generation counter?**
Without these, if you typed a message, waited for analysis, then edited the message, you could see a stale rewrite popup for the old text. The generation counter ensures we discard results that arrived after the user edited. `AbortController` cancels the in-flight network request to save API quota.

**Why platform adapters instead of generic DOM scraping?**
Gmail, LinkedIn, and Twitter all have different DOM structures, and they change frequently. Isolating the platform-specific knowledge in one file per platform means that when Gmail changes their DOM (and they will), you only touch `src/adapters/gmail.ts`.
