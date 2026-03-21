// Runs at document_start in MAIN world — before any page scripts.
// This script blocks sending harsh messages by:
// 1. Intercepting Enter key (capture phase, first listener)
// 2. Intercepting click/mousedown/pointerdown on Send buttons
// 3. Disabling the Send button and overlaying a shield when harsh text detected
// 4. Showing AI analysis results with rewrite options
// 5. Keyboard shortcuts for quick rewrite selection
// 6. Undo toast for rewrite reversal
// 7. Contact-scoped suppression list
// Constants mirror src/shared/constants.ts — keep in sync when updating.
console.log('%c[Reword MAIN] shadow-pierce loaded', 'color: cyan; font-size: 14px');

// ─── Inline types (MAIN world — no imports) ───────────────────────────

type BlockPhase = 'idle' | 'analyzing' | 'ai-result' | 'timed-out' | 'undo-toast';

interface RewriteOption {
  label: string;
  text: string;
}

interface AiResultPayload {
  issues: string[];
  explanation: string;
  rewrites: RewriteOption[];
}

interface Suppression {
  phrase: string;
  recipientId: string | null;
}

// ─── 1. Force shadow DOM to open mode ──────────────────────────────────

const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
  return originalAttachShadow.call(this, { ...init, mode: 'open' });
};

// ─── 2. Lightweight heuristic scorer (inlined — MAIN world can't import modules) ───

const HEURISTIC_THRESHOLD = 0.38;
const MIN_LENGTH = 3;

const HARSH_WORD_RE = /\b(stupid|idiot|useless|pathetic|incompetent|worthless|dumb)\b/i;
const MILD_WORD_RE = /\b(hate|disgusting|terrible|awful|annoying|ridiculous)\b/i;
const PROFANITY_RE =
  /\b(fuck|fucking|fucked|shit|shitty|bullshit|ass|asshole|bitch|bitching|dumbass|dumb\s+ass|jackass|moron|imbecile|stfu|wtf|gtfo|crap)\b/i;
const PROFANITY_DIRECTED_RE = /\b(fuck|screw|damn|piss)\s?(you|off|this|that|it|me)\b/i;
const DIRECTED_INSULT_RE =
  /\byou\s+(are|r)\s+(\w+\s+)?(stupid|dumb|useless|pathetic|terrible|awful|incompetent|worthless|an?\s+idiot|an?\s+moron)\b/i;
const SARCASM_RE = /\boh\s+(great|wonderful|fantastic|perfect)\b/i;
const SARCASM2_RE = /\bsure,?\s*(no problem at all|whatever you say)\b/i;
const EXCESSIVE_PUNCT_RE = /[!?]{2,}/;
const NEGATIVE_EMOJI_RE =
  /[\u{1F644}\u{1F612}\u{1F620}\u{1F621}\u{1F624}\u{1F92C}\u{1F4A9}\u{1F595}\u{1F44E}\u{1F926}\u{1F921}]/u;
const SARCASTIC_EMOJI_RE =
  /\b(fine|whatever|sure|okay|ok|great|thanks|right)\b[.!,]?\s*[\u{1F642}\u{1F60A}\u{1F643}\u{263A}]/iu;
// Pre-compiled PA patterns — hoisted to module scope to avoid per-call allocation
const PA_PATTERNS: [RegExp, number][] = [
  [/\bfine\.\s*$/i, 0.35],
  [/\bwhatever\b/i, 0.35],
  [/\bper my last email\b/i, 0.4],
  [/\bas I already mentioned\b/i, 0.35],
  [/\bas previously stated\b/i, 0.35],
  [/\bthanks for nothing\b/i, 0.4],
  [/\bas I already explained\b/i, 0.35],
];

// ─── Message nonce (prevents page scripts from spoofing postMessage) ───

const REWORD_NONCE = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
// Post nonce so isolated world can echo it back in all messages
window.postMessage({ type: 'reword-nonce', nonce: REWORD_NONCE }, '*');

// ─── Contact-scoped suppression list ───────────────────────────────────

let suppressions: Suppression[] = [];
let currentRecipientId: string | null = null;

