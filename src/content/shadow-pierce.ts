// Runs at document_start in MAIN world — before any page scripts.
// This script blocks sending harsh messages by:
// 1. Intercepting Enter key (capture phase, first listener)
// 2. Intercepting click/mousedown/pointerdown on Send buttons
// 3. Disabling the Send button and overlaying a shield when harsh text detected
// Constants mirror src/shared/constants.ts — keep in sync when updating.
console.log('%c[Reword MAIN] shadow-pierce loaded', 'color: cyan; font-size: 14px');

// 1. Force shadow DOM to open mode
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
  return originalAttachShadow.call(this, { ...init, mode: 'open' });
};

// 2. Lightweight heuristic scorer (inlined — MAIN world can't import modules)
const HEURISTIC_THRESHOLD = 0.38;
const MIN_LENGTH = 3;

const HARSH_WORD_RE = /\b(stupid|idiot|useless|pathetic|incompetent|worthless|dumb)\b/i;
const MILD_WORD_RE = /\b(hate|disgusting|terrible|awful|annoying|ridiculous)\b/i;
const PROFANITY_RE = /\b(fuck|fucking|fucked|shit|shitty|bullshit|ass|asshole|bitch|dumbass|dumb\s+ass|jackass|moron|imbecile|stfu|wtf|gtfo)\b/i;
const PROFANITY_DIRECTED_RE = /\b(fuck|screw|damn|piss)\s?(you|off|this|that|it|me)\b/i;
const DIRECTED_INSULT_RE = /\byou\s+(are|r)\s+(\w+\s+)?(stupid|dumb|useless|pathetic|terrible|awful|incompetent|worthless|an?\s+idiot|an?\s+moron)\b/i;
const SARCASM_RE = /\boh\s+(great|wonderful|fantastic|perfect)\b/i;
const SARCASM2_RE = /\bsure,?\s*(no problem at all|whatever you say)\b/i;
const EXCESSIVE_PUNCT_RE = /[!?]{2,}/;

function quickScore(text: string): number {
  if (!text || text.length < MIN_LENGTH) return 0;
  let score = 0;

  if (PROFANITY_RE.test(text) || PROFANITY_DIRECTED_RE.test(text)) score += 0.45;
  if (DIRECTED_INSULT_RE.test(text)) score += 0.45;

  const paPatterns: [RegExp, number][] = [
    [/\bfine\.\s*$/i, 0.35], [/\bwhatever\b/i, 0.35],
    [/\bper my last email\b/i, 0.4], [/\bas I already mentioned\b/i, 0.35],
    [/\bas previously stated\b/i, 0.35], [/\bthanks for nothing\b/i, 0.4],
    [/\bas I already explained\b/i, 0.35],
  ];
  let paMax = 0;
  for (const [re, w] of paPatterns) {
    if (re.test(text)) paMax = Math.max(paMax, w);
  }
  score += paMax;

  if (HARSH_WORD_RE.test(text)) score += 0.4;
  else if (MILD_WORD_RE.test(text)) score += 0.2;

  const alpha = text.replace(/[^a-zA-Z]/g, '');
  if (alpha.length >= 10 && text.replace(/[^A-Z]/g, '').length / alpha.length > 0.5) score += 0.3;
  if (EXCESSIVE_PUNCT_RE.test(text)) score += 0.3;
  if (SARCASM_RE.test(text) || SARCASM2_RE.test(text)) score += 0.3;

  return Math.min(1, score);
}

// 3. State
let cachedEditable: HTMLElement | null = null;
let lastCheckedText = '';
let lastScore = 0;
let warningBar: HTMLElement | null = null;
let sendAnyway = false;
let shield: HTMLElement | null = null;

function getEditableText(): string {
  if (!cachedEditable || !document.contains(cachedEditable)) {
    cachedEditable = document.querySelector<HTMLElement>(
      '[contenteditable="true"][role="textbox"], [contenteditable="true"]'
    );
  }
  if (!cachedEditable) return '';
  return cachedEditable.textContent?.trim() ?? '';
}

// Send button selectors
const SEND_SELECTORS = [
  '.msg-form__send-button', '.msg-form__send-btn',
  'button[type="submit"]',
  '[data-tooltip*="Send"]', '.T-I.aoO',
  '[data-testid="dmComposerSendButton"]',
  '[data-qa="texty_send_button"]',
  'button[aria-label*="Send"]', 'button[aria-label*="send"]',
];
const SEND_BUTTON_SELECTOR = SEND_SELECTORS.join(',');

