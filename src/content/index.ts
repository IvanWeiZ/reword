import type {
  PlatformAdapter,
  AnalysisResult,
  MessageToBackground,
  MessageFromBackground,
  Theme,
} from '../shared/types';
import {
  DEBOUNCE_MS,
  AI_DEBOUNCE_MS,
  MIN_MESSAGE_LENGTH,
  HEURISTIC_THRESHOLD,
} from '../shared/constants';
import { scoreMessage } from './heuristic-scorer';
import { InputObserver } from './observer';
import { TriggerIcon } from './trigger';
import { PopupCard } from './popup-card';
import { InlineSuggestion } from './inline-suggestion';
import { normalizeSnippet, deriveRecipientStyle } from './helpers';
import { startIncomingAnalysis } from './incoming-analyzer';
import { shouldShowSummary, showWeeklySummary } from './weekly-summary';
import {
  GmailAdapter,
  LinkedInAdapter,
  TwitterAdapter,
  SlackAdapter,
  DiscordAdapter,
  OutlookAdapter,
  TeamsAdapter,
  WhatsAppAdapter,
  GenericFallbackAdapter,
} from '../adapters';

function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  if (host.endsWith('.slack.com') || host === 'app.slack.com') return new SlackAdapter();
  if (host === 'discord.com') return new DiscordAdapter();
  if (host === 'outlook.live.com' || host === 'outlook.office.com') return new OutlookAdapter();
  if (host === 'teams.microsoft.com') return new TeamsAdapter();
  if (host === 'web.whatsapp.com') return new WhatsAppAdapter();
  return new GenericFallbackAdapter();
}

async function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
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
  let categoryBoosts: Record<string, number> = {};
  let theme: Theme = 'auto';

  const popup = new PopupCard({
    onRewrite: (text) => {
      previousText = currentText;
      adapter.writeBack(text);
      sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    },
    onDismiss: () => {
      if (currentText) {
        sendMessage({
          type: 'record-dismiss',
          textSnippet: normalizeSnippet(currentText),
          categories: currentResult?.issues ?? [],
        });
      }
    },
    onUndo: () => {
      if (previousText) {
        adapter.writeBack(previousText);
      }
    },
    onSuppress: (text) => {
      sendMessage({ type: 'suppress-phrase', text });
    },
  });

  const inlineSuggestion = new InlineSuggestion();

  const trigger = new TriggerIcon(() => {
    if (currentResult) {
      // Dismiss ghost text when opening full popup
      inlineSuggestion.dismiss();
      popup.positionNear(trigger.element);
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

      // Check if weekly summary should be shown
      const { weeklyStats, previousWeeklyStats, lastWeeklySummaryShown } = resp.data;
      if (shouldShowSummary(lastWeeklySummaryShown, weeklyStats)) {
        showWeeklySummary({
          currentWeek: weeklyStats,
          previousWeek: previousWeeklyStats,
        });
        // Mark as shown by updating storage via background
        resp.data.lastWeeklySummaryShown = new Date().toISOString();
        chrome.storage.local.set({ reword: resp.data });
      }
    }
  });

  // Load category boosts for adaptive false positive reduction
  sendMessage({ type: 'get-category-boosts' }).then((resp) => {
    if (resp.type === 'category-boosts') {
      categoryBoosts = resp.boosts;
    }
  });

  const observer = new InputObserver({
    debounceMs: DEBOUNCE_MS,
    aiDebounceMs: AI_DEBOUNCE_MS,
    minLength: MIN_MESSAGE_LENGTH,

    // Stage 1 (800ms): fast local heuristic — show badge immediately if flagged
    onHeuristic: (text) => {
      const score = scoreMessage(text, customPatterns, categoryBoosts);
      if (score < HEURISTIC_THRESHOLD) {
        trigger.hide();
        inlineSuggestion.dismiss();
        currentResult = null;
        return;
      }

      // Heuristic flagged — show trigger badge immediately for fast feedback
      // Use 'low' as preliminary risk level; AI stage 2 will refine it
      currentText = text;
      trigger.show('low');
      if (triggerCleanup) triggerCleanup();
      triggerCleanup = adapter.placeTriggerIcon(trigger.element);
    },

    // Stage 2 (2000ms): full AI analysis with rewrites
    onAiAnalyze: async (text) => {
      const thisGeneration = ++generation;

      // Cancel any in-flight request
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      // Re-check heuristic (text may have changed since stage 1)
      const score = scoreMessage(text, customPatterns, categoryBoosts);
      if (score < HEURISTIC_THRESHOLD) {
        trigger.hide();
        inlineSuggestion.dismiss();
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
      popup.positionNear(trigger.element);
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

        // Show inline ghost text with the first (Warmer) rewrite as fast-path
        const inputField = adapter.findInputField();
        if (inputField && response.result.rewrites.length > 0) {
          const topRewrite = response.result.rewrites[0].text;
          inlineSuggestion.show(inputField, text, topRewrite, (accepted) => {
            previousText = currentText;
            adapter.writeBack(accepted);
            sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
          });
        }

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
        inlineSuggestion.dismiss();
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