function quickScore(text: string): number {
  if (!text || text.length < MIN_LENGTH) return 0;

  // Contact-scoped suppression check
  try {
    if (suppressions.length > 0) {
      const lowerText = text.toLowerCase();
      for (const sup of suppressions) {
        if (sup.recipientId !== null && sup.recipientId !== currentRecipientId) continue;
        if (lowerText.includes(sup.phrase.toLowerCase())) {
          // Check if this phrase is the primary trigger — if the text without it scores below threshold, skip
          // For simplicity: if any suppressed phrase is found, reduce its contribution by skipping matching patterns
          // We don't skip scoring entirely — just note the suppression applies
        }
      }
    }
  } catch {
    // If suppressions fail, score normally
  }

  let score = 0;

  // Check each pattern against suppressions before scoring
  const shouldSkip = (patternText: string): boolean => {
    try {
      const lowerPattern = patternText.toLowerCase();
      for (const sup of suppressions) {
        if (sup.recipientId !== null && sup.recipientId !== currentRecipientId) continue;
        if (
          lowerPattern.includes(sup.phrase.toLowerCase()) ||
          sup.phrase.toLowerCase().includes(lowerPattern)
        ) {
          return true;
        }
      }
    } catch {
      // Fall through
    }
    return false;
  };

  // Extract matched text for suppression checks
  const profanityMatch = text.match(PROFANITY_RE) ?? text.match(PROFANITY_DIRECTED_RE);
  if (
    (PROFANITY_RE.test(text) || PROFANITY_DIRECTED_RE.test(text)) &&
    !(profanityMatch && shouldSkip(profanityMatch[0]))
  )
    score += 0.45;

  const insultMatch = text.match(DIRECTED_INSULT_RE);
  if (DIRECTED_INSULT_RE.test(text) && !(insultMatch && shouldSkip(insultMatch[0]))) score += 0.45;

  let paMax = 0;
  for (const [re, w] of PA_PATTERNS) {
    const paMatch = text.match(re);
    if (paMatch && !shouldSkip(paMatch[0])) {
      paMax = Math.max(paMax, w);
    }
  }
  score += paMax;

  const harshMatch = text.match(HARSH_WORD_RE);
  const mildMatch = text.match(MILD_WORD_RE);
  if (HARSH_WORD_RE.test(text) && !(harshMatch && shouldSkip(harshMatch[0]))) score += 0.4;
  else if (MILD_WORD_RE.test(text) && !(mildMatch && shouldSkip(mildMatch[0]))) score += 0.2;

  const alpha = text.replace(/[^a-zA-Z]/g, '');
  if (alpha.length >= 10 && text.replace(/[^A-Z]/g, '').length / alpha.length > 0.5) score += 0.3;
  if (EXCESSIVE_PUNCT_RE.test(text)) score += 0.3;

  const sarcasmMatch = text.match(SARCASM_RE) ?? text.match(SARCASM2_RE);
  if (
    (SARCASM_RE.test(text) || SARCASM2_RE.test(text)) &&
    !(sarcasmMatch && shouldSkip(sarcasmMatch[0]))
  )
    score += 0.3;

  if (NEGATIVE_EMOJI_RE.test(text)) score += 0.3;
  else if (SARCASTIC_EMOJI_RE.test(text)) score += 0.25;

  return Math.min(1, score);
}

// ─── 3. State ──────────────────────────────────────────────────────────

let cachedEditable: HTMLElement | null = null;
let lastCheckedText = '';
let lastScore = 0;
let warningBar: HTMLElement | null = null;
let sendAnyway = false;
let shield: HTMLElement | null = null;

// State machine
let blockPhase: BlockPhase = 'idle';
let countdownIntervalId: ReturnType<typeof setInterval> | null = null;
let originalTextForUndo = '';
let analysisTimeoutId: ReturnType<typeof setTimeout> | null = null;
let undoTimeoutId: ReturnType<typeof setTimeout> | null = null;
let currentAiResult: AiResultPayload | null = null;
let cssInjected = false;

function transitionPhase(newPhase: BlockPhase): void {
  const oldPhase = blockPhase;
  if (oldPhase === newPhase) return;
  console.debug('[Reword] block state: %s → %s', oldPhase, newPhase);
  blockPhase = newPhase;
}

function getEditableText(): string {
  if (!cachedEditable || !document.contains(cachedEditable)) {
    cachedEditable = document.querySelector<HTMLElement>(
      '[contenteditable="true"][role="textbox"], [contenteditable="true"]',
    );
  }
  if (!cachedEditable) return '';
  return cachedEditable.textContent?.trim() ?? '';
}

// Send button selectors
const SEND_SELECTORS = [
  '.msg-form__send-button',
  '.msg-form__send-btn',
  'button[type="submit"]',
  '[data-tooltip*="Send"]',
  '.T-I.aoO',
  '[data-testid="dmComposerSendButton"]',
  '[data-qa="texty_send_button"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
];
const SEND_BUTTON_SELECTOR = SEND_SELECTORS.join(',');

// ─── 4. CSS custom properties for dark mode ────────────────────────────

