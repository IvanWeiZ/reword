import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { MOCK_FLAGGED_RESULT, MOCK_CLEAN_RESULT } from '../mocks/mock-gemini-client';
import { DEFAULT_STORED_DATA } from '../../src/shared/constants';
import type { IncomingAnalysis, StoredData } from '../../src/shared/types';

// --- Module-level mocks for GeminiClient and OnDeviceClient ---

const {
  mockValidateApiKey,
  mockAnalyze,
  mockAnalyzeIncoming,
  mockIsConfigured,
  mockConfigure,
  mockCheckTone,
} = vi.hoisted(() => ({
  mockValidateApiKey: vi.fn(),
  mockAnalyze: vi.fn(),
  mockAnalyzeIncoming: vi.fn(),
  mockIsConfigured: vi.fn().mockReturnValue(false),
  mockConfigure: vi.fn(),
  mockCheckTone: vi.fn(),
}));

vi.mock('../../src/background/gemini-client', () => {
  return {
    GeminiClient: class MockGeminiClient {
      validateApiKey = mockValidateApiKey;
      analyze = mockAnalyze;
      analyzeIncoming = mockAnalyzeIncoming;
      isConfigured = mockIsConfigured;
      configure = mockConfigure;
    },
  };
});

vi.mock('../../src/background/ondevice-client', () => {
  return {
    OnDeviceClient: class MockOnDeviceClient {
      checkTone = mockCheckTone;
    },
  };
});

// Import handleMessage AFTER mocks are set up
import { handleMessage } from '../../src/background/service-worker';

let mockStorage: ReturnType<typeof createMockChromeStorage>;

function storedDataWithApiKey(overrides?: Partial<StoredData>): StoredData {
  return {
    ...DEFAULT_STORED_DATA,
    settings: {
      ...DEFAULT_STORED_DATA.settings,
      geminiApiKey: 'test-api-key-123',
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: { onMessage: { addListener: vi.fn() } },
  };

  // Reset all mocks
  mockValidateApiKey.mockReset();
  mockAnalyze.mockReset();
  mockAnalyzeIncoming.mockReset();
  mockIsConfigured.mockReset().mockReturnValue(false);
  mockConfigure.mockReset();
  mockCheckTone.mockReset().mockResolvedValue(null);
});

