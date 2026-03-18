# Reword

> Flag problematic messages and get kinder rewrites before you hit Send.

Reword is an open-source Chrome extension that watches you type in Gmail, LinkedIn, and Twitter DMs. When it detects passive-aggression, dismissiveness, or harsh tone, it places a subtle **"Review tone"** badge near the Send button. Click it to see AI-powered rewrites — Warmer, Direct but kind, or Minimal change — and swap one in with a single click.

Your messages never touch a server. Everything runs locally or through your own Gemini API key.

---

## Demo

```
You type:  "Whatever, per my last email I already covered this."

Reword:    ⚠️ Review tone

           Medium risk — passive-aggressive, dismissive of recipient

           💚 Warmer       "I know I mentioned this before — happy to recap the key points if that helps."
           💬 Direct       "I covered this in my last email. Let me know if you'd like me to resend it."
           ✏️ Minimal      "As mentioned in my last email, this was already addressed."

           [Send original]   [Cancel]
```

---

## Features

- **Works where you already message** — Gmail, LinkedIn, Twitter/X DMs
- **Three AI tiers** — local keyword filter → Chrome on-device AI → Gemini 2.5 Flash. Most messages never hit the paid API.
- **Relationship-aware** — configure contexts per domain: romantic, workplace, or family. The AI rewrites differently for your partner vs. your boss.
- **Never blocks you** — always shows "Send original". You're in control.
- **Privacy-first** — no account, no server, no data stored outside your browser
- **Open source** — MIT licensed

---

## Getting Started

### [ ] Prerequisites

- Chrome, Edge, Brave, or Arc (Chromium-based browser)
- Node.js 18+
- A free [Gemini API key](https://aistudio.google.com/apikey)

### [ ] Install from source

```bash
# 1. Clone the repo
git clone <repo-url>
cd reword

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build
```

### [ ] Load into Chrome

1. Open `chrome://extensions/`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### [ ] Configure your API key

1. Right-click the Reword icon → **Options**
2. Paste your [Gemini API key](https://aistudio.google.com/apikey) and click **Validate**
3. Optionally set relationship profiles (e.g., `mail.google.com` → Romantic)

### [ ] Try it

Open Gmail, compose a message, and type something like:

> `Whatever, I guess that works. Not like I had plans or anything.`

Wait 2 seconds — the **Review tone** badge should appear next to the Send button.

---

## Development

### [ ] Project structure

```
reword/
├── src/
│   ├── shared/          # Types, constants, storage, Gemini prompts
│   ├── content/         # Content script (runs inside the webpage)
│   │   ├── index.ts     # Entry point — wires everything together
│   │   ├── observer.ts  # Watches the input field with debounce
│   │   ├── heuristic-scorer.ts  # Fast local tone check (no API)
│   │   ├── trigger.ts   # "Review tone" badge
│   │   └── popup-card.ts        # Rewrite popup card
│   ├── background/      # Service worker (AI logic, storage)
│   │   ├── service-worker.ts    # Message router + AI orchestration
│   │   ├── gemini-client.ts     # Gemini 2.5 Flash with streaming
│   │   └── ondevice-client.ts   # Chrome built-in AI (optional)
│   ├── adapters/        # Platform-specific DOM knowledge
│   │   ├── base.ts      # Interface + generic fallback
│   │   ├── gmail.ts
│   │   ├── linkedin.ts
│   │   └── twitter.ts
│   └── options/         # Settings page
├── tests/               # Vitest unit tests + DOM fixtures
├── docs/
│   └── HOW_IT_WORKS.md  # In-depth architecture guide
├── manifest.json
└── dist/                # Built output (git-ignored)
```

For a deep dive into how everything connects, read **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**.

### [ ] Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build in watch mode — rebuilds on every file save |
| `npm run build` | Production build → `dist/` |
| `npm test` | Run all unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |

### [ ] Development workflow

```bash
# Terminal 1: rebuild on save
npm run dev

# Terminal 2: run tests in watch mode
npm run test:watch
```

After any code change, go to `chrome://extensions/` and click the **↺ refresh** icon on the Reword card to reload the extension.

### [ ] Running tests

```bash
npm test
```

All 42 unit tests should pass. Tests use [Vitest](https://vitest.dev/) with a jsdom environment — no browser needed.

Key test files:

| File | What's tested |
|---|---|
| `tests/content/heuristic-scorer.test.ts` | Tone scoring (passive-aggression, ALL CAPS, etc.) |
| `tests/content/observer.test.ts` | Debounce + generation counter |
| `tests/background/gemini-client.test.ts` | JSON parsing + code fence stripping |
| `tests/background/service-worker.test.ts` | Message routing + tier orchestration |
| `tests/adapters/*.test.ts` | Per-platform DOM selectors |

### [ ] Adding a new platform

1. Create `src/adapters/yourplatform.ts` implementing 4 methods:
   - `findInputField()` — locate the compose box
   - `placeTriggerIcon()` — pin the badge near Send
   - `writeBack(text)` — replace the input text
   - `scrapeThreadContext()` — return recent messages (or `[]`)

2. Register it in `src/content/index.ts`:
   ```typescript
   import { YourPlatformAdapter } from '../adapters/yourplatform';
   if (host === 'yourplatform.com') return new YourPlatformAdapter();
   ```

3. Add host permissions in `manifest.json`:
   ```json
   "host_permissions": ["https://yourplatform.com/*"]
   ```

4. Add a DOM fixture in `tests/mocks/mock-dom-fixtures/` and write tests.

### [ ] Changing the AI prompts

Prompts live in `src/shared/prompts.ts`. The `buildAnalysisPrompt()` function assembles the Gemini prompt from:
- Relationship-specific instructions (`romantic` / `workplace` / `family`)
- Sensitivity instructions (`low` / `medium` / `high`)
- The draft message and optional thread context

The expected response format is structured JSON — see `parseAnalysisResponse()` in `src/background/gemini-client.ts` for the schema.

### [ ] Changing the heuristic scorer

The local scorer (`src/content/heuristic-scorer.ts`) is intentionally simple — regex patterns and keyword lists. No ML, no network. To tune it:

- Add patterns to `PASSIVE_AGGRESSIVE_PATTERNS` (each match adds 0.35 to score)
- Add keywords to `NEGATIVE_KEYWORDS` (each match adds 0.2)
- Threshold is `HEURISTIC_THRESHOLD = 0.3` in `src/shared/constants.ts`

---

## Architecture Overview

```
Chrome Tab (Gmail, LinkedIn, Twitter)
│
├── content.js  ←──────────────────────────────────────────────────┐
│   ├── InputObserver (debounce 2s)                                │
│   ├── Tier 0: heuristic scorer (< 5ms, no network)              │
│   ├── TriggerIcon                                                │
│   └── PopupCard                                                  │
│         │  chrome.runtime.sendMessage                            │
│         ▼                                                        │
├── service-worker.js                                              │
│   ├── Tier 1: Chrome on-device AI (optional, free)              │
│   ├── Tier 2: Gemini 2.5 Flash (streaming)                      │
│   └── chrome.storage.local (settings, profiles, stats)          │
│                                                                  │
└── options.html ────────────────────────────────────────────────-┘
    ├── API key management
    ├── Relationship profiles
    └── Sensitivity settings
```

Full explanation with step-by-step message flow: **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**

---

## Contributing

1. Fork the repo and create a feature branch
2. Write tests first (TDD)
3. Make sure `npm test` passes
4. Open a pull request

---

## License

MIT
