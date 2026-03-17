import { GeminiClient } from './gemini-client';
import { OnDeviceClient } from './ondevice-client';
import { loadStoredData, saveStoredData } from '../shared/storage';
import { ONDEVICE_CONFIDENCE_THRESHOLD } from '../shared/constants';
import type { MessageToBackground, MessageFromBackground } from '../shared/types';

const gemini = new GeminiClient();
const ondevice = new OnDeviceClient();

type ExtendedMessage = (MessageToBackground & { type: string }) | { type: 'validate-api-key'; apiKey: string };

export async function handleMessage(message: ExtendedMessage): Promise<MessageFromBackground | { type: string; valid?: boolean }> {
  switch (message.type) {
    case 'validate-api-key': {
      const msg = message as { type: 'validate-api-key'; apiKey: string };
      const valid = await gemini.validateApiKey(msg.apiKey);
      return { type: 'validate-api-key-result', valid };
    }

    case 'get-settings': {
      const data = await loadStoredData();
      return { type: 'settings', data };
    }

    case 'get-profile': {
      const msg = message as { type: 'get-profile'; domain: string };
      const data = await loadStoredData();
      const profile = data.relationshipProfiles[msg.domain] ?? null;
      return { type: 'profile', profile };
    }

    case 'increment-stat': {
      const msg = message as { type: 'increment-stat'; stat: string };
      const data = await loadStoredData();
      (data.stats as any)[msg.stat]++;
      await saveStoredData(data);
      return { type: 'settings', data };
    }

    case 'analyze': {
      const msg = message as Extract<MessageToBackground, { type: 'analyze' }>;
      try {
        const data = await loadStoredData();

        if (!gemini.isConfigured() && data.settings.geminiApiKey) {
          gemini.configure(data.settings.geminiApiKey);
        }

        // Tier 1: on-device AI (optional)
        const ondeviceResult = await ondevice.checkTone(msg.text);
        if (ondeviceResult && !ondeviceResult.shouldFlag && ondeviceResult.confidence > ONDEVICE_CONFIDENCE_THRESHOLD) {
          return {
            type: 'analysis-result',
            result: { shouldFlag: false, riskLevel: 'low', issues: [], explanation: '', rewrites: [] },
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
          msg.text,
          msg.relationshipType,
          msg.sensitivity,
          msg.context,
        );

        if (result.shouldFlag) {
          data.stats.totalFlagged++;
          await saveStoredData(data);
        }

        return { type: 'analysis-result', result };
      } catch (error) {
        return { type: 'analysis-error', error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    default:
      return { type: 'analysis-error', error: `Unknown message type: ${(message as { type: string }).type}` };
  }
}

// Register Chrome message listener (only in extension context)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message as ExtendedMessage).then(sendResponse);
    return true;
  });
}
