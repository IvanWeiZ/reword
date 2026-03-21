# TODOS

## P3: Sync heuristic patterns between shadow-pierce.ts and heuristic-scorer.ts

**What:** Create a build-time script that generates shared pattern constants from a single source of truth, so both MAIN-world `quickScore()` and isolated-world `scoreMessage()` stay in sync.

**Why:** Currently patterns are duplicated (`shadow-pierce.ts` lines 19-42 and `heuristic-scorer.ts`) and could drift. The suppression list expansion makes the divergence worse — MAIN world has suppression awareness but isolated world does not.

**Pros:** Single source of truth for heuristic patterns. Bugs fixed once. Pattern changes only need one edit.

**Cons:** Adds build complexity. Requires custom Vite plugin or prebuild script. MAIN world can't import ES modules, so patterns must be inlined at build time.

**Context:** MAIN world constraint means `shadow-pierce.ts` runs before any page scripts and cannot use ES imports. The two scorers serve slightly different purposes (MAIN = fast send gate, isolated = pre-AI typing analysis), but share ~90% of the same regex patterns. A build-time codegen step would extract patterns from a shared JSON/TS file and inline them into both outputs.

**Effort:** M (human: ~4 hours / CC: ~20 min)
**Depends on:** Nothing
