import type {
  PlatformAdapter,
  AnalysisResult,
  MessageToBackground,
  MessageFromBackground,
  IncomingAnalysis,
  Theme,
} from '../shared/types';
import {
  DEBOUNCE_MS,
  MIN_MESSAGE_LENGTH,
  HEURISTIC_THRESHOLD,
  INCOMING_CHECK_INTERVAL_MS,
} from '../shared/constants';
import { scoreMessage } from './heuristic-scorer';
import { InputObserver } from './observer';
import { TriggerIcon } from './trigger';
import { PopupCard } from './popup-card';
import { GmailAdapter } from '../adapters/gmail';
import { LinkedInAdapter } from '../adapters/linkedin';
import { TwitterAdapter } from '../adapters/twitter';
import { SlackAdapter } from '../adapters/slack';
import { DiscordAdapter } from '../adapters/discord';
import { GenericFallbackAdapter } from '../adapters/base';

function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  if (host.endsWith('.slack.com') || host === 'app.slack.com') return new SlackAdapter();
  if (host === 'discord.com') return new DiscordAdapter();
  return new GenericFallbackAdapter();
}

async function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
}

/** Derive recipient communication style from recent thread messages (#8). */
function deriveRecipientStyle(adapter: PlatformAdapter): string | undefined {
  const context = adapter.scrapeThreadContext();
  const otherMessages = context.filter((m) => m.sender === 'other').map((m) => m.text);
  if (otherMessages.length === 0) return undefined;
  // Summarize style signals: avg length, formality cues
  const avgLen = otherMessages.reduce((s, t) => s + t.length, 0) / otherMessages.length;
  const hasEmojis = otherMessages.some((t) => /[\u{1F600}-\u{1F64F}]/u.test(t));
  const hasExclamation = otherMessages.some((t) => t.includes('!'));
  const parts: string[] = [];
  if (avgLen < 30) parts.push('brief');
  else if (avgLen > 150) parts.push('detailed');
  if (hasEmojis) parts.push('uses emojis');
  if (hasExclamation) parts.push('expressive');
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function init(): void {
  const adapter = detectAdapter();
  let currentResult: AnalysisResult | null = null;
  let currentText = '';
  let previousText = '';
  let triggerCleanup: (() => void) | null = null;
  let generation = 0;
  let abortController: AbortController | null = null;
  let customPatterns: string[] = [];
  let theme: Theme = 'auto';

  const popup = new PopupCard({
    onRewrite: (text) => {
      previousText = currentText;
      adapter.writeBack(text);
      sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    },
    onDismiss: () => {
      // Record dismissal for learning mode (#6)
      if (currentText) {
        sendMessage({ type: 'record-dismiss', textSnippet: normalizeSnippet(currentText) });
      }
    },
    onUndo: () => {
      // Undo rewrite (#11) — restore previous text
      if (previousText) {
        adapter.writeBack(previousText);
      }
    },
  });

  const trigger = new TriggerIcon(() => {
    if (currentResult) {
      popup.show(currentResult, currentText);
    }
  });

  document.body.appendChild(popup.element);

  // Load settings to get custom patterns, theme, and personas
  sendMessage({ type: 'get-settings' }).then((resp) => {
    if (resp.type === 'settings') {
      customPatterns = resp.data.settings.customPatterns;
      theme = resp.data.settings.theme;
      popup.setTheme(theme);

      // Start incoming analysis if enabled (#14)
      if (resp.data.settings.analyzeIncoming && adapter.getIncomingMessageElements) {
        startIncomingAnalysis(adapter, resp.data.settings.theme);
      }
    }
  });

  const observer = new InputObserver({
    debounceMs: DEBOUNCE_MS,
    minLength: MIN_MESSAGE_LENGTH,
    onAnalyze: async (text) => {
      const thisGeneration = ++generation;

      // Cancel any in-flight request
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      // Tier 0: local heuristic (with custom patterns #9)
      const score = scoreMessage(text, customPatterns);
      if (score < HEURISTIC_THRESHOLD) {
        trigger.hide();
        currentResult = null;
        return;
      }

      // Check if this pattern is suppressed (learning mode #6)
      const suppressResp = await sendMessage({
        type: 'check-suppressed',
        textSnippet: normalizeSnippet(text),
      });
      if (signal.aborted || thisGeneration !== generation) return;
      if (suppressResp.type === 'suppression-result' && suppressResp.suppressed) {
        trigger.hide();
        currentResult = null;
        return;
      }

      currentText = text;

      // Get relationship context
      const host = window.location.hostname;
      const profileResp = await sendMessage({ type: 'get-profile', domain: host });
      if (signal.aborted || thisGeneration !== generation) return;
      const profile = profileResp.type === 'profile' ? profileResp.profile : null;

      const settingsResp = await sendMessage({ type: 'get-settings' });
      if (signal.aborted || thisGeneration !== generation) return;
      const settings = settingsResp.type === 'settings' ? settingsResp.data.settings : null;

      const threadContext = adapter.scrapeThreadContext();
      const recipientStyle = deriveRecipientStyle(adapter);

      // Show streaming indicator (#7)
      popup.showStreaming();

      // Send to background for analysis (with personas #13 and recipient style #8)
      const response = await sendMessage({
        type: 'analyze',
        text,
        context: threadContext,
        relationshipType: profile?.type ?? 'workplace',
        sensitivity: profile?.sensitivity ?? settings?.sensitivity ?? 'medium',
        personas:
          settings?.rewritePersonas && settings.rewritePersonas.length > 0
            ? settings.rewritePersonas
            : undefined,
        recipientStyle,
      });

      if (signal.aborted || thisGeneration !== generation) return;

      popup.hide();

      if (response.type === 'analysis-result' && response.result.shouldFlag) {
        currentResult = response.result;
        trigger.show(response.result.riskLevel);
        if (triggerCleanup) triggerCleanup();
        triggerCleanup = adapter.placeTriggerIcon(trigger.element);

        // Record flag event for history (#1)
        sendMessage({
          type: 'record-flag',
          event: {
            date: new Date().toISOString(),
            platform: adapter.platformName,
            riskLevel: response.result.riskLevel,
            issues: response.result.issues,
            textSnippet: text.slice(0, 80),
          },
        });
      } else {
        trigger.hide();
        currentResult = null;
      }
    },
  });

  // Watch for input fields appearing (SPAs load them dynamically)
  let domCheckTimer: ReturnType<typeof setTimeout> | null = null;
  const domObserver = new MutationObserver(() => {
    if (domCheckTimer) return;
    domCheckTimer = setTimeout(() => {
      domCheckTimer = null;
      const input = adapter.findInputField();
      if (input && input !== observer.currentElement) {
        observer.observe(input);
      }
    }, 500);
  });

  domObserver.observe(document.body, { childList: true, subtree: true });

  // Initial check
  const input = adapter.findInputField();
  if (input) observer.observe(input);
}

/** Normalize text to a comparable snippet for learning mode (#6). */
function normalizeSnippet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .slice(0, 60);
}