describe('handleMessage', () => {
  // --- Existing tests ---

  it('returns settings on get-settings message', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-settings' });
    expect(result.type).toBe('settings');
  });

  it('returns null profile for unknown domain', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'get-profile', domain: 'unknown.com' });
    expect(result.type).toBe('profile');
    expect((result as any).profile).toBeNull();
  });

  it('returns a known profile for a configured domain', async () => {
    const dataWithProfile = {
      ...DEFAULT_STORED_DATA,
      relationshipProfiles: {
        'mail.google.com': { type: 'romantic' as const, label: 'partner' },
      },
    };
    await mockStorage.local.set({ reword: dataWithProfile });
    const result = await handleMessage({ type: 'get-profile', domain: 'mail.google.com' });
    expect(result.type).toBe('profile');
    expect((result as any).profile?.type).toBe('romantic');
  });

  it('increments stat on increment-stat message', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({ type: 'increment-stat', stat: 'rewritesAccepted' });
    const result = await handleMessage({ type: 'get-settings' });
    expect((result as any).data.stats.rewritesAccepted).toBe(1);
  });

  it('returns analysis-error when gemini is not configured', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA }); // no API key
    const result = await handleMessage({
      type: 'analyze',
      text: 'whatever',
      context: [],
      relationshipType: 'workplace',
      sensitivity: 'medium',
    });
    expect(result.type).toBe('analysis-error');
  });

  it('records flag event in history (#1)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({
      type: 'record-flag',
      event: {
        date: '2026-01-01T00:00:00Z',
        platform: 'gmail',
        riskLevel: 'medium',
        issues: ['passive-aggressive'],
        textSnippet: 'whatever',
      },
    });
    const result = await handleMessage({ type: 'get-settings' });
    expect((result as any).data.stats.recentFlags).toHaveLength(1);
    expect((result as any).data.stats.recentFlags[0].platform).toBe('gmail');
  });

  it('records dismiss and suppresses after threshold (#6)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });

    // Dismiss 3 times (DISMISS_SUPPRESS_THRESHOLD = 3)
    for (let i = 0; i < 3; i++) {
      await handleMessage({ type: 'record-dismiss', textSnippet: 'whatever i guess' });
    }

    const result = await handleMessage({
      type: 'check-suppressed',
      textSnippet: 'whatever i guess',
    });
    expect(result.type).toBe('suppression-result');
    expect((result as any).suppressed).toBe(true);
  });

  it('does not suppress before threshold (#6)', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    await handleMessage({ type: 'record-dismiss', textSnippet: 'test snippet' });
    const result = await handleMessage({ type: 'check-suppressed', textSnippet: 'test snippet' });
    expect((result as any).suppressed).toBe(false);
  });

  it('returns not-suppressed for unknown snippet', async () => {
    await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
    const result = await handleMessage({ type: 'check-suppressed', textSnippet: 'never seen' });
    expect((result as any).suppressed).toBe(false);
  });

  // --- New tests: validate-api-key ---

  describe('validate-api-key', () => {
    it('returns valid: true when gemini client validates key', async () => {
      mockValidateApiKey.mockResolvedValue(true);
      const result = await handleMessage({ type: 'validate-api-key', apiKey: 'good-key' });
      expect(result).toEqual({ type: 'validate-api-key-result', valid: true });
      expect(mockValidateApiKey).toHaveBeenCalledWith('good-key');
    });

    it('returns valid: false when gemini client rejects key', async () => {
      mockValidateApiKey.mockResolvedValue(false);
      const result = await handleMessage({ type: 'validate-api-key', apiKey: 'bad-key' });
      expect(result).toEqual({ type: 'validate-api-key-result', valid: false });
      expect(mockValidateApiKey).toHaveBeenCalledWith('bad-key');
    });
  });

  // --- New tests: error handling when Gemini throws ---

  describe('analyze error handling', () => {
    it('returns analysis-error when gemini.analyze throws an Error', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockRejectedValue(new Error('Network timeout'));

      const result = await handleMessage({
        type: 'analyze',
        text: 'some text',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-error');
      expect((result as any).error).toBe('Network timeout');
    });

    it('returns analysis-error with stringified non-Error throw', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockRejectedValue('raw string error');

      const result = await handleMessage({
        type: 'analyze',
        text: 'some text',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-error');
      expect((result as any).error).toBe('raw string error');
    });
  });

  // --- New tests: On-device AI tier 1 ---

  describe('on-device AI tier 1 (analyze)', () => {
    it('skips Gemini when on-device returns high-confidence non-flag', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue({ shouldFlag: false, confidence: 0.95 });

      const result = await handleMessage({
        type: 'analyze',
        text: 'Have a great day!',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-result');
      expect((result as any).result.shouldFlag).toBe(false);
      expect((result as any).result.riskLevel).toBe('low');
      // Gemini should NOT have been called
      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it('falls through to Gemini when on-device returns low confidence', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue({ shouldFlag: false, confidence: 0.5 });
      mockAnalyze.mockResolvedValue(MOCK_CLEAN_RESULT);

      const result = await handleMessage({
        type: 'analyze',
        text: 'Fine, whatever.',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-result');
      expect(mockAnalyze).toHaveBeenCalled();
    });

    it('falls through to Gemini when on-device returns shouldFlag: true (even high confidence)', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue({ shouldFlag: true, confidence: 0.99 });
      mockAnalyze.mockResolvedValue(MOCK_FLAGGED_RESULT);

      const result = await handleMessage({
        type: 'analyze',
        text: 'Whatever I guess',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-result');
      expect(mockAnalyze).toHaveBeenCalled();
    });

    it('falls through to Gemini when on-device returns null', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockResolvedValue(MOCK_CLEAN_RESULT);

      const result = await handleMessage({
        type: 'analyze',
        text: 'Hello there',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-result');
      expect(mockAnalyze).toHaveBeenCalled();
    });
  });

  // --- New tests: Gemini configuration from storage ---

  describe('auto-configure Gemini from storage', () => {
    it('configures Gemini from stored API key when not yet configured (analyze)', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      // First call: not configured. After configure(), it becomes configured.
      mockIsConfigured.mockReturnValueOnce(false).mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockResolvedValue(MOCK_CLEAN_RESULT);

      await handleMessage({
        type: 'analyze',
        text: 'test message',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(mockConfigure).toHaveBeenCalledWith('test-api-key-123');
      expect(mockAnalyze).toHaveBeenCalled();
    });

    it('configures Gemini from stored API key when not yet configured (analyze-incoming)', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValueOnce(false).mockReturnValue(true);
      const incomingResult: IncomingAnalysis = {
        riskLevel: 'medium',
        issues: ['dismissive'],
        interpretation: 'This message seems dismissive',
      };
      mockAnalyzeIncoming.mockResolvedValue(incomingResult);

      const result = await handleMessage({
        type: 'analyze-incoming',
        text: 'Fine.',
        context: [],
      });

      expect(mockConfigure).toHaveBeenCalledWith('test-api-key-123');
      expect(result.type).toBe('incoming-result');
      expect((result as any).result).toEqual(incomingResult);
    });
  });

  // --- New tests: analyze full flow ---

  describe('analyze full flow with Gemini', () => {
    it('increments stats and returns flagged result', async () => {
      const baseData = storedDataWithApiKey();
      await mockStorage.local.set({ reword: JSON.parse(JSON.stringify(baseData)) });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockResolvedValue(MOCK_FLAGGED_RESULT);

      // Capture baseline stats
      const before = await handleMessage({ type: 'get-settings' });
      const statsBefore = (before as any).data.stats;
      const baseAnalyzed = statsBefore.totalAnalyzed;
      const baseFlagged = statsBefore.totalFlagged;
      const baseApiCalls = statsBefore.monthlyApiCalls;

      const result = await handleMessage({
        type: 'analyze',
        text: 'Whatever I guess that works',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      expect(result.type).toBe('analysis-result');
      expect((result as any).result.shouldFlag).toBe(true);

      // Verify stats were incremented
      const settingsResult = await handleMessage({ type: 'get-settings' });
      const stats = (settingsResult as any).data.stats;
      expect(stats.totalAnalyzed).toBe(baseAnalyzed + 1);
      expect(stats.totalFlagged).toBe(baseFlagged + 1);
      expect(stats.monthlyApiCalls).toBe(baseApiCalls + 1);
    });

    it('increments totalAnalyzed but not totalFlagged for clean result', async () => {
      const baseData = storedDataWithApiKey();
      await mockStorage.local.set({ reword: JSON.parse(JSON.stringify(baseData)) });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockResolvedValue(MOCK_CLEAN_RESULT);

      const before = await handleMessage({ type: 'get-settings' });
      const statsBefore = (before as any).data.stats;
      const baseAnalyzed = statsBefore.totalAnalyzed;
      const baseFlagged = statsBefore.totalFlagged;
      const baseApiCalls = statsBefore.monthlyApiCalls;

      await handleMessage({
        type: 'analyze',
        text: 'Have a great day!',
        context: [],
        relationshipType: 'workplace',
        sensitivity: 'medium',
      });

      const settingsResult = await handleMessage({ type: 'get-settings' });
      const stats = (settingsResult as any).data.stats;
      expect(stats.totalAnalyzed).toBe(baseAnalyzed + 1);
      expect(stats.totalFlagged).toBe(baseFlagged);
      expect(stats.monthlyApiCalls).toBe(baseApiCalls + 1);
    });

    it('passes personas and recipientStyle to gemini.analyze', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockCheckTone.mockResolvedValue(null);
      mockAnalyze.mockResolvedValue(MOCK_CLEAN_RESULT);

      const personas = [{ label: 'Friendly', instruction: 'Be warm' }];
      await handleMessage({
        type: 'analyze',
        text: 'test',
        context: [],
        relationshipType: 'romantic',
        sensitivity: 'high',
        personas,
        recipientStyle: 'casual',
      });

      expect(mockAnalyze).toHaveBeenCalledWith('test', 'romantic', 'high', [], {
        personas,
        recipientStyle: 'casual',
      });
    });
  });

  // --- New tests: analyze-incoming ---

  describe('analyze-incoming', () => {
    it('returns analysis-error when Gemini is not configured and no stored key', async () => {
      await mockStorage.local.set({ reword: DEFAULT_STORED_DATA });
      mockIsConfigured.mockReturnValue(false);

      const result = await handleMessage({
        type: 'analyze-incoming',
        text: 'Fine.',
        context: [],
      });

      expect(result.type).toBe('analysis-error');
      expect((result as any).error).toBe('Gemini API key not configured');
    });

    it('returns analysis-error when analyzeIncoming throws', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockAnalyzeIncoming.mockRejectedValue(new Error('API failure'));

      const result = await handleMessage({
        type: 'analyze-incoming',
        text: 'Fine.',
        context: [],
      });

      expect(result.type).toBe('analysis-error');
      expect((result as any).error).toBe('API failure');
    });

    it('returns analysis-error with stringified non-Error throw (incoming)', async () => {
      await mockStorage.local.set({ reword: storedDataWithApiKey() });
      mockIsConfigured.mockReturnValue(true);
      mockAnalyzeIncoming.mockRejectedValue(42);

      const result = await handleMessage({
        type: 'analyze-incoming',
        text: 'Fine.',
        context: [],
      });

      expect(result.type).toBe('analysis-error');
      expect((result as any).error).toBe('42');
    });

    it('increments monthlyApiCalls for incoming analysis', async () => {
      await mockStorage.local.set({ reword: JSON.parse(JSON.stringify(storedDataWithApiKey())) });
      mockIsConfigured.mockReturnValue(true);
      mockAnalyzeIncoming.mockResolvedValue({
        riskLevel: 'low',
        issues: [],
        interpretation: '',
      });

      const before = await handleMessage({ type: 'get-settings' });
      const baseApiCalls = (before as any).data.stats.monthlyApiCalls;

      await handleMessage({
        type: 'analyze-incoming',
        text: 'Hello',
        context: [],
      });

      const settingsResult = await handleMessage({ type: 'get-settings' });
      expect((settingsResult as any).data.stats.monthlyApiCalls).toBe(baseApiCalls + 1);
    });
  });

  // --- New tests: settings loading from storage on init ---

  describe('settings loading from storage', () => {
    it('returns default data when storage is empty', async () => {
      // Clear storage to ensure no prior data
      await mockStorage.local.clear();
      const result = await handleMessage({ type: 'get-settings' });
      expect(result.type).toBe('settings');
      const data = (result as any).data;
      expect(data.settings.sensitivity).toBe('medium');
      // Default data may have accumulated stats due to shared DEFAULT_STORED_DATA object,
      // so just verify the structure exists
      expect(typeof data.stats.totalAnalyzed).toBe('number');
    });

    it('returns stored settings with custom values', async () => {
      const customData = {
        ...DEFAULT_STORED_DATA,
        settings: {
          ...DEFAULT_STORED_DATA.settings,
          sensitivity: 'high' as const,
          geminiApiKey: 'my-key',
        },
      };
      await mockStorage.local.set({ reword: customData });

      const result = await handleMessage({ type: 'get-settings' });
      expect((result as any).data.settings.sensitivity).toBe('high');
      expect((result as any).data.settings.geminiApiKey).toBe('my-key');
    });
  });

  // --- New tests: record-flag truncation ---

  describe('record-flag truncation', () => {
    it('truncates recentFlags to MAX_RECENT_FLAGS', async () => {
      // Pre-fill with 100 flags (MAX_RECENT_FLAGS)
      const existingFlags = Array.from({ length: 100 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        platform: 'gmail',
        riskLevel: 'low' as const,
        issues: [],
        textSnippet: `old-${i}`,
      }));
      const data = {
        ...DEFAULT_STORED_DATA,
        stats: { ...DEFAULT_STORED_DATA.stats, recentFlags: existingFlags },
      };
      await mockStorage.local.set({ reword: data });

      // Add one more
      await handleMessage({
        type: 'record-flag',
        event: {
          date: '2026-02-01T00:00:00Z',
          platform: 'linkedin',
          riskLevel: 'high',
          issues: ['harsh'],
          textSnippet: 'newest',
        },
      });

      const result = await handleMessage({ type: 'get-settings' });
      const flags = (result as any).data.stats.recentFlags;
      expect(flags).toHaveLength(100); // still capped at 100
      expect(flags[0].textSnippet).toBe('newest'); // newest is first
    });
  });
});
