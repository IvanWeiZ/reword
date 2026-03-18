# CLAUDE.md — Reword

## Project Overview

Reword is a Chrome extension (Manifest V3) that detects problematic tone (passive-aggression, dismissiveness, harshness) in messages on Gmail, LinkedIn, and Twitter/X, and offers AI-powered kinder rewrites before sending. Built with TypeScript, Vite, and Vitest.

## Commands

```bash
npm run build        # Build to dist/ (3 bundles: service-worker, content, options)
npm run dev          # Build in watch mode
npm test             # Run all unit tests once (vitest run)
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run Playwright e2e tests (requires Chromium)
npm run lint         # Run ESLint on src/ and tests/
npm run lint:fix     # Run ESLint with auto-fix
npm run format       # Format code with Prettier
npm run format:check # Check formatting without writing
```

## Architecture

### [ ] Three runtime contexts (Chrome extension)

1. **Content script** (`src/content/`) — Injected into Gmail/LinkedIn/Twitter pages. Observes user input, runs heuristic scoring, shows trigger badge and popup card.
2. **Service worker** (`src/background/`) — Handles AI analysis via message passing. Orchestrates tiered AI: Tier 0 (heuristic) → Tier 1 (on-device AI) → Tier 2 (Gemini API).
3. **Options page** (`src/options/`) — Settings UI for API key, sensitivity, relationship profiles.

### [ ] Key directories

```
src/
  adapters/       # Platform-specific DOM adapters implementing PlatformAdapter interface
  background/     # Service worker, Gemini client, on-device AI client
  content/        # Content script: observer, heuristic scorer, trigger badge, popup card
  options/        # Options page (HTML/CSS/TS)
  shared/         # Types, constants, storage wrapper, AI prompt templates
tests/
  mocks/          # Chrome storage mocks, DOM fixtures, Gemini client mock
docs/
  HOW_IT_WORKS.md # In-depth architecture guide for new engineers
```

### [ ] Message passing

Content script ↔ Service worker communication uses `chrome.runtime.sendMessage()`. Message types are defined in `src/shared/types.ts` as `MessageToBackground` and `MessageFromBackground` discriminated unions.

### [ ] Adapter pattern

Each platform (Gmail, LinkedIn, Twitter) has an adapter in `src/adapters/` implementing the `PlatformAdapter` interface: `findInputField()`, `placeTriggerIcon()`, `writeBack()`, `scrapeThreadContext()`. A generic fallback adapter exists in `base.ts`.

## Code Conventions

- **TypeScript strict mode** — all code must pass `strict: true`
- **ES2022 target** with ESM modules (`"type": "module"`)
- **Naming**: camelCase for functions/variables, PascalCase for classes/interfaces/types, kebab-case for CSS classes (prefixed with `reword-`)
- **Conventional commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, etc.
- **ESLint + Prettier** — run `npm run lint` and `npm run format:check` before committing
- **Minimal dependencies** — only runtime dependency is `@google/generative-ai`

## Key Constants (`src/shared/constants.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `DEBOUNCE_MS` | 2000 | Wait after user stops typing before analyzing |
| `MIN_MESSAGE_LENGTH` | 10 | Minimum chars to trigger analysis |
| `HEURISTIC_THRESHOLD` | 0.3 | Local heuristic score threshold (0-1) |
| `ONDEVICE_CONFIDENCE_THRESHOLD` | 0.8 | On-device AI confidence cutoff |
| `API_TIMEOUT_MS` | 5000 | Gemini API call timeout |

## Testing

- Tests live in `tests/` mirroring the `src/` structure
- Environment: jsdom (configured in `vitest.config.ts`)
- Mocks for Chrome storage, DOM fixtures (Gmail/LinkedIn/Twitter HTML), and Gemini client in `tests/mocks/`
- E2e tests in `tests/e2e/` use Playwright with a real Chromium instance loading the built extension
- Always run `npm test` and `npm run lint` to verify changes pass before committing

## Build Output

Vite produces three bundles in `dist/`:
- `service-worker.js` — Background service worker
- `content.js` — Content script injected into pages
- `options.js` — Options page script

Plus copies of `manifest.json`, `options/options.html`, `options/options.css`, and `assets/icons/`.

## Adding a New Platform

1. Create adapter in `src/adapters/` implementing `PlatformAdapter`
2. Add hostname detection in `src/content/index.ts`
3. Add host permission in `manifest.json`
4. Add content script match pattern in `manifest.json`
5. Create DOM fixture in `tests/mocks/mock-dom-fixtures/` and write adapter tests
