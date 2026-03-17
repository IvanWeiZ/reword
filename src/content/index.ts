import type {
  PlatformAdapter,
  AnalysisResult,
  MessageToBackground,
  MessageFromBackground,
} from '../shared/types';
import { DEBOUNCE_MS, MIN_MESSAGE_LENGTH, HEURISTIC_THRESHOLD } from '../shared/constants';
import { scoreMessage } from './heuristic-scorer';
import { InputObserver } from './observer';
import { TriggerIcon } from './trigger';
import { PopupCard } from './popup-card';
import { GmailAdapter } from '../adapters/gmail';
import { LinkedInAdapter } from '../adapters/linkedin';
import { TwitterAdapter } from '../adapters/twitter';
import { GenericFallbackAdapter } from '../adapters/base';

function detectAdapter(): PlatformAdapter {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return new GmailAdapter();
  if (host === 'www.linkedin.com') return new LinkedInAdapter();
  if (host === 'x.com' || host === 'twitter.com') return new TwitterAdapter();
  return new GenericFallbackAdapter();
}

async function sendMessage(msg: MessageToBackground): Promise<MessageFromBackground> {
  return chrome.runtime.sendMessage(msg);
}

function init(): void {
  const adapter = detectAdapter();
  let currentResult: AnalysisResult | null = null;
  let currentText = '';
  let triggerCleanup: (() => void) | null = null;
  let generation = 0;
  let abortController: AbortController | null = null;

  const popup = new PopupCard({
    onRewrite: (text) => {
      adapter.writeBack(text);
      sendMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    },
    onDismiss: () => {},
  });

  const trigger = new TriggerIcon(() => {
    if (currentResult) {
      popup.show(currentResult, currentText);
    }
  });

  document.body.appendChild(popup.element);

  const observer = new InputObserver({
    debounceMs: DEBOUNCE_MS,
    minLength: MIN_MESSAGE_LENGTH,
    onAnalyze: async (text) => {
      const thisGeneration = ++generation;

      // Cancel any in-flight request
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      // Tier 0: local heuristic
      const score = scoreMessage(text);
      if (score < HEURISTIC_THRESHOLD) {
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

      // Send to background for analysis
      const response = await sendMessage({
        type: 'analyze',
        text,
        context: threadContext,
        relationshipType: profile?.type ?? 'workplace',
        sensitivity: settings?.sensitivity ?? 'medium',
      });

      if (signal.aborted || thisGeneration !== generation) return;

      if (response.type === 'analysis-result' && response.result.shouldFlag) {
        currentResult = response.result;
        trigger.show(response.result.riskLevel);
        if (triggerCleanup) triggerCleanup();
        triggerCleanup = adapter.placeTriggerIcon(trigger.element);
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
      if (input && input !== (observer as any)['element']) {
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
