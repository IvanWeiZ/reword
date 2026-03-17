# Recommended Improvements

Prioritized list of improvements for the Reword Chrome extension, based on a full codebase audit.

---

## High Priority

### 1. Enforce API timeout (`API_TIMEOUT_MS` is defined but never used)

`API_TIMEOUT_MS` (5000ms) is declared in `src/shared/constants.ts:7` but never referenced. Gemini API calls in `gemini-client.ts` can hang indefinitely.

**Fix:** Wrap the streaming call in `analyzeStreaming()` with `AbortSignal.timeout()`:

```ts
const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
const combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
```

Then check `combined` instead of `signal` in the streaming loop.

**Files:** `src/background/gemini-client.ts:39-49`, `src/shared/constants.ts:7`

---

### 2. Add tests for `src/content/index.ts` (main orchestration — zero coverage)

This is the highest-value untested file. It handles platform detection, debounce coordination, abort/cancellation, generation tracking, and message routing. A bug here silently breaks the entire extension.

**Suggested test cases:**
- `detectAdapter()` returns the correct adapter per hostname
- Generation tracking discards stale responses
- `AbortController` cancels in-flight requests on new input
- Heuristic scores below threshold hide the trigger
- `scrapeThreadContext()` result is forwarded to `analyze` message
- MutationObserver re-attaches when input fields change

---

### 3. Add tests for `src/options/options.ts` (settings page — zero coverage)

The options page has no tests despite handling API key validation, profile CRUD, domain management, and stats display. Bugs here silently corrupt user settings.

**Suggested test cases:**
- API key masking displays correctly
- Validate button delegates to service worker and shows status
- Adding/removing relationship profiles updates storage
- Adding duplicate domain is prevented
- Sensitivity change persists to storage

---

### 4. Unsafe property access in `src/content/index.ts:116`

```ts
if (input && input !== (observer as any)['element']) {
```

This casts to `any` to access a private property. If `InputObserver` is refactored, this breaks silently at runtime.

**Fix:** Add a public getter `InputObserver.currentElement` and use it instead.

**Files:** `src/content/index.ts:116`, `src/content/observer.ts`

---

### 5. Add tests for `src/shared/prompts.ts` (zero coverage)

Prompt construction drives the quality of AI analysis but has no tests. Changes to prompt templates could regress output format without anyone noticing.

**Suggested test cases:**
- Prompt includes the user's message text
- Relationship type and sensitivity are injected correctly
- Thread context messages are formatted and included
- Output JSON schema instructions are present

---

## Medium Priority

### 6. Complete adapter test coverage

Each adapter (`gmail.ts`, `linkedin.ts`, `twitter.ts`) is only partially tested. Missing:

| Method | Gmail | LinkedIn | Twitter |
|---|---|---|---|
| `findInputField()` | ✅ | ✅ | ✅ |
| `placeTriggerIcon()` | ✅ | ✅ | ✅ |
| `writeBack()` | ✅ | ❌ | ❌ |
| `scrapeThreadContext()` | ❌ | ❌ | ❌ |
| Cleanup function | ❌ | ❌ | ❌ |

Also missing: `src/adapters/base.ts` (GenericFallbackAdapter) has zero tests.

---

### 7. Add tests for `src/background/ondevice-client.ts` (zero coverage)

The on-device AI fallback (Tier 1) is completely untested. It uses the experimental `globalThis.ai` API with no error logging — failures are silent.

**Suggested test cases:**
- Returns `null` when `globalThis.ai` is unavailable
- Caches availability check result
- Parses valid JSON response correctly
- Returns `null` on malformed JSON
- Calls `session.destroy()` after use

---

### 8. Add input validation in options page

- **Domain names:** No format validation — user can enter anything (empty strings, spaces, special chars)
- **API key:** No format check before sending to Gemini for validation
- **Profile labels:** No length limit — could overflow UI
- **Error messages:** Generic "Error validating" doesn't tell user if it's a network issue, invalid key, or timeout

**Files:** `src/options/options.ts:117-138`

---

### 9. Improve error logging in background scripts

Several `catch` blocks silently swallow errors:

- `ondevice-client.ts:38` — returns `null`, no logging
- `ondevice-client.ts:13` — availability check fails silently
- `gemini-client.ts:77` — `validateApiKey()` returns `false` without logging the reason
- `options.ts:104` — shows "Error validating" without specifics

**Fix:** Add `console.warn()` calls with error details in each catch block to aid debugging.

---

### 10. `document.execCommand()` is deprecated

All adapters use `document.execCommand('insertText', false, text)` in `writeBack()`. This API is deprecated and could be removed in future Chrome versions.

**Fix:** Migrate to the modern `InputEvent`-based approach:

```ts
element.focus();
const event = new InputEvent('beforeinput', {
  inputType: 'insertText',
  data: text,
  bubbles: true,
  cancelable: true,
});
element.dispatchEvent(event);
```

Or use `navigator.clipboard.writeText()` + `document.execCommand('paste')` as an interim fallback.

**Files:** `src/adapters/base.ts`, `src/adapters/gmail.ts`, `src/adapters/linkedin.ts`, `src/adapters/twitter.ts`

---

## Low Priority

### 11. Fragile DOM selectors with no fallback

Platform adapters rely on hardcoded CSS selectors (e.g., `.btC .dC` for Gmail, `.msg-form__right-actions` for LinkedIn). When platforms update their UI, these break silently.

**Suggestions:**
- Add a `selectorHealth()` method to each adapter that logs warnings if expected elements are missing
- Consider multiple fallback selectors per element
- Add e2e tests that verify selectors against real page snapshots

---

### 12. Heuristic scorer could double-count patterns

In `src/content/heuristic-scorer.ts`, a message like `"WHATEVER!!!"` can match multiple regex patterns and keywords simultaneously, inflating the score. While `Math.min(1, score)` caps it, the relative scoring between messages is skewed.

**Fix:** Consider deduplicating matched patterns or using a weighted max instead of sum.

---

### 13. No storage schema migration path

`src/shared/storage.ts` has a `migrate()` function that's a no-op with a comment about future versions. When schema changes are needed, there's no tested migration path.

**Fix:** Write the migration framework now (even if v1→v2 migration doesn't exist yet) and add tests for the migration logic.

---

### 14. Missing e2e tests for full analysis flow

The Playwright e2e tests (`tests/e2e/`) verify basic DOM rendering but don't test the full analysis pipeline with mocked Gemini responses. Add e2e tests that:
- Type a message in a compose field
- Verify the trigger icon appears
- Click the trigger and verify the popup card
- Click a rewrite and verify it's written back

---

### 15. Type safety in service worker message handling

`src/background/service-worker.ts` uses `ExtendedMessage` that mixes `MessageToBackground` with an ad-hoc `validate-api-key` type. Message handler uses `as` casts instead of proper discriminated union narrowing.

**Fix:** Add `validate-api-key` to the `MessageToBackground` union in `src/shared/types.ts` and remove the `ExtendedMessage` workaround.
