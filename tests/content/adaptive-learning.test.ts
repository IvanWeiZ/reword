import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChromeStorage } from '../mocks/mock-chrome-storage';
import { DEFAULT_STORED_DATA, HEURISTIC_THRESHOLD } from '../../src/shared/constants';
import { scoreMessage } from '../../src/content/heuristic-scorer';
import { handleMessage } from '../../src/background/service-worker';

// --- Module-level mocks for GeminiClient and OnDeviceClient ---

const { mockValidateApiKey, mockAnalyze, mockAnalyzeIncoming, mockIsConfigured, mockConfigure, mockCheckTone } =
  vi.hoisted(() => ({
    mockValidateApiKey: vi.fn(),
    mockAnalyze: vi.fn(),
    mockAnalyzeIncoming: vi.fn(),
    mockIsConfigured: vi.fn().mockReturnValue(false),
    mockConfigure: vi.fn(),
    mockCheckTone: vi.fn(),
  }));

vi.mock('../../src/background/gemini-client', () => ({
  GeminiClient: class {
    validateApiKey = mockValidateApiKey;
    analyze = mockAnalyze;
    analyzeIncoming = mockAnalyzeIncoming;
    isConfigured = mockIsConfigured;
    configure = mockConfigure;
  },
}));

vi.mock('../../src/background/ondevice-client', () => ({
  OnDeviceClient: class {
    checkTone = mockCheckTone;
  },
}));

let mockStorage: ReturnType<typeof createMockChromeStorage>;

beforeEach(() => {
  mockStorage = createMockChromeStorage();
  (globalThis as any).chrome = {
    storage: mockStorage,
    runtime: { onMessage: { addListener: vi.fn() } },
  };
  mockCheckTone.mockReset().mockResolvedValue(null);
});

describe('adaptive false positive reduction', () => {
  describe('dismissing 3 times raises the category threshold', () => {
    it('increments dismissedCategories count on record-dismiss with categories', async () => {
      await mockStorage.local.set({ reword: structuredClone(DEFAULT_STORED_DATA) });

      await handleMessage({
        type: 'record-dismiss',
        textSnippet: 'test snippet',
        categories: ['sarcasm', 'passive-aggressive'],
      });

      const result = await handleMessage({ type: 'get-settings' });
      const stats = (result as any).data.stats;
      expect(stats.dismissedCategories['sarcasm']).toBe(1);
      expect(stats.dismissedCategories['passive-aggressive']).toBe(1);
    });

    it('returns category boosts after threshold is reached', async () => {
      await mockStorage.local.set({ reword: structuredClone(DEFAULT_STORED_DATA) });

      // Dismiss sarcasm 3 times (DISMISS_SUPPRESS_THRESHOLD = 3)
      for (let i = 0; i < 3; i++) {
        await handleMessage({
          type: 'record-dismiss',
          textSnippet: `snippet-${i}`,
          categories: ['sarcasm'],
        });
      }

      const boostsResp = await handleMessage({ type: 'get-category-boosts' });
      expect(boostsResp.type).toBe('category-boosts');
      expect((boostsResp as any).boosts['sarcasm']).toBe(0.15);
    });

    it('does not return boosts before threshold is reached', async () => {
      await mockStorage.local.set({ reword: structuredClone(DEFAULT_STORED_DATA) });

      // Dismiss sarcasm only 2 times (below threshold)
      for (let i = 0; i < 2; i++) {
        await handleMessage({
          type: 'record-dismiss',
          textSnippet: `snippet-${i}`,
          categories: ['sarcasm'],
        });
      }

      const boostsResp = await handleMessage({ type: 'get-category-boosts' });
      expect((boostsResp as any).boosts['sarcasm']).toBeUndefined();
    });
  });

  describe('raised threshold prevents borderline flags', () => {
    it('sarcasm boost reduces sarcasm category score below threshold', () => {
      // Use a phrase that triggers multiple sarcasm patterns to exceed threshold
      const text = 'oh great, good for you';
      const scoreWithout = scoreMessage(text);
      expect(scoreWithout).toBeGreaterThanOrEqual(HEURISTIC_THRESHOLD);

      // With sarcasm boost of 0.15, the sarcasm score is reduced
      const scoreWith = scoreMessage(text, [], { sarcasm: 0.15 });
      expect(scoreWith).toBeLessThan(scoreWithout);
    });

    it('passive-aggressive boost prevents borderline passive-aggressive flags', () => {
      // "whatever" has pattern weight 0.35 and scores 0.35 total
      // With boost of 0.15, score becomes 0.20 which is below threshold
      const text = 'whatever';
      const scoreWithout = scoreMessage(text);
      expect(scoreWithout).toBeGreaterThanOrEqual(0.3);

      const scoreWith = scoreMessage(text, [], { 'passive-aggressive': 0.15 });
      expect(scoreWith).toBeLessThan(scoreWithout);
      expect(scoreWith).toBeLessThan(HEURISTIC_THRESHOLD);
    });

    it('boost only affects the targeted category', () => {
      // ALL CAPS message triggers caps category, not sarcasm
      const text = 'I TOLD YOU THIS ALREADY';
      const scoreWithSarcasmBoost = scoreMessage(text, [], { sarcasm: 0.15 });
      const scoreWithout = scoreMessage(text);
      // Sarcasm boost should not affect caps score
      expect(scoreWithSarcasmBoost).toBe(scoreWithout);
    });
  });

  describe('reset clears the learned preferences', () => {
    it('reset-learned-preferences clears dismissedCategories', async () => {
      const dataWithDismissals = structuredClone(DEFAULT_STORED_DATA);
      dataWithDismissals.stats.dismissedCategories = {
        sarcasm: 5,
        'passive-aggressive': 3,
        hedging: 2,
      };
      await mockStorage.local.set({ reword: dataWithDismissals });

      await handleMessage({ type: 'reset-learned-preferences' });

      const result = await handleMessage({ type: 'get-settings' });
      const stats = (result as any).data.stats;
      expect(stats.dismissedCategories).toEqual({});
    });

    it('boosts are empty after reset', async () => {
      const dataWithDismissals = structuredClone(DEFAULT_STORED_DATA);
      dataWithDismissals.stats.dismissedCategories = {
        sarcasm: 5,
        'passive-aggressive': 3,
      };
      await mockStorage.local.set({ reword: dataWithDismissals });

      // Verify boosts exist before reset
      let boostsResp = await handleMessage({ type: 'get-category-boosts' });
      expect(Object.keys((boostsResp as any).boosts).length).toBeGreaterThan(0);

      // Reset
      await handleMessage({ type: 'reset-learned-preferences' });

      // Verify boosts are empty after reset
      boostsResp = await handleMessage({ type: 'get-category-boosts' });
      expect((boostsResp as any).boosts).toEqual({});
    });
  });
});
