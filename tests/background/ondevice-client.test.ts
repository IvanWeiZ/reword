import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnDeviceClient } from '../../src/background/ondevice-client';

describe('OnDeviceClient', () => {
  let client: OnDeviceClient;

  beforeEach(() => {
    client = new OnDeviceClient();
    // Clear any globalThis.ai mock
    delete (globalThis as any).ai;
  });

  afterEach(() => {
    delete (globalThis as any).ai;
  });

  describe('isAvailable', () => {
    it('returns false when globalThis.ai is not defined', async () => {
      expect(await client.isAvailable()).toBe(false);
    });

    it('returns true when globalThis.ai.languageModel.create is a function', async () => {
      (globalThis as any).ai = {
        languageModel: { create: vi.fn() },
      };
      expect(await client.isAvailable()).toBe(true);
    });

    it('caches the availability result', async () => {
      expect(await client.isAvailable()).toBe(false);
      // Even if we add it later, it should remain cached as false
      (globalThis as any).ai = {
        languageModel: { create: vi.fn() },
      };
      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe('checkTone', () => {
    it('returns null when AI is not available', async () => {
      const result = await client.checkTone('Hello');
      expect(result).toBeNull();
    });

    it('parses a valid response', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('{"problematic": true, "confidence": 0.9}'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      const result = await client.checkTone('Whatever');
      expect(result).toEqual({ shouldFlag: true, confidence: 0.9 });
      expect(mockSession.destroy).toHaveBeenCalled();
    });

    it('returns null on malformed JSON', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('not json'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      const result = await client.checkTone('test');
      expect(result).toBeNull();
    });

    it('defaults confidence to 0.5 when not a number', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('{"problematic": false, "confidence": "high"}'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      const result = await client.checkTone('test');
      expect(result).toEqual({ shouldFlag: false, confidence: 0.5 });
    });
  });
});
