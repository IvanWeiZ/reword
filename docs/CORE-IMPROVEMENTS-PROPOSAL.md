# Reword: Core Experience Improvements Proposal

**Author**: Alex (PM)
**Date**: 2026-03-17
**Status**: Proposal
**Guiding principle**: The founder wants "simple, most intuitive experience." Every recommendation below makes the core type-nudge-rewrite loop better. Nothing adds new surface area.

---

## Executive Summary

Reword has 14+ features layered onto a v0.2 product. The risk is not that any single feature is bad -- it is that the cumulative weight slows down the core loop, confuses new users, and creates false-positive fatigue that trains users to ignore the extension entirely.

These 6 improvements are ranked by impact on the metric that matters most: **rewrite acceptance rate** (rewrites accepted / flags shown). A high acceptance rate means we are flagging the right things and offering rewrites users actually prefer. A low one means we are annoying people.

---

## Current Feature Inventory and Audit

Before proposing improvements, here is what exists and what should stay, be simplified, or be removed:

| Feature | Verdict | Rationale |
|---|---|---|
| Heuristic scorer (Tier 0) | KEEP -- core | Fast local gate before any API call. Essential. |
| On-device AI (Tier 1) | KEEP -- core | Reduces false positives cheaply. |
| Gemini analysis + rewrites (Tier 2) | KEEP -- core | The product. |
| Inline diff on rewrites | KEEP -- core | Helps users trust the rewrite by seeing exactly what changed. |
| Undo toast after accepting rewrite | KEEP -- core | Safety net that increases willingness to accept. |
| Trigger icon with risk-level colors | KEEP -- core | The nudge mechanism. |
| Dark mode / theme support | SIMPLIFY | Auto-detect only. Remove the manual light/dark toggle from settings. One fewer decision. |
| Keyboard shortcuts (1-9, Esc, Enter) | SIMPLIFY | Good power-user feature but the shortcut hint bar adds visual noise. Hide it after the user has used a shortcut once. |
| Cooldown mode | DEFER/REMOVE | Novel idea but low evidence of value. It fires after 3 flags in 5 minutes, which is a very common scenario during a heated email exchange -- exactly when users are least receptive to "take a break" advice. Risk of annoying the user at the worst moment. Remove for now; revisit with data. |
| Conversation health score | DEFER/REMOVE | Requires 2+ analyzed messages in the same thread to show anything. Most threads will never trigger it. The in-memory-only storage means it resets on every page load. The UI adds a footer to every popup card. Cost > value today. Remove. |
| Incoming message analysis | KEEP but OFF by default (already is) | Useful for some users. The 5-second polling interval is aggressive and burns API calls. Acceptable as opt-in. |
| Custom regex patterns | SIMPLIFY | Power-user feature. Fine in settings but should not be a prominent section. |
| Rewrite personas | SIMPLIFY | Same -- useful but not core. Move below the fold in settings. |
| Relationship profiles | SIMPLIFY | Domain-level profiles are too coarse (all of linkedin.com = "workplace" is already the default). Per-contact would be useful but the current implementation does not support it. Simplify to just sensitivity override per domain. |
| Phrase suppression + learning mode | KEEP -- core | Critical for reducing false-positive fatigue. The "Don't flag this again" link is the most important escape valve. |
| Export/Import settings | KEEP | Low-cost, useful for power users. |
| Suppressed phrases management | KEEP | Necessary complement to suppression. |
| Tone history in options page | SIMPLIFY | Stats are fine. The detailed flag history with text snippets stored in chrome.storage is a privacy concern and adds storage pressure. Simplify to aggregate counts only. |

---

## Improvement 1: Eliminate the API Key Onboarding Wall

**Impact**: Critical -- this is the single biggest barrier to the "aha moment"
**Effort**: Medium (1-2 weeks)

### Problem

Today, a new user installs Reword and nothing happens until they:
1. Open the options page (how do they even know to do this?)
2. Find or create a Google AI Studio account
3. Generate an API key
4. Paste it in
5. Click validate
6. Go back to Gmail/LinkedIn/etc.

This is 6 steps before the product does anything. Most users will never complete this. The "aha moment" -- seeing your harsh message flagged and reading a kinder rewrite -- is buried behind account creation on an external service.

### Recommendation

Provide a bundled default experience that works without an API key. Two options, in order of preference:

**Option A (preferred)**: Ship a Reword-hosted proxy with a rate-limited free tier (e.g., 20 analyses/day). The user installs the extension, types a rough message, and sees the magic immediately. Prompt for their own API key only after they hit the free tier limit or in the options page for power users.

**Option B (simpler)**: If a proxy is out of scope, show a first-run welcome overlay on the first page load that says: "Reword needs a Gemini API key to work. Here is how to get one in 30 seconds (free)." Include a direct link to https://aistudio.google.com/apikey and an inline input field right in the overlay -- do not send them to the options page. Validate the key inline and dismiss the overlay. One screen, not six steps.

Either way, the heuristic scorer (Tier 0) already works without an API key. Today it gates silently -- the trigger icon never appears because the analysis pipeline bails out at Tier 2. Instead, when no API key is set and the heuristic flags a message, show a simplified trigger that says "This might sound harsh -- add an API key to get rewrite suggestions." This turns the heuristic into a teaser that motivates setup.

### Success metric

- Time from install to first rewrite shown: target < 3 minutes (Option A) or < 5 minutes (Option B)
- Setup completion rate: target > 60% of installs

---

## Improvement 2: Reduce False Positives in the Heuristic Scorer

**Impact**: High -- false positives are the #1 reason users disable tone-checking tools
**Effort**: Small (3-5 days)

### Problem

The heuristic scorer (`heuristic-scorer.ts`) has several patterns that will fire on perfectly normal messages:

1. **"good for you"** (weight 0.3) -- this is a common sincere phrase, not just sarcasm. "That promotion is so good for you" should not flag.
2. **"I think" / "maybe" / "possibly"** -- hedging detection fires at 3+ hedging phrases, but professional communication is full of hedging. "I think maybe we should possibly revisit this" is cautious, not passive-aggressive. The threshold of 3 is too low for workplace messages.
3. **"fine." at end of message** (weight 0.35) -- "The design looks fine." is a legitimate response. The heuristic only checks for `fine.\s*$` but cannot distinguish "That's fine." (neutral) from "Fine." (curt).
4. **Excessive punctuation** (weight 0.3 for `?!` or `!!`) -- "Really?!" and "Great news!!" are enthusiastic, not hostile.
5. **ALL CAPS** (weight 0.3 for >50% uppercase) -- Legitimate for short messages like "LGTM" or "FYI" or "ASAP."

The threshold is 0.3, meaning any single one of these patterns alone triggers an API call. The whole purpose of Tier 0 is to cheaply filter OUT non-problematic messages. If it lets too many through, users burn API calls and see flags on benign messages, eroding trust.

### Recommendation

1. **Raise the heuristic threshold from 0.3 to 0.4.** A single weak signal should not trigger analysis. Require either one strong signal or two weak ones.
2. **Add message-length gating to ambiguous patterns.** "Fine." as a complete message (< 15 chars) is suspicious. "The schedule looks fine." (> 30 chars) almost certainly is not. Gate `fine.\s*$`, `good for you`, and hedging detection on message length.
3. **Exempt common acronyms from ALL CAPS detection.** If the message is under 10 words and all-caps, check against a shortlist (LGTM, FYI, ASAP, TBD, WFH, OOO, etc.) before scoring.
4. **Raise hedging threshold from 3 to 4**, and only apply it when sensitivity is "high." At medium/low sensitivity, hedging alone should not flag.
5. **Add a "question-only" exemption.** Messages that are purely questions (end with `?`, no declarative sentences) are almost never passive-aggressive. They are requests for information.

### Success metric

- False positive rate (flags dismissed or "send original" clicked / total flags shown): target < 30%
- API calls saved by better heuristic filtering: target 20%+ reduction

---

## Improvement 3: Remove Conversation Health Score and Cooldown Mode

**Impact**: High (by subtraction -- removing complexity from the core popup)
**Effort**: Small (2-3 days)

### Problem

The popup card currently renders up to 7 distinct UI zones:
1. Cooldown banner (conditional)
2. Risk indicator
3. Original message
4. "Why was this flagged?" expandable
5. Issues explanation
6. Rewrite options with inline diff
7. Action buttons (Send original / Cancel)
8. "Don't flag this again" link
9. Conversation health footer (conditional)

That is a lot of UI for a popup that needs to communicate one thing: "Your message might land wrong. Here are better versions." The cooldown banner and health footer are the lowest-signal, highest-noise elements.

