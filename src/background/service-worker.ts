import { GeminiClient } from './gemini-client';
import { OnDeviceClient } from './ondevice-client';
import { loadStoredData, saveStoredData } from '../shared/storage';
import { ONDEVICE_CONFIDENCE_THRESHOLD } from '../shared/constants';
import type { MessageToBackground, MessageFromBackground } from '../shared/types';

const gemini = new GeminiClient();
const ondevice = new OnDeviceClient();

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
      data.stats[message.stat]++;
      await saveStoredData(data);
      return { type: 'settings', data };
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

        data.stats.totalAnalyzed++;
        data.stats.monthlyApiCalls++;
        await saveStoredData(data);

        const result = await gemini.analyze(
          message.text,
          message.relationshipType,
          message.sensitivity,
          message.context,
        );

        if (result.shouldFlag) {
          data.stats.totalFlagged++;
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