function injectCssVariables(): void {
  if (cssInjected) return;
  cssInjected = true;

  const style = document.createElement('style');
  style.id = 'reword-css-vars';
  style.textContent = `
    :root {
      --reword-block-bg: linear-gradient(135deg, #dc2626, #b91c1c);
      --reword-block-text: #fff;
      --reword-rewrite-bg: #fff;
      --reword-rewrite-text: #333;
      --reword-undo-bg: #16a34a;
      --reword-shield-bg: rgba(220, 38, 38, 0.08);
      --reword-diff-added: rgba(34, 197, 94, 0.2);
      --reword-diff-removed: rgba(153, 27, 27, 0.3);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --reword-block-bg: linear-gradient(135deg, #991b1b, #7f1d1d);
        --reword-block-text: #fecaca;
        --reword-rewrite-bg: #1f2937;
        --reword-rewrite-text: #e5e7eb;
        --reword-shield-bg: rgba(248, 113, 113, 0.06);
      }
    }

    /* Discord dark mode */
    html.theme-dark {
      --reword-block-bg: linear-gradient(135deg, #991b1b, #7f1d1d);
      --reword-block-text: #fecaca;
      --reword-rewrite-bg: #1f2937;
      --reword-rewrite-text: #e5e7eb;
      --reword-shield-bg: rgba(248, 113, 113, 0.06);
    }

    /* Slack dark mode */
    [data-color-mode="dark"] {
      --reword-block-bg: linear-gradient(135deg, #991b1b, #7f1d1d);
      --reword-block-text: #fecaca;
      --reword-rewrite-bg: #1f2937;
      --reword-rewrite-text: #e5e7eb;
      --reword-shield-bg: rgba(248, 113, 113, 0.06);
    }

    @keyframes reword-undo-progress {
      from { width: 100%; }
      to { width: 0%; }
    }

    @keyframes reword-bar-slide-in {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes reword-bar-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    @keyframes reword-spinner {
      to { transform: rotate(360deg); }
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

// ─── 5. Shield overlay — covers the compose area to prevent ANY interaction ───

function showShield(): void {
  if (shield && document.contains(shield)) return;

  const composeContainer = cachedEditable?.closest(
    '.msg-form, .msg-form__msg-content-container, [data-testid="messageEntry"], .channelTextArea_xyz, .nH',
  ) as HTMLElement | null;
  const target = composeContainer ?? cachedEditable?.parentElement;
  if (!target) return;

  shield = document.createElement('div');
  shield.id = 'reword-shield';
  shield.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: var(--reword-shield-bg, rgba(220, 38, 38, 0.08));
    border: 2px solid #dc2626;
    border-radius: 8px;
    z-index: 999999;
    pointer-events: all;
    cursor: not-allowed;
  `;

  const origPosition = target.style.position;
  if (!origPosition || origPosition === 'static') {
    target.style.position = 'relative';
  }
  target.appendChild(shield);

  shield.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  shield.addEventListener(
    'mousedown',
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  shield.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

function hideShield(): void {
  if (shield && shield.parentNode) {
    shield.parentNode.removeChild(shield);
    shield = null;
  }
}

// ─── 6. Disable/enable send buttons via global style (survives React re-renders) ───

let blockStyleEl: HTMLStyleElement | null = null;

function disableSendButtons(): void {
  if (blockStyleEl) return;
  blockStyleEl = document.createElement('style');
  blockStyleEl.id = 'reword-block-style';
  blockStyleEl.textContent = `
    ${SEND_SELECTORS.join(',\n    ')} {
      pointer-events: none !important;
      opacity: 0.4 !important;
      cursor: not-allowed !important;
    }
  `;
  document.head.appendChild(blockStyleEl);
}

function enableSendButtons(): void {
  if (blockStyleEl) {
    blockStyleEl.remove();
    blockStyleEl = null;
  }
  document.getElementById('reword-block-style')?.remove();
}

// ─── 7. Focus management helpers ───────────────────────────────────────

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function trapFocus(e: KeyboardEvent, container: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function focusFirstInteractive(container: HTMLElement): void {
  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[0].focus();
  }
}

// ─── 8. Word-level diff rendering ──────────────────────────────────────

function renderWordDiff(original: string, rewrite: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const origWords = original.split(/\s+/).filter(Boolean);
  const rewriteWords = rewrite.split(/\s+/).filter(Boolean);

  // Simple LCS-based diff: walk both arrays, match common subsequences
  const lcs = computeLCS(origWords, rewriteWords);

  let oi = 0;
  let ri = 0;
  let li = 0;

  while (oi < origWords.length || ri < rewriteWords.length) {
    if (
      li < lcs.length &&
      oi < origWords.length &&
      ri < rewriteWords.length &&
      origWords[oi].toLowerCase() === lcs[li].toLowerCase() &&
      rewriteWords[ri].toLowerCase() === lcs[li].toLowerCase()
    ) {
      // Common word
      const span = document.createElement('span');
      span.textContent = rewriteWords[ri] + ' ';
      frag.appendChild(span);
      oi++;
      ri++;
      li++;
    } else if (
      li < lcs.length &&
      oi < origWords.length &&
      origWords[oi].toLowerCase() !== lcs[li].toLowerCase()
    ) {
      // Removed word
      const span = document.createElement('span');
      span.textContent = origWords[oi] + ' ';
      span.style.cssText =
        'text-decoration: line-through; opacity: 0.5; background: var(--reword-diff-removed, rgba(153,27,27,0.3)); border-radius: 2px; padding: 0 2px;';
      frag.appendChild(span);
      oi++;
    } else if (
      li < lcs.length &&
      ri < rewriteWords.length &&
      rewriteWords[ri].toLowerCase() !== lcs[li].toLowerCase()
    ) {
      // Added word
      const span = document.createElement('span');
      span.textContent = rewriteWords[ri] + ' ';
      span.style.cssText =
        'background: var(--reword-diff-added, rgba(34,197,94,0.2)); border-radius: 2px; padding: 0 2px;';
      frag.appendChild(span);
      ri++;
    } else if (li >= lcs.length) {
      // Remaining original words are removed
      if (oi < origWords.length) {
        const span = document.createElement('span');
        span.textContent = origWords[oi] + ' ';
        span.style.cssText =
          'text-decoration: line-through; opacity: 0.5; background: var(--reword-diff-removed, rgba(153,27,27,0.3)); border-radius: 2px; padding: 0 2px;';
        frag.appendChild(span);
        oi++;
      }
      // Remaining rewrite words are added
      if (ri < rewriteWords.length) {
        const span = document.createElement('span');
        span.textContent = rewriteWords[ri] + ' ';
        span.style.cssText =
          'background: var(--reword-diff-added, rgba(34,197,94,0.2)); border-radius: 2px; padding: 0 2px;';
        frag.appendChild(span);
        ri++;
      }
    } else {
      // Safety: advance both
      oi++;
      ri++;
    }
  }

  return frag;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  // Use DP table (acceptable for short messages)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

// ─── 9. Warning bar (unified, 3-state) ────────────────────────────────

function createWarningBar(): HTMLElement {
  injectCssVariables();

  const bar = document.createElement('div');
  bar.id = 'reword-block-bar';
  bar.setAttribute('role', 'alertdialog');
  bar.setAttribute('aria-modal', 'true');
  bar.setAttribute('aria-label', 'Send blocked - tone issue detected');
  bar.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483647;
    background: var(--reword-block-bg, linear-gradient(135deg, #dc2626 0%, #b91c1c 100%));
    color: var(--reword-block-text, white); padding: 12px 20px;
    font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
    display: none;
    animation: reword-bar-slide-in 200ms ease-out;
  `;

  // Inner container
  const inner = document.createElement('div');
  inner.id = 'reword-bar-inner';
  inner.style.cssText = 'max-width:800px;margin:0 auto;';
  bar.appendChild(inner);

  // Focus trap
  bar.addEventListener('keydown', (e) => {
    trapFocus(e, bar);
  });

  document.body.appendChild(bar);
  return bar;
}

function renderAnalyzingState(): void {
  if (!warningBar) return;
  const inner = warningBar.querySelector('#reword-bar-inner') as HTMLElement;
  if (!inner) return;

  // Clear existing content
  while (inner.firstChild) inner.removeChild(inner.firstChild);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:12px;';

  // Spinner
  const spinner = document.createElement('span');
  spinner.style.cssText = `
    display: inline-block; width: 20px; height: 20px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: var(--reword-block-text, white);
    border-radius: 50%;
    animation: reword-spinner 0.6s linear infinite;
    flex-shrink: 0;
  `;
  row.appendChild(spinner);

  // Message
  const msg = document.createElement('div');
  msg.style.cssText = 'flex:1;';
  const strong = document.createElement('strong');
  strong.textContent = 'Send blocked';
  msg.appendChild(strong);
  const text = document.createTextNode(' \u2014 Analyzing your message...');
  msg.appendChild(text);
  row.appendChild(msg);

  // Edit button
  const editBtn = createButton(
    'Edit message',
    'rgba(255,255,255,0.2)',
    'var(--reword-block-text, white)',
  );
  editBtn.id = 'reword-bar-edit';
  editBtn.addEventListener('click', () => {
    unblock();
    cachedEditable?.focus();
  });
  row.appendChild(editBtn);

  // Send anyway button
  const sendBtn = createButton('Send anyway', 'transparent', 'rgba(255,255,255,0.7)');
  sendBtn.id = 'reword-bar-send';
  sendBtn.style.fontSize = '12px';
  sendBtn.addEventListener('click', handleSendAnywayClick);
  row.appendChild(sendBtn);

  inner.appendChild(row);

  // Focus first interactive element
  requestAnimationFrame(() => focusFirstInteractive(warningBar!));
}

function renderAiResultState(result: AiResultPayload): void {
  if (!warningBar) return;
  const inner = warningBar.querySelector('#reword-bar-inner') as HTMLElement;
  if (!inner) return;

  while (inner.firstChild) inner.removeChild(inner.firstChild);

  // Header row
  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:8px;';

  const icon = document.createElement('span');
  icon.style.cssText = 'font-size:20px;flex-shrink:0;';
  icon.textContent = '\uD83D\uDED1'; // stop sign emoji
  headerRow.appendChild(icon);

  const headerContent = document.createElement('div');
  headerContent.style.cssText = 'flex:1;';

  const strong = document.createElement('strong');
  strong.textContent = 'Send blocked';
  headerContent.appendChild(strong);

  if (result.explanation) {
    const expText = document.createTextNode(' \u2014 ');
    headerContent.appendChild(expText);
    const expSpan = document.createElement('span');
    expSpan.style.cssText = 'opacity:0.9;font-size:13px;';
    expSpan.textContent = result.explanation;
    headerContent.appendChild(expSpan);
  }

  headerRow.appendChild(headerContent);

  // Edit button
  const editBtn = createButton(
    'Edit message',
    'rgba(255,255,255,0.2)',
    'var(--reword-block-text, white)',
  );
  editBtn.id = 'reword-bar-edit';
  editBtn.addEventListener('click', () => {
    unblock();
    cachedEditable?.focus();
  });
  headerRow.appendChild(editBtn);

  // Send anyway button
  const sendBtn = createButton('Send anyway', 'transparent', 'rgba(255,255,255,0.7)');
  sendBtn.id = 'reword-bar-send';
  sendBtn.style.fontSize = '12px';
  sendBtn.addEventListener('click', handleSendAnywayClick);
  headerRow.appendChild(sendBtn);

  inner.appendChild(headerRow);

  // Issue labels
  if (result.issues.length > 0) {
    const issueRow = document.createElement('div');
    issueRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
    for (const issue of result.issues) {
      const badge = document.createElement('span');
      badge.style.cssText = `
        background: rgba(255,255,255,0.15); border-radius: 12px;
        padding: 2px 10px; font-size: 12px; font-weight: 500;
        color: var(--reword-block-text, white);
      `;
      badge.textContent = issue;
      issueRow.appendChild(badge);
    }
    inner.appendChild(issueRow);
  }

  // Rewrite options
  if (result.rewrites.length > 0) {
    const rewriteContainer = document.createElement('div');
    rewriteContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const currentText = originalTextForUndo || getEditableText();

    result.rewrites.forEach((rw, idx) => {
      const rwBtn = document.createElement('button');
      rwBtn.className = 'reword-rewrite-btn';
      rwBtn.setAttribute('aria-label', `Accept ${rw.label} rewrite: ${rw.text.slice(0, 50)}`);
      rwBtn.setAttribute('data-rewrite-index', String(idx));
      rwBtn.style.cssText = `
        background: var(--reword-rewrite-bg, #fff);
        color: var(--reword-rewrite-text, #333);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px; padding: 10px 14px;
        cursor: pointer; font-size: 13px; text-align: left;
        min-height: 44px; display: flex; align-items: center; gap: 8px;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        width: 100%;
      `;

      rwBtn.addEventListener('mouseenter', () => {
        rwBtn.style.transform = 'scale(1.01)';
        rwBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      });
      rwBtn.addEventListener('mouseleave', () => {
        rwBtn.style.transform = 'scale(1)';
        rwBtn.style.boxShadow = 'none';
      });

      // Number label (only if multiple rewrites)
      if (result.rewrites.length > 1) {
        const numSpan = document.createElement('span');
        numSpan.style.cssText = `
          background: rgba(0,0,0,0.08); border-radius: 4px;
          width: 22px; height: 22px; display: flex; align-items: center;
          justify-content: center; font-size: 11px; font-weight: 600;
          flex-shrink: 0; color: var(--reword-rewrite-text, #333);
        `;
        numSpan.textContent = String(idx + 1);
        rwBtn.appendChild(numSpan);
      }

      // Label
      const labelSpan = document.createElement('span');
      labelSpan.style.cssText =
        'font-weight:600;flex-shrink:0;font-size:12px;color:var(--reword-rewrite-text,#333);';
      labelSpan.textContent = rw.label;
      rwBtn.appendChild(labelSpan);

      // Diff content
      const diffContainer = document.createElement('span');
      diffContainer.style.cssText = 'flex:1;line-height:1.4;';
      const diffFrag = renderWordDiff(currentText, rw.text);
      diffContainer.appendChild(diffFrag);
      rwBtn.appendChild(diffContainer);

      rwBtn.addEventListener('click', () => {
        acceptRewrite(rw.text);
      });

      rewriteContainer.appendChild(rwBtn);
    });

    inner.appendChild(rewriteContainer);

    // Keyboard hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;opacity:0.6;margin-top:6px;text-align:center;';
    const maxNum = Math.min(result.rewrites.length, 3);
    hint.textContent = `Press 1-${maxNum} to select \u00B7 Esc to edit \u00B7 Enter to send anyway`;
    inner.appendChild(hint);
  }

  // Focus first rewrite button or edit button
  requestAnimationFrame(() => {
    if (!warningBar) return;
    const firstRewrite = warningBar.querySelector('.reword-rewrite-btn') as HTMLElement | null;
    if (firstRewrite) {
      firstRewrite.focus();
    } else {
      focusFirstInteractive(warningBar);
    }
  });
}

function renderTimedOutState(): void {
  if (!warningBar) return;
  const inner = warningBar.querySelector('#reword-bar-inner') as HTMLElement;
  if (!inner) return;

  while (inner.firstChild) inner.removeChild(inner.firstChild);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const icon = document.createElement('span');
  icon.style.cssText = 'font-size:20px;flex-shrink:0;';
  icon.textContent = '\u26A0\uFE0F'; // warning emoji
  row.appendChild(icon);

  const msg = document.createElement('div');
  msg.style.cssText = 'flex:1;';
  const strong = document.createElement('strong');
  strong.textContent = "Couldn't analyze";
  msg.appendChild(strong);
  const text = document.createTextNode(' \u2014 please review before sending.');
  msg.appendChild(text);
  row.appendChild(msg);

  const editBtn = createButton(
    'Edit message',
    'rgba(255,255,255,0.2)',
    'var(--reword-block-text, white)',
  );
  editBtn.id = 'reword-bar-edit';
  editBtn.addEventListener('click', () => {
    unblock();
    cachedEditable?.focus();
  });
  row.appendChild(editBtn);

  const sendBtn = createButton('Send anyway', 'transparent', 'rgba(255,255,255,0.7)');
  sendBtn.id = 'reword-bar-send';
  sendBtn.style.fontSize = '12px';
  sendBtn.addEventListener('click', handleSendAnywayClick);
  row.appendChild(sendBtn);

  inner.appendChild(row);

  requestAnimationFrame(() => focusFirstInteractive(warningBar!));
}

function renderUndoToast(): void {
  if (!warningBar) return;

  // Switch bar styling to undo mode
  warningBar.style.background = 'var(--reword-undo-bg, #16a34a)';
  warningBar.setAttribute('role', 'status');
  warningBar.setAttribute('aria-live', 'polite');
  warningBar.setAttribute('aria-modal', 'false');
  warningBar.setAttribute('aria-label', 'Rewrite applied');

  const inner = warningBar.querySelector('#reword-bar-inner') as HTMLElement;
  if (!inner) return;

  while (inner.firstChild) inner.removeChild(inner.firstChild);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const checkmark = document.createElement('span');
  checkmark.style.cssText = 'font-size:16px;';
  checkmark.textContent = '\u2713 Rewrite applied';
  row.appendChild(checkmark);

  const spacer = document.createElement('div');
  spacer.style.cssText = 'flex:1;';
  row.appendChild(spacer);

  const undoBtn = createButton('Undo', 'rgba(255,255,255,0.25)', 'white');
  undoBtn.id = 'reword-undo-btn';
  undoBtn.addEventListener('click', () => {
    applyUndo();
  });
  row.appendChild(undoBtn);

  // Progress bar container
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    width: 80px; height: 4px; background: rgba(255,255,255,0.2);
    border-radius: 2px; overflow: hidden; flex-shrink: 0;
  `;
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    width: 100%; height: 100%; background: rgba(255,255,255,0.7);
    border-radius: 2px;
    animation: reword-undo-progress 10s linear forwards;
  `;
  progressContainer.appendChild(progressBar);
  row.appendChild(progressContainer);

  // Timer text
  const timerText = document.createElement('span');
  timerText.style.cssText = 'font-size:12px;opacity:0.8;min-width:20px;';
  timerText.textContent = '10s';
  row.appendChild(timerText);

  inner.appendChild(row);

  // Countdown timer text
  let remaining = 10;
  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      if (countdownIntervalId) clearInterval(countdownIntervalId);
      countdownIntervalId = null;
      return;
    }
    timerText.textContent = `${remaining}s`;
  }, 1000);

  // Auto-dismiss after 10s
  undoTimeoutId = setTimeout(() => {
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    countdownIntervalId = null;
    dismissUndoToast();
  }, 10000);

  requestAnimationFrame(() => undoBtn.focus());
}

function createButton(label: string, bg: string, color: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `
    background: ${bg}; border: 1px solid rgba(255,255,255,0.3);
    color: ${color}; padding: 6px 14px; border-radius: 6px;
    cursor: pointer; font-size: 13px; font-weight: 500;
    min-height: 44px; white-space: nowrap;
    transition: background 0.15s ease;
  `;
  return btn;
}

function handleSendAnywayClick(): void {
  sendAnyway = true;
  unblock();
  if (cachedEditable) {
    cachedEditable.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  setTimeout(() => {
    sendAnyway = false;
  }, 500);
}

// ─── 10. Block / unblock / accept / undo ──────────────────────────────

function block(score: number): void {
  if (blockPhase === 'undo-toast') {
    dismissUndoToast();
  }

  // Cache original text for undo
  if (cachedEditable) {
    originalTextForUndo = cachedEditable.innerText ?? cachedEditable.textContent ?? '';
  }

  if (!warningBar) warningBar = createWarningBar();

  // Reset bar styling to block mode
  warningBar.style.background =
    'var(--reword-block-bg, linear-gradient(135deg, #dc2626 0%, #b91c1c 100%))';
  warningBar.setAttribute('role', 'alertdialog');
  warningBar.setAttribute('aria-modal', 'true');
  warningBar.setAttribute('aria-label', 'Send blocked - tone issue detected');

  warningBar.style.display = 'block';
  warningBar.style.opacity = '1';
  warningBar.style.animation = 'reword-bar-slide-in 200ms ease-out';

  transitionPhase('analyzing');
  renderAnalyzingState();

  disableSendButtons();
  showShield();

  // Start timeout timer — if no AI result in 5.5s, show timed-out state
  if (analysisTimeoutId !== null) clearTimeout(analysisTimeoutId);
  analysisTimeoutId = setTimeout(() => {
    if (blockPhase === 'analyzing') {
      transitionPhase('timed-out');
      renderTimedOutState();
    }
  }, 5500);

  // Detail message based on score (shown in analyzing state)
  console.log(
    '%c[Reword MAIN] block() score: ' + score.toFixed(2),
    'color: orange; font-size: 12px',
  );
}

function unblock(): void {
  if (analysisTimeoutId !== null) {
    clearTimeout(analysisTimeoutId);
    analysisTimeoutId = null;
  }

  if (warningBar) {
    const barRef = warningBar; // Capture ref to avoid stale closure hiding a new bar
    barRef.style.animation = 'reword-bar-fade-out 150ms ease forwards';
    setTimeout(() => {
      if (barRef && barRef === warningBar) barRef.style.display = 'none';
    }, 150);
  }

  enableSendButtons();
  hideShield();
  transitionPhase('idle');
  currentAiResult = null;

  // Return focus to editable
  if (cachedEditable && document.contains(cachedEditable)) {
    cachedEditable.focus();
  }
}

function acceptRewrite(text: string): void {
  if (blockPhase !== 'ai-result') return;

  // Post rewrite to isolated world
  window.postMessage({ type: 'reword-apply-rewrite', text }, '*');

  // Clear analysis state
  if (analysisTimeoutId !== null) {
    clearTimeout(analysisTimeoutId);
    analysisTimeoutId = null;
  }

  enableSendButtons();
  hideShield();

  // Show undo toast
  transitionPhase('undo-toast');
  renderUndoToast();
}

function applyUndo(): void {
  if (!originalTextForUndo) return;
  window.postMessage({ type: 'reword-apply-rewrite', text: originalTextForUndo }, '*');

  dismissUndoToast();
}

function dismissUndoToast(): void {
  if (undoTimeoutId !== null) {
    clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }
  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }

  if (warningBar) {
    const barRef = warningBar; // Capture ref to avoid stale closure hiding a new bar
    barRef.style.animation = 'reword-bar-fade-out 150ms ease forwards';
    setTimeout(() => {
      if (barRef && barRef === warningBar) barRef.style.display = 'none';
    }, 150);
  }

  transitionPhase('idle');
  originalTextForUndo = '';
  currentAiResult = null;

  // Return focus to editable
  if (cachedEditable && document.contains(cachedEditable)) {
    cachedEditable.focus();
  }
}

// ─── 11. Real-time text monitoring ─────────────────────────────────────

function checkCurrentText(): void {
  const text = getEditableText();
  if (text === lastCheckedText) return;
  lastCheckedText = text;

  if (text.length < MIN_LENGTH) {
    lastScore = 0;
    if (blockPhase !== 'idle' && blockPhase !== 'undo-toast' && blockPhase !== 'analyzing') {
      unblock();
    }
    return;
  }
  lastScore = quickScore(text);

  if (lastScore >= HEURISTIC_THRESHOLD) {
    // Only block if not already in a blocking state
    if (blockPhase === 'idle') {
      block(lastScore);
    }
  } else {
    if (blockPhase !== 'idle' && blockPhase !== 'undo-toast' && blockPhase !== 'analyzing') {
      unblock();
      sendAnyway = false;
    }
  }
}

// Listen on EVERY possible text-change event for maximum coverage
document.addEventListener(
  'input',
  () => {
    checkCurrentText();
  },
  true,
);
document.addEventListener(
  'keyup',
  (e) => {
    if (e.key === 'Shift') return;
    checkCurrentText();
  },
  true,
);
// Also poll the editable text on a fast interval as ultimate fallback
setInterval(() => {
  checkCurrentText();
}, 500);

// ─── 12. Cache editable elements (keep polling — SPAs recreate compose boxes) ───

setInterval(() => {
  if (cachedEditable && document.contains(cachedEditable)) return;
  cachedEditable = document.querySelector<HTMLElement>(
    '[contenteditable="true"][role="textbox"], [contenteditable="true"]',
  );
}, 1000);

document.addEventListener(
  'focusin',
  (e) => {
    const t = e.target as HTMLElement;
    if (t?.isContentEditable || t?.getAttribute?.('contenteditable') === 'true') {
      cachedEditable = t;
      checkCurrentText();
    }
  },
  true,
);

// ─── 13. Message handlers (isolated world communication) ──────────────

window.addEventListener('message', (e) => {
  if (!e.data?.type) return;
  // Verify nonce on messages that modify state (suppressions, recipient, ai-result, apply-rewrite)
  const needsNonce = [
    'reword-suppressions',
    'reword-suppressions-add',
    'reword-recipient-id',
    'reword-ai-result',
    'reword-apply-rewrite',
  ].includes(e.data.type);
  if (needsNonce && e.data.nonce !== REWORD_NONCE) return;

  switch (e.data.type) {
    case 'reword-unblock': {
      lastCheckedText = ''; // force re-check
      sendAnyway = false;
      unblock();
      break;
    }

    case 'reword-ai-result': {
      if (blockPhase !== 'analyzing') {
        console.debug('[Reword] ignoring ai-result in phase: %s', blockPhase);
        return;
      }

      // Cancel timeout timer
      if (analysisTimeoutId !== null) {
        clearTimeout(analysisTimeoutId);
        analysisTimeoutId = null;
      }

      const result = e.data.result as AiResultPayload | undefined;

      // If no issues found, unblock
      if (!result || result.issues.length === 0) {
        unblock();
        return;
      }

      currentAiResult = result;
      transitionPhase('ai-result');
      renderAiResultState(result);
      break;
    }

    case 'reword-suppressions': {
      const payload = e.data as { type: string; suppressions: Suppression[] };
      if (Array.isArray(payload.suppressions)) {
        suppressions = payload.suppressions;
        console.debug('[Reword] loaded %d suppressions', suppressions.length);
      }
      break;
    }

    case 'reword-recipient-id': {
      const payload = e.data as { type: string; recipientId: string | null };
      currentRecipientId = payload.recipientId ?? null;
      console.debug('[Reword] recipient context: %s', currentRecipientId);
      break;
    }

    default:
      break;
  }
});

// ─── 14. Keyboard shortcuts ───────────────────────────────────────────

document.addEventListener(
  'keydown',
  (e) => {
    // Only handle shortcuts when in ai-result phase
    if (blockPhase !== 'ai-result' || !currentAiResult) return;

    // Number keys 1-3: select rewrite
    if (e.key >= '1' && e.key <= '3') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < currentAiResult.rewrites.length) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        acceptRewrite(currentAiResult.rewrites[idx].text);
      }
      return;
    }

    // Escape: edit message
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      unblock();
      cachedEditable?.focus();
      return;
    }

    // Enter: send anyway
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleSendAnywayClick();
      return;
    }
  },
  true,
);

// Ctrl+Z handler for undo toast
document.addEventListener(
  'keydown',
  (e) => {
    if (blockPhase !== 'undo-toast') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      applyUndo();
    }
  },
  true,
);

// Helper: find editable element with fallbacks
function findEditable(eventTarget?: EventTarget | null): HTMLElement | null {
  let editable: HTMLElement | null =
    cachedEditable ??
    document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]') ??
    document.querySelector<HTMLElement>('[contenteditable="true"]');

  if (!editable) {
    let el = document.activeElement as HTMLElement | null;
    while (el) {
      if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
        editable = el;
        cachedEditable = el;
        break;
      }
      el = el.parentElement;
    }
  }
  if (!editable && eventTarget) {
    let el = eventTarget as HTMLElement | null;
    while (el) {
      if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
        editable = el;
        cachedEditable = el;
        break;
      }
      el = el.parentElement;
    }
  }
  return editable;
}

// ─── 15. Block Enter key (belt) — MOST CRITICAL handler ──────────────

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Enter' || e.shiftKey || sendAnyway) return;

    // If we're in ai-result phase, the keyboard shortcut handler above handles Enter
    if (blockPhase === 'ai-result') return;

    // If we're already in a blocking phase (analyzing, timed-out), block Enter
    if (blockPhase === 'analyzing' || blockPhase === 'timed-out') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    // Try every possible way to find the editable and its text
    let text = '';
    const editable = findEditable(e.target);
    if (editable) {
      text = editable.textContent?.trim() ?? '';
    }
    // Fallback: try activeElement directly
    if (!text) {
      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable) {
        text = active.textContent?.trim() ?? '';
        cachedEditable = active;
      }
    }
    // Fallback: try event target
    if (!text) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) {
        text = target.textContent?.trim() ?? '';
        cachedEditable = target;
      }
    }

    if (text.length < MIN_LENGTH) return;

    // ALWAYS recompute score fresh on Enter — don't trust cache
    const score = quickScore(text);
    if (score < HEURISTIC_THRESHOLD) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    block(score);
    window.postMessage({ type: 'reword-send-intercept', text }, '*');
    console.log(
      '%c[Reword MAIN] BLOCKED Enter (score: ' + score.toFixed(2) + ')',
      'color: red; font-size: 14px',
      text.slice(0, 60),
    );
  },
  true,
);

// ─── 16. Block Send button clicks/mousedown/pointerdown (suspenders) ──

function handleSendInteraction(e: Event): void {
  if (sendAnyway) return;
  const target = e.target as HTMLElement;
  if (!target?.closest(SEND_BUTTON_SELECTOR)) return;

  // If already blocking, prevent send
  if (blockPhase === 'analyzing' || blockPhase === 'ai-result' || blockPhase === 'timed-out') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }

  const text = getEditableText();
  if (text.length < MIN_LENGTH) return;

  const score = text === lastCheckedText ? lastScore : quickScore(text);
  if (score < HEURISTIC_THRESHOLD) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  block(score);
  window.postMessage({ type: 'reword-send-intercept', text }, '*');
  console.log(
    '%c[Reword MAIN] BLOCKED Send ' + e.type,
    'color: red; font-size: 14px',
    text.slice(0, 60),
  );
}

document.addEventListener('click', handleSendInteraction, true);
document.addEventListener('mousedown', handleSendInteraction, true);
document.addEventListener('pointerdown', handleSendInteraction, true);
document.addEventListener('pointerup', handleSendInteraction, true);