// 4. Shield overlay — covers the compose area to prevent ANY interaction
function showShield(): void {
  if (shield && document.contains(shield)) return;

  // Find the compose container to cover
  const composeContainer = cachedEditable?.closest('.msg-form, .msg-form__msg-content-container, [data-testid="messageEntry"], .channelTextArea_xyz, .nH') as HTMLElement | null;
  const target = composeContainer ?? cachedEditable?.parentElement;
  if (!target) return;

  shield = document.createElement('div');
  shield.id = 'reword-shield';
  shield.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(220, 38, 38, 0.08);
    border: 2px solid #dc2626;
    border-radius: 8px;
    z-index: 999999;
    pointer-events: all;
    cursor: not-allowed;
  `;

  // Make the parent positioned so shield covers it
  const origPosition = target.style.position;
  if (!origPosition || origPosition === 'static') {
    target.style.position = 'relative';
  }
  target.appendChild(shield);

  // Shield clicks — prevent anything from reaching the compose area
  shield.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
  shield.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
  shield.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
}

function hideShield(): void {
  if (shield && shield.parentNode) {
    shield.parentNode.removeChild(shield);
    shield = null;
  }
}

// 5. Disable/enable send buttons via global style (survives React re-renders)
let blockStyleEl: HTMLStyleElement | null = null;

function disableSendButtons(): void {
  if (blockStyleEl) return; // already blocked
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
  // Also remove any stale style tag (in case ref was lost)
  document.getElementById('reword-block-style')?.remove();
}

// 6. Warning bar
function createWarningBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.id = 'reword-block-bar';
  bar.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483647;
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    color: white; padding: 12px 20px;
    font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
    display: none;
    transition: transform 0.2s ease, opacity 0.2s ease;
  `;
  bar.innerHTML = `
    <div style="max-width:800px;margin:0 auto;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;">🛑</span>
      <div style="flex:1;">
        <strong>Send blocked</strong> — this message may come across as harsh or hostile.
        <span id="reword-bar-detail" style="opacity:0.85;font-size:13px;"></span>
      </div>
      <button id="reword-bar-edit" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">
        Edit message
      </button>
      <button id="reword-bar-send" style="background:transparent;border:1px solid rgba(255,255,255,0.3);color:rgba(255,255,255,0.7);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">
        Send anyway
      </button>
    </div>`;
  document.body.appendChild(bar);

  bar.querySelector('#reword-bar-edit')?.addEventListener('click', () => {
    unblock();
    cachedEditable?.focus();
  });

  bar.querySelector('#reword-bar-send')?.addEventListener('click', () => {
    sendAnyway = true;
    unblock();
    // Re-trigger send
    if (cachedEditable) {
      cachedEditable.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
    }
    setTimeout(() => { sendAnyway = false; }, 500);
  });

  return bar;
}

function block(score: number): void {
  if (!warningBar) warningBar = createWarningBar();
  const detail = warningBar.querySelector('#reword-bar-detail');
  if (detail) {
    detail.textContent = score >= 0.6
      ? ' Consider rewriting before sending.'
      : ' Take a moment to review your tone.';
  }
  warningBar.style.display = 'block';
  disableSendButtons();
  showShield();
}

function unblock(): void {
  if (warningBar) warningBar.style.display = 'none';
  enableSendButtons();
  hideShield();
}

// 7. Real-time text monitoring
function checkCurrentText(): void {
  const text = getEditableText();
  if (text === lastCheckedText) return;
  lastCheckedText = text;

  if (text.length < MIN_LENGTH) {
    lastScore = 0;
    unblock();
    return;
  }
  lastScore = quickScore(text);

  if (lastScore >= HEURISTIC_THRESHOLD) {
    // Show warning immediately as user types
    block(lastScore);
  } else {
    unblock();
    sendAnyway = false;
  }
}

// Listen on EVERY possible text-change event for maximum coverage
document.addEventListener('input', () => { checkCurrentText(); }, true);
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') return;
  checkCurrentText();
}, true);
// keydown fires BEFORE text changes, but we check anyway so score is as fresh as possible
document.addEventListener('keydown', (e) => {
  // Skip the Enter handler here — that's handled separately below
  if (e.key === 'Enter') return;
  // Force re-check by clearing lastCheckedText (text is about to change)
  lastCheckedText = '';
}, true);
// selectionchange fires reliably on contenteditable even when input doesn't
document.addEventListener('selectionchange', () => { checkCurrentText(); });
// Also poll the editable text on a fast interval as ultimate fallback
setInterval(() => { checkCurrentText(); }, 500);

// 8. Cache editable elements (keep polling — SPAs recreate compose boxes)
setInterval(() => {
  if (cachedEditable && document.contains(cachedEditable)) return;
  cachedEditable = document.querySelector<HTMLElement>(
    '[contenteditable="true"][role="textbox"], [contenteditable="true"]'
  );
}, 1000);

document.addEventListener('focusin', (e) => {
  const t = e.target as HTMLElement;
  if (t?.isContentEditable || t?.getAttribute?.('contenteditable') === 'true') {
    cachedEditable = t;
    checkCurrentText();
  }
}, true);

// Listen for unblock signal from content script (isolated world) after rewrite accepted
window.addEventListener('message', (e) => {
  if (e.data?.type === 'reword-unblock') {
    lastCheckedText = ''; // force re-check
    sendAnyway = false;
    unblock();
  }
});

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
        editable = el; cachedEditable = el; break;
      }
      el = el.parentElement;
    }
  }
  if (!editable && eventTarget) {
    let el = eventTarget as HTMLElement | null;
    while (el) {
      if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
        editable = el; cachedEditable = el; break;
      }
      el = el.parentElement;
    }
  }
  return editable;
}

// 9. Block Enter key (belt) — MOST CRITICAL handler
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || sendAnyway) return;

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
  console.log('%c[Reword MAIN] BLOCKED Enter (score: ' + score.toFixed(2) + ')',
    'color: red; font-size: 14px', text.slice(0, 60));
}, true);

// 10. Block Send button clicks/mousedown/pointerdown (suspenders)
function handleSendInteraction(e: Event): void {
  if (sendAnyway) return;
  const target = e.target as HTMLElement;
  if (!target?.closest(SEND_BUTTON_SELECTOR)) return;

  const text = getEditableText();
  if (text.length < MIN_LENGTH) return;

  const score = (text === lastCheckedText) ? lastScore : quickScore(text);
  if (score < HEURISTIC_THRESHOLD) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  block(score);
  window.postMessage({ type: 'reword-send-intercept', text }, '*');
  console.log('%c[Reword MAIN] BLOCKED Send ' + e.type, 'color: red; font-size: 14px', text.slice(0, 60));
}

document.addEventListener('click', handleSendInteraction, true);
document.addEventListener('mousedown', handleSendInteraction, true);
document.addEventListener('pointerdown', handleSendInteraction, true);
document.addEventListener('pointerup', handleSendInteraction, true);
