---
status: ACTIVE
---

# Conversation Bodyguard — Design & Implementation Plan

Generated: 2026-03-21
Branch: master
Reviews: office-hours (10/10), CEO (clean), eng (clean), design (8/10)

## Vision

### 10x Check

The 10x version isn't just "block bar + AI results on more platforms." The 10x version is an invisible relationship-aware communication layer that sits between you and every message you send. It knows your relationships, learns your style, respects your intent, and only intervenes when it genuinely needs to. The block bar becomes just one surface — the bodyguard's intelligence permeates the entire writing experience.

Key elements of the 10x version:

- Unified notification system (not two bars)
- Keyboard-first interaction (you never touch the mouse during a block)
- Learning suppression (the bodyguard gets smarter about YOU)
- Undo safety net (zero-risk rewrite acceptance)
- Visual adaptation (dark mode, platform-native feel)
- 8-platform coverage (everywhere you type professionally)

### Approach Selected

**Unified Bar** (refinement of design doc's Approach B) — merge the MAIN-world block bar and isolated-world warning banner into one unified UI, rather than keeping them separate.

Rationale: Two bars doing similar things is an architectural smell. The user chose to fix this now rather than carry the debt. The unified bar eliminates the two-bar confusion permanently and creates a single, clean UX for "your message has a problem."

## Scope Decisions

| #   | Proposal                                             | Effort | Decision | Reasoning                                                              |
| --- | ---------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| 1   | Keyboard shortcuts (1/2/3 for rewrites, Esc to edit) | S      | ACCEPTED | Natural interaction — hands already on keyboard from hitting Enter     |
| 2   | Suppress blue banner when block bar active           | S      | ACCEPTED | Necessary hygiene for unified bar approach — avoids duplicate UI       |
| 3   | Undo rewrite (restore original draft)                | S      | ACCEPTED | Builds trust — users try rewrites more freely with safety net          |
| 4   | Dark mode for block bar                              | M      | ACCEPTED | Platform-native feel, especially important for Discord/Slack dark mode |
| 5   | Suppression list ("Don't flag this again")           | M      | ACCEPTED | Teaches the bodyguard the user's communication style                   |

## Accepted Scope (added to this plan)

From design doc (baseline):

- AI result feedback channel to MAIN-world block bar (upgraded to: unified bar)
- Recipient ID contract verification across all adapters
- React synthetic event investigation for Slack/Teams
- Platform validation for 5 new adapters (Slack, Teams, Discord, WhatsApp, Outlook)

Cherry-picked expansions:

- Keyboard shortcuts for block bar (1/2/3/Esc/Enter)
- Blue banner suppression when block bar active
- Undo rewrite with original text restoration
- Dark-mode-aware block bar (prefers-color-scheme detection)
- Per-user phrase suppression list ("Don't flag this again")

## Implementation Decisions (from Temporal Interrogation)

| Decision                                     | Choice                                             | Rationale                                                                |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Keyboard rewrite: auto-send or replace-only? | **Replace-only**                                   | Bodyguard shouldn't send without user review                             |
| Suppression scope                            | **Contact-scoped phrase**                          | Suppresses "per my last email" with colleague but still flags it with VP |
| Dark mode detection                          | **Cascade (media query + adapter `isDarkMode()`)** | Most accurate; natural extension of adapter pattern                      |
| Undo persistence                             | **Toast-style, 10 seconds**                        | Undo bar appears after rewrite, disappears after 10s                     |
| Bar auto-dismiss on edit                     | **Yes, except during ANALYZING state**             | Stale analysis shouldn't persist if text changes                         |

## Cherry-Pick Implementation Details

**Keyboard shortcuts:** Owned by `shadow-pierce.ts` (MAIN world). In `AI_RESULT_SHOWN` state, listen for keydown events: `1`/`2`/`3` → post `reword-apply-rewrite` with corresponding rewrite, `Escape` → unblock + focus input, `Enter` → send anyway. Must `stopImmediatePropagation` to prevent the keypress from entering the input field.

**Undo rewrite:** `shadow-pierce.ts` caches `originalText = cachedEditable.innerText` at intercept time (in `block()`). After a rewrite is accepted and the bar dismisses, show a toast-style "Undo" bar (simpler styling, auto-dismisses after 10s). Clicking "Undo" or pressing Ctrl+Z posts `reword-apply-rewrite` with the cached `originalText`. Undo state clears on next send attempt or page navigation.

**Suppression list:** Partial infrastructure already exists — check `Settings.suppressedPhrases` and `'suppress-phrase'` message type in the codebase. Extend to store `{ phrase: string, recipientId: string | null }` records. In `quickScore()`, check suppressions before scoring. Contact-scoped suppression: if `recipientId` matches, skip that phrase. Global suppression (null recipientId) skips everywhere.

**Dark mode:** Add `isDarkMode(): boolean` to `PlatformAdapter` interface. Default implementation: `window.matchMedia('(prefers-color-scheme: dark)').matches`. Platform overrides: Discord checks `html.theme-dark`, Slack checks `[data-color-mode="dark"]`, etc. Shadow-pierce.ts calls adapter's `isDarkMode()` when creating/showing the bar and adjusts CSS variables.

## Success Criteria

From design doc (unchanged):

- [ ] Block banner upgrades with AI-generated explanations, issue labels, and rewrite options
- [ ] `reword-ai-result` message channel works from isolated world to MAIN world
- [ ] Recipient ID contract verified across all adapters
- [ ] All 8 platform adapters work on live sites
- [ ] Existing tests pass; new tests cover AI send-blocking flow

Added for cherry-picks:

- [ ] Keyboard shortcuts (1/2/3/Esc/Enter) work in block bar
- [ ] Blue warning banner hidden when block bar is active
- [ ] Undo restores original text after rewrite acceptance
- [ ] Block bar adapts to dark mode on all platforms
- [ ] Contact-scoped phrase suppression prevents re-flagging

## Deferred to TODOS.md

- (none — all proposals accepted)

## Design Decisions (from /plan-design-review)

### Color System (CSS Custom Properties)

Light mode:

- `--reword-block-bg`: linear-gradient(135deg, #dc2626, #b91c1c)
- `--reword-block-text`: #ffffff
- `--reword-undo-bg`: #16a34a
- `--reword-rewrite-bg`: #ffffff / `--reword-rewrite-text`: #333333
- `--reword-diff-added`: rgba(34,197,94,0.2)
- `--reword-diff-removed`: rgba(153,27,27,0.3)
- `--reword-shield-bg`: rgba(220,38,38,0.08)

Dark mode (swap via media query + platform overrides):

- `--reword-block-bg`: linear-gradient(135deg, #991b1b, #7f1d1d)
- `--reword-block-text`: #fecaca
- `--reword-rewrite-bg`: #1f2937 / `--reword-rewrite-text`: #e5e7eb
- `--reword-shield-bg`: rgba(248,113,113,0.06)

### Undo Toast Visual Spec

```
┌──────────────────────────────────────────────────┐
│ ✓ Rewrite applied    [Undo]         ░░░░░░░ 8s  │
└──────────────────────────────────────────────────┘
```

- Fixed bottom, same position as block bar
- Success green (`--reword-undo-bg`)
- Progress bar shows remaining time (10s countdown)
- Auto-dismisses when timer completes
- `role="status"` + `aria-live="polite"`

### Zero/One Rewrite States

- **0 rewrites:** Show explanation + Edit/Send buttons only. No rewrite section.
- **1 rewrite:** Show it inline without numbering. Keyboard shortcut `1` still works.

### Animations

- Bar entry: slide up from bottom (`translateY(100%) → translateY(0)`, 200ms ease-out)
- Bar exit: fade out (opacity 1→0, 150ms)
- State transitions within bar: cross-fade content (150ms)

### Accessibility

- Bar: `role="alertdialog"`, `aria-modal="true"`, `aria-label="Send blocked - tone issue detected"`
- Focus moves to bar on show; focus trap cycles through rewrites → Edit → Send anyway
- Rewrite buttons: `aria-label="Accept [label] rewrite: [preview of text]"`
- Undo toast: `role="status"`, `aria-live="polite"`
- Touch targets ≥44px on mobile
- Keyboard hint: `Press 1-3 to select · Esc to edit · Enter to send anyway` (11px, 60% opacity, only shows after keyboard input)

### Responsive

- max-width: 800px centered (works all viewports)
- <480px: rewrite buttons stack vertically (already full-width)
- Keyboard shortcuts irrelevant on mobile; touch targets must be ≥44px

## Effort Estimate (revised)

- Human team: ~3-4 weeks
- CC+gstack: ~5-6 hours (increased for design specs + a11y)
- This is a lake, not an ocean — all scope is implementable in a single focused session