**Cooldown mode** fires after 3 analyses in 5 minutes. But 3 messages in 5 minutes is completely normal in Slack or WhatsApp. The feature conflates "writing quickly" with "writing angrily." It shows a dismissible banner that adds visual weight to every subsequent popup in the session once dismissed.

**Conversation health score** requires 2+ analyzed messages in the same thread (rare), stores nothing across page loads (so it resets constantly), and when it does appear, it shows a score out of 100 that the user has no mental model for. What does "Thread health: 72/100" mean? What should the user do differently?

### Recommendation

Remove both features entirely. Delete `cooldown.ts` and `conversation-health.ts`. Remove the cooldown banner and health footer from `popup-card.ts`. This simplifies the popup to its essential elements: flag, explain, offer rewrites, let the user act.

If we want to bring back the "you're sending a lot of flagged messages" concept later, do it as a browser notification after the session, not as an inline banner that competes with the rewrite options for attention.

### Success metric

- Popup card visual height reduced by ~20%
- No regression in rewrite acceptance rate (expect improvement from less visual noise)

---

## Improvement 4: Make the Popup Card Show Rewrites First, Explanation Second

**Impact**: High -- directly increases rewrite acceptance rate
**Effort**: Small (2-3 days)

### Problem

The current popup layout is:

```
[Risk indicator: "Medium risk -- could be read as dismissive"]
[Your message: original text block]
[Why was this flagged? (collapsed)]
[Issues: "Passive-aggressive phrasing. Dismissive tone."]
[Rewrite 1]
[Rewrite 2]
[Rewrite 3]
[Shortcut hints]
[Send original | Cancel]
[Don't flag this again]
```

The user has to scroll past their own message (which they just wrote and already know) and the explanation (which they may not care about) before they see the rewrites. The rewrites are the product. They should be the first thing the user sees after the one-line flag.

### Recommendation

Restructure the popup layout to:

```
[Risk indicator: "Medium risk -- could be read as dismissive" ]
[Rewrite 1 -- click to apply]
[Rewrite 2 -- click to apply]
[Rewrite 3 -- click to apply]
[Send original | Cancel]
["Why was this flagged?" expandable -- contains original text + explanation + issues]
["Don't flag this again"]
```

Key changes:
- **Rewrites move to the top**, immediately below the one-line risk summary.
- **Original text and explanation collapse into the expandable section.** The user already knows what they wrote. If they want to understand why it was flagged, they can expand.
- **"Send original" stays visible** so the user never feels trapped.
- **Remove the shortcut hint bar by default.** Show it once on the first popup, then hide it. Store a flag in chrome.storage.

This reduces the default popup height by roughly 40% and puts the actionable content (rewrites) above the fold.

### Success metric

- Rewrite acceptance rate increase: target +15% relative lift
- Time from popup shown to user action (accept/dismiss/close): target < 5 seconds median

---

## Improvement 5: Batch the Settings Fetches in the Analysis Pipeline

**Impact**: Medium -- reduces latency of the core loop
**Effort**: Small (1-2 days)

### Problem

In `content/index.ts`, the `onAnalyze` callback makes 3 sequential async round-trips to the service worker before even starting the Gemini API call:

```
1. check-suppressed  (async message to background)
2. get-profile       (async message to background)
3. get-settings      (async message to background)
4. analyze           (async message to background -> Gemini API)
```

Each `chrome.runtime.sendMessage` round-trip involves serialization, IPC, a `loadStoredData()` call that reads from `chrome.storage.local`, and deserialization back. On a typical machine this is 5-15ms per round-trip. Three sequential calls add 15-45ms of latency before the user sees "Analyzing your message..."

Additionally, `get-settings` is called twice -- once at init time and once per analysis. The init-time call already fetches the full `StoredData` object.

### Recommendation

1. **Merge the three pre-analysis messages into one.** Create a new message type `pre-analyze` that takes `{ textSnippet, domain }` and returns `{ suppressed, profile, settings }` in a single round-trip. This cuts 2 IPC calls per analysis.

2. **Cache settings in the content script.** The settings (sensitivity, personas, theme, custom patterns) change rarely -- only when the user visits the options page. Listen for `chrome.storage.onChanged` in the content script and update a local cache. This eliminates the `get-settings` call entirely for the hot path.