/** Two-way analysis: periodically check incoming messages (#14). */
function startIncomingAnalysis(adapter: PlatformAdapter, _theme: Theme): void {
  const analyzed = new WeakSet<HTMLElement>();
  const cleanups: (() => void)[] = [];

  setInterval(async () => {
    const elements = adapter.getIncomingMessageElements?.() ?? [];
    for (const el of elements) {
      if (analyzed.has(el)) continue;
      analyzed.add(el);

      const text = el.textContent?.trim();
      if (!text || text.length < 10) continue;

      const context = adapter.scrapeThreadContext();
      const response = await sendMessage({
        type: 'analyze-incoming',
        text,
        context,
      });

      if (response.type !== 'incoming-result') continue;
      const result = response.result;
      if (result.riskLevel === 'low') continue;

      // Place indicator
      const indicator = createIncomingIndicator(result);
      const cleanup = adapter.placeIncomingIndicator?.(el, indicator);
      if (cleanup) cleanups.push(cleanup);
    }
  }, INCOMING_CHECK_INTERVAL_MS);
}

function createIncomingIndicator(result: IncomingAnalysis): HTMLElement {
  const colors = {
    low: { bg: '#e3f2fd', text: '#1565c0' },
    medium: { bg: '#fff3e0', text: '#e65100' },
    high: { bg: '#ffebee', text: '#c62828' },
  };
  const c = colors[result.riskLevel];
  const el = document.createElement('span');
  el.className = 'reword-incoming-indicator';
  el.style.backgroundColor = c.bg;
  el.style.color = c.text;
  el.textContent = `⚠ ${result.riskLevel} tone`;
  el.title = result.interpretation;

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    // Toggle tooltip
    const existing = el.parentElement?.querySelector('.reword-incoming-tooltip');
    if (existing) {
      existing.remove();
      return;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'reword-incoming-tooltip';
    tooltip.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">Tone analysis</div>
      <div style="margin-bottom:4px">${result.issues.map((i) => `<span>• ${i}</span>`).join('<br>')}</div>
      <div style="margin-top:8px;font-style:italic">${result.interpretation}</div>
    `;
    el.parentElement?.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 10000);
  });

  return el;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
