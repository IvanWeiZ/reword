import { GeminiClient } from './gemini-client';
import { OnDeviceClient } from './ondevice-client';
import { loadStoredData, saveStoredData } from '../shared/storage';
import {
  ONDEVICE_CONFIDENCE_THRESHOLD,
  MAX_RECENT_FLAGS,
  DISMISS_SUPPRESS_THRESHOLD,
  CATEGORY_BOOST_AMOUNT,
} from '../shared/constants';
import type { MessageToBackground, MessageFromBackground, StoredData } from '../shared/types';

const gemini = new GeminiClient();
const ondevice = new OnDeviceClient();

/** Returns the ISO date string (YYYY-MM-DD) of the Monday starting the current week. */
export function getMondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Checks if the weekly stats period has rolled over (new Monday).
 * If so, archives current stats as previousWeeklyStats and resets current.
 */
export async function checkWeeklyReset(data: StoredData): Promise<boolean> {
  const currentMonday = getMondayOfWeek();
  if (data.weeklyStats.weekStart !== currentMonday) {
    // Archive current week stats if they have data
    if (data.weeklyStats.weekStart !== '') {
      data.previousWeeklyStats = { ...data.weeklyStats };
    }
    // Reset for the new week
    data.weeklyStats = {
      weekStart: currentMonday,
      analyzed: 0,
      flagged: 0,
      rewritesAccepted: 0,
    };
    await saveStoredData(data);
    return true;
  }
  return false;
}