3. **Move the `showStreaming()` call before the suppression check.** Currently the user sees nothing while the 3 pre-checks run. Show "Analyzing..." immediately after the heuristic passes. If the message turns out to be suppressed, just hide the indicator. The brief flash is better than perceived lag.

### Success metric

- Time from keystroke-stop to "Analyzing..." indicator: target < 100ms (currently ~2050ms = 2000ms debounce + 50ms IPC)
- Time from keystroke-stop to rewrite shown: target 15-30% reduction in the post-debounce portion

---

## Improvement 6: Simplify the Options Page

**Impact**: Medium -- reduces cognitive load for new users and aligns with "simple" mandate
**Effort**: Small (2-3 days)

### Problem

The options page has 10 sections:

1. Gemini API Key
2. Sensitivity
3. Theme
4. Analyze Incoming Messages
5. Relationship Profiles
6. Custom Patterns
7. Rewrite Personas
8. Suppressed Phrases
9. Custom Domains
10. Usage Stats
11. Tone History
12. Data (Export/Import)

A new user who just installed the extension sees all 12 sections at once. Most of them are irrelevant until the user has been using the product for weeks. The page communicates "this is a complicated tool" when the founder wants "simple, most intuitive."

### Recommendation

Split the options page into two tiers:

**Essential settings (always visible):**
1. API Key (with inline validation -- keep as-is)
2. Sensitivity (keep as-is)

**Advanced settings (collapsed by default, expandable):**
- Everything else, behind a single "Advanced settings" toggle

Additionally:
- **Remove the Theme selector entirely.** Use auto-detect only (OS preference + platform dark mode detection, which already works). The `detectPlatformDarkMode()` function in `dark-mode-detect.ts` covers all platforms. Two fewer options.
- **Remove Tone History from the options page.** The `recentFlags` array stores text snippets of flagged messages in `chrome.storage`. This is a privacy liability with no clear user value -- users do not go back to review their past flagged messages. Keep aggregate stats (totalAnalyzed, totalFlagged, rewritesAccepted) but stop storing `textSnippet` and `issues` per flag.
- **Rename "Relationship Profiles" to "Platform sensitivity."** Drop the "romantic/workplace/family" type selector (which controls the AI prompt). Instead, just let users set per-domain sensitivity overrides (low/medium/high). The AI prompt should always use the `workplace` framing unless we have strong signal that a different framing helps -- and we do not have that signal yet.

### Success metric

- Options page section count reduced from 12 to 5 (2 essential + 3 advanced)
- Time to complete first-time setup: target < 60 seconds

---

## Summary: Ranked by Impact

| Rank | Improvement | Impact | Effort | Core metric affected |
|---|---|---|---|---|
| 1 | Eliminate the API key onboarding wall | Critical | M | Install-to-aha time |
| 2 | Reduce heuristic false positives | High | S | False positive rate |
| 3 | Remove cooldown mode + health score | High | S | Popup clarity, acceptance rate |
| 4 | Rewrites-first popup layout | High | S | Rewrite acceptance rate |
| 5 | Batch settings fetches | Medium | S | Perceived latency |
| 6 | Simplify options page | Medium | S | Setup completion, cognitive load |

Total estimated effort: 3-4 weeks for one engineer. Improvements 2-6 could ship in a single sprint. Improvement 1 depends on whether we go with the proxy approach (more work) or the in-page onboarding overlay (less work).

---

## What We Are Explicitly NOT Doing

| Idea | Why not |
|---|---|
| Adding more platforms | 9 platforms is already broad. Depth > breadth right now. |
| Adding analytics dashboard | Creates a "second product" that needs its own maintenance. Keep stats minimal. |
| Adding team/org features | Enterprise is a different product. Stay focused on individual users. |
| Building a mobile app | Chrome extension only. The platforms we support are desktop-first. |
| Adding more rewrite styles | 3 default rewrites is the right number. Custom personas exist for power users. |
| Gamification (streaks, badges) | Tone improvement is not a game. Users who get fewer flags are succeeding, not "earning points." |

---

## Next Steps

1. Validate false positive rate with current heuristic by instrumenting dismiss/accept ratio (can be done with existing stats infrastructure).
2. Decide on Improvement 1 approach (proxy vs. overlay) -- this is a business decision, not a technical one.
3. Ship Improvements 2-4 as a single "core quality" release.
4. Ship Improvement 5-6 as a follow-up.
5. Measure rewrite acceptance rate before and after to validate the changes worked.
