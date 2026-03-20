<div align="center">

# Reword

**Catch the tone. Keep the message.**

AI-powered tone checker that flags passive-aggression, dismissiveness, and harshness in your messages — and offers kinder rewrites before you hit Send.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](manifest.json)
[![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen.svg)](#testing)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](tsconfig.json)

![Demo](demo/demo.gif)

</div>

---

## Why Reword?

A single harsh email can derail a project, damage a relationship, or ruin someone's day.

- **70% of employees** say poor communication is their top source of workplace stress ([Grammarly, 2023](https://www.grammarly.com/business/learn/state-of-business-communication/))
- Miscommunication costs businesses an estimated **$12,506 per employee per year**
- The message you _meant_ to sound efficient often _reads_ as cold, dismissive, or passive-aggressive

We've all hit Send and instantly regretted it. Reword gives you a 2-second safety net — a quiet nudge that says _"hey, this might land wrong"_ and three ways to fix it, without changing what you actually want to say.

No account. No server. No judgment. Just better communication.

---

## Features

|                             | Feature                | Details                                                                                                                      |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| :globe_with_meridians:      | **6 Platforms**        | Gmail, LinkedIn, Twitter/X, Slack, Discord + generic fallback for any site                                                   |
| :brain:                     | **3-Tier AI**          | Local heuristics (< 5ms) &#8594; Chrome on-device AI &#8594; Gemini 2.5 Flash. Most messages never hit the paid API          |
| :lock:                      | **Privacy-First**      | No account, no server, no data leaves your browser. Your API key, your rules                                                 |
| :people_holding_hands:      | **Relationship-Aware** | Configure per-domain contexts: _workplace_, _romantic_, _family_. The AI rewrites differently for your partner vs. your boss |
| :incoming_envelope:         | **Incoming Analysis**  | Optionally analyze messages you _receive_ to understand the tone before reacting                                             |
| :art:                       | **Dark Mode**          | Popup card respects OS/site dark theme automatically                                                                         |
| :jigsaw:                    | **Custom Patterns**    | Add your own trigger phrases and suppression lists                                                                           |
| :bust_in_silhouette:        | **Tone Personas**      | Beyond Warmer / Direct / Minimal — define custom rewrite styles                                                              |
| :keyboard:                  | **Keyboard Shortcuts** | Accept rewrites instantly with `Alt+1`, `Alt+2`, `Alt+3`                                                                     |
| :leftwards_arrow_with_hook: | **Undo Support**       | Changed your mind? Restore the original draft with one click                                                                 |
| :shield:                    | **Never Blocks You**   | Always shows "Send original". You're in control                                                                              |

---

## Quick Start

**1. Clone and build**

```bash
git clone https://github.com/IvanWeiZ/reword.git
cd reword && npm install && npm run build
```

**2. Load into Chrome**

Open `chrome://extensions/` > toggle **Developer mode** on > click **Load unpacked** > select the `dist/` folder.

**3. Add your API key**

Right-click the Reword icon > **Options** > paste your free [Gemini API key](https://aistudio.google.com/apikey) > click **Validate**.

**4. Try it**

Open Gmail, compose a message, and type:

> _"Whatever, per my last email I already covered this."_

Wait 2 seconds. The **Review tone** badge appears. Click it to see three rewrites:

```
  Warmer     "I know I mentioned this before — happy to recap
              the key points if that helps."

  Direct     "I covered this in my last email. Let me know
              if you'd like me to resend it."

  Minimal    "As mentioned in my last email, this was already
              addressed."
```

Pick one, or send the original. Your call.

---

## How It Works

```
  You type a message in Gmail / LinkedIn / Twitter / Slack / Discord
                              |
                              v
                 ┌──────────────────────┐
                 │   Content Script      │
                 │                       │
                 │  InputObserver        │  Watches input, debounces (2s)
                 │       |               │
                 │  Tier 0: Heuristic    │  Local regex + keyword scoring (< 5ms)
                 │       |               │
                 │  score < 0.3? ──STOP  │  Most messages end here. Zero cost.
                 │       |               │
                 │  TriggerIcon ⚠️       │  "Review tone" badge near Send
                 └───────┬───────────────┘
                         │ chrome.runtime.sendMessage
                         v
                 ┌──────────────────────┐
                 │   Service Worker      │
                 │                       │
                 │  Tier 1: On-device AI │  Chrome built-in AI (free, optional)
                 │       |               │
                 │  confident? ──DONE    │  Returns analysis + rewrites
                 │       |               │
                 │  Tier 2: Gemini API   │  Gemini 2.5 Flash with streaming
                 │       |               │
                 │  PopupCard ← results  │  3 rewrite options + risk assessment
                 └──────────────────────┘
```

The three tiers cascade: each one only fires if the previous tier isn't confident enough. For most messages, everything resolves locally in under 5 milliseconds with zero network calls.

For a deep dive into the architecture, read **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**.

---

## Development

### [ ] Prerequisites

- Chromium-based browser (Chrome, Edge, Brave, Arc)
- Node.js 18+
- A free [Gemini API key](https://aistudio.google.com/apikey)

### [ ] Dev Workflow

```bash
# Terminal 1: rebuild on every file save
npm run dev

# Terminal 2: run tests in watch mode
npm run test:watch
```

After changes, go to `chrome://extensions/` and click the refresh icon on the Reword card.

### [ ] Available Scripts

| Command                | Description                 |
| ---------------------- | --------------------------- |
| `npm run dev`          | Build in watch mode         |
| `npm run build`        | Production build to `dist/` |
| `npm test`             | Run all unit tests once     |
| `npm run test:watch`   | Tests in watch mode         |
| `npm run test:e2e`     | Playwright end-to-end tests |
| `npm run lint`         | ESLint check                |
| `npm run lint:fix`     | ESLint with auto-fix        |
| `npm run format`       | Format with Prettier        |
| `npm run format:check` | Check formatting            |

### [ ] Testing

All 42 unit tests use [Vitest](https://vitest.dev/) with jsdom — no browser needed. E2E tests use [Playwright](https://playwright.dev/) with a real Chromium instance.

Key test areas:

| Test file                                 | Coverage                                          |
| ----------------------------------------- | ------------------------------------------------- |
| `tests/content/heuristic-scorer.test.ts`  | Tone scoring (passive-aggression, ALL CAPS, etc.) |
| `tests/content/observer.test.ts`          | Debounce + generation counter                     |
| `tests/background/gemini-client.test.ts`  | JSON parsing + code fence stripping               |
| `tests/background/service-worker.test.ts` | Message routing + tier orchestration              |
| `tests/adapters/*.test.ts`                | Per-platform DOM selectors                        |

### [ ] Project Structure

```
src/
  adapters/           # Platform-specific DOM adapters (Gmail, LinkedIn, Twitter, Slack, Discord)
  background/         # Service worker: AI orchestration, Gemini client, on-device AI
  content/            # Content script: observer, heuristic scorer, trigger badge, popup card
  options/            # Settings page (API key, sensitivity, relationship profiles)
  shared/             # Types, constants, storage wrapper, AI prompt templates
tests/
  mocks/              # Chrome storage mocks, DOM fixtures, Gemini client mock
docs/
  HOW_IT_WORKS.md     # In-depth architecture guide
  ROADMAP.md          # Feature roadmap
```

### [ ] Adding a New Platform

1. Create `src/adapters/yourplatform.ts` implementing the `PlatformAdapter` interface:
   - `findInputField()` — locate the compose box
   - `placeTriggerIcon()` — pin the badge near Send
   - `writeBack(text)` — replace the input text
   - `scrapeThreadContext()` — return recent messages (or `[]`)
2. Register it in `src/content/index.ts`
3. Add host permissions and content script matches in `manifest.json`
4. Create a DOM fixture in `tests/mocks/mock-dom-fixtures/` and write adapter tests

### [ ] Tuning the AI

**Heuristic scorer** (`src/content/heuristic-scorer.ts`): Add regex patterns to `PASSIVE_AGGRESSIVE_PATTERNS` (+0.35 each) or keywords to `NEGATIVE_KEYWORDS` (+0.2 each). Threshold: `HEURISTIC_THRESHOLD = 0.3`.

**Gemini prompts** (`src/shared/prompts.ts`): The `buildAnalysisPrompt()` function assembles prompts from relationship type, sensitivity level, draft text, and thread context. Response schema is in `src/background/gemini-client.ts`.

---

## Roadmap

A few things coming next — see the full list in **[docs/ROADMAP.md](docs/ROADMAP.md)**:

- **Multi-language support** — Spanish, French, Mandarin, and more
- **Thread-aware rewrites** — de-escalate ongoing tension, not just single messages
- **Claude and OpenAI backends** — choose your preferred AI provider
- **Local LLM support** — Ollama for fully offline, fully private analysis
- **Firefox and Safari** — cross-browser support
- **Plugin API** — add platforms and rules without forking

---

## Contributing

Contributions are welcome. Here's the short version:

1. Fork the repo, create a feature branch
2. Write tests first (TDD encouraged)
3. Make sure `npm test` and `npm run lint` pass
4. Open a pull request

Check [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines, and browse existing issues for good first tasks.

---

## License

[MIT](LICENSE) — use it, fork it, ship it. Just keep the license file.

Built with care by contributors who believe the internet could use a little more kindness.