export async function handleMessage(message: MessageToBackground): Promise<MessageFromBackground> {
  switch (message.type) {
    case 'validate-api-key': {
      const valid = await gemini.validateApiKey(message.apiKey);
      return { type: 'validate-api-key-result', valid };
    }

    case 'get-settings': {
      const data = await loadStoredData();
      return { type: 'settings', data };
    }

    case 'get-profile': {
      const data = await loadStoredData();
      const profile = data.relationshipProfiles[message.domain] ?? null;
      return { type: 'profile', profile };
    }

    case 'increment-stat': {
      const data = await loadStoredData();
      await checkWeeklyReset(data);
      data.stats[message.stat]++;
      // Mirror relevant stats to weekly tracking
      if (message.stat === 'totalAnalyzed') data.weeklyStats.analyzed++;
      if (message.stat === 'totalFlagged') data.weeklyStats.flagged++;
      if (message.stat === 'rewritesAccepted') data.weeklyStats.rewritesAccepted++;
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'record-flag': {
      // Feature #1: Tone history
      const data = await loadStoredData();
      data.stats.recentFlags.unshift(message.event);
      if (data.stats.recentFlags.length > MAX_RECENT_FLAGS) {
        data.stats.recentFlags = data.stats.recentFlags.slice(0, MAX_RECENT_FLAGS);
      }
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'record-dismiss': {
      // Feature #6: Learning mode
      const data = await loadStoredData();
      const existing = data.dismissedPatterns.find((p) => p.normalized === message.textSnippet);
      if (existing) {
        existing.count++;
        if (existing.count >= DISMISS_SUPPRESS_THRESHOLD) {
          existing.suppressed = true;
        }
      } else {
        data.dismissedPatterns.push({
          normalized: message.textSnippet,
          count: 1,
          suppressed: false,
        });
      }
      // Adaptive false positive reduction: track dismiss counts per category
      if (message.categories && message.categories.length > 0) {
        for (const category of message.categories) {
          data.stats.dismissedCategories[category] =
            (data.stats.dismissedCategories[category] ?? 0) + 1;
        }
      }
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'check-suppressed': {
      // Feature #6: Check if pattern is suppressed (dismissed patterns or explicit suppression)
      const data = await loadStoredData();
      const pattern = data.dismissedPatterns.find((p) => p.normalized === message.textSnippet);
      if (pattern?.suppressed === true) {
        return { type: 'suppression-result', suppressed: true };
      }
      // Check explicit suppressedPhrases list (exact match or substring)
      const textLower = message.textSnippet.toLowerCase();
      const phraseMatch = data.settings.suppressedPhrases.some((phrase) => {
        const phraseLower = phrase.toLowerCase();
        return textLower === phraseLower || textLower.includes(phraseLower);
      });
      return { type: 'suppression-result', suppressed: phraseMatch };
    }

    case 'suppress-phrase': {
      const data = await loadStoredData();
      const text = message.text;
      if (text && !data.settings.suppressedPhrases.includes(text)) {
        data.settings.suppressedPhrases.push(text);
        await saveStoredData(data);
      }
      return { type: 'settings', data };
    }

    case 'remove-suppressed-phrase': {
      const data = await loadStoredData();
      data.settings.suppressedPhrases = data.settings.suppressedPhrases.filter(
        (p) => p !== message.text,
      );
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'get-category-boosts': {
      // Adaptive false positive reduction: compute per-category threshold boosts
      const data = await loadStoredData();
      const boosts: Record<string, number> = {};
      for (const [category, count] of Object.entries(data.stats.dismissedCategories)) {
        if (count >= DISMISS_SUPPRESS_THRESHOLD) {
          boosts[category] = CATEGORY_BOOST_AMOUNT;
        }
      }
      return { type: 'category-boosts', boosts };
    }

    case 'reset-learned-preferences': {
      const data = await loadStoredData();
      data.stats.dismissedCategories = {};
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'analyze-incoming': {
      // Feature #14: Two-way analysis
      try {
        const data = await loadStoredData();
        if (!gemini.isConfigured() && data.settings.geminiApiKey) {
          gemini.configure(data.settings.geminiApiKey);
        }
        if (!gemini.isConfigured()) {
          return { type: 'analysis-error', error: 'Gemini API key not configured' };
        }

        data.stats.monthlyApiCalls++;
        await saveStoredData(data);

        const result = await gemini.analyzeIncoming(message.text, message.context);
        return { type: 'incoming-result', result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('[Reword] Incoming analysis failed:', errorMessage);
        return { type: 'analysis-error', error: errorMessage };
      }
    }

    case 'analyze': {
      try {
        const data = await loadStoredData();

        if (!gemini.isConfigured() && data.settings.geminiApiKey) {
          gemini.configure(data.settings.geminiApiKey);
        }

        // Tier 1: on-device AI (optional)
        const ondeviceResult = await ondevice.checkTone(message.text);
        if (
          ondeviceResult &&
          !ondeviceResult.shouldFlag &&
          ondeviceResult.confidence > ONDEVICE_CONFIDENCE_THRESHOLD
        ) {
          return {
            type: 'analysis-result',
            result: {
              shouldFlag: false,
              riskLevel: 'low',
              issues: [],
              explanation: '',
              rewrites: [],
            },
          };
        }

        // Tier 2: Gemini
        if (!gemini.isConfigured()) {
          return { type: 'analysis-error', error: 'Gemini API key not configured' };
        }

        await checkWeeklyReset(data);
        data.stats.totalAnalyzed++;
        data.stats.monthlyApiCalls++;
        data.weeklyStats.analyzed++;
        await saveStoredData(data);

        const result = await gemini.analyze(
          message.text,
          message.relationshipType,
          message.sensitivity,
          message.context,
          {
            personas: message.personas,
            recipientStyle: message.recipientStyle,
          },
        );

        if (result.shouldFlag) {
          data.stats.totalFlagged++;
          data.weeklyStats.flagged++;
          await saveStoredData(data);
        }

        return { type: 'analysis-result', result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('[Reword] Analysis failed:', errorMessage);
        return {
          type: 'analysis-error',
          error: errorMessage,
        };
      }
    }
  }
}

// Register Chrome message listener (only in extension context)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message as MessageToBackground).then(sendResponse);
    return true;
  });
}
