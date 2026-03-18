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

    it('caches true result and does not recheck', async () => {
      (globalThis as any).ai = {
        languageModel: { create: vi.fn() },
      };
      expect(await client.isAvailable()).toBe(true);
      // Remove ai - should still return cached true
      delete (globalThis as any).ai;
      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false when ai exists but languageModel.create is not a function', async () => {
      (globalThis as any).ai = {
        languageModel: { create: 'not-a-function' },
      };
      expect(await client.isAvailable()).toBe(false);
    });

    it('returns false when ai.languageModel is undefined', async () => {
      (globalThis as any).ai = {};
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

    it('calls session.destroy() after successful analysis', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('{"problematic": false, "confidence": 0.2}'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      await client.checkTone('nice message');
      expect(mockSession.destroy).toHaveBeenCalledTimes(1);
    });

    it('returns null when session.prompt throws an error', async () => {
      const mockSession = {
        prompt: vi.fn().mockRejectedValue(new Error('AI session error')),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      const result = await client.checkTone('test');
      expect(result).toBeNull();
    });

    it('returns null when session creation throws', async () => {
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockRejectedValue(new Error('create failed')) },
      };

      const result = await client.checkTone('test');
      expect(result).toBeNull();
    });

    it('passes the text in the prompt to the session', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('{"problematic": false, "confidence": 0.1}'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      await client.checkTone('my specific message');
      expect(mockSession.prompt).toHaveBeenCalledWith(
        expect.stringContaining('my specific message'),
      );
    });

    it('creates session with system prompt about tone analysis', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue('{"problematic": false, "confidence": 0.1}'),
        destroy: vi.fn(),
      });
      (globalThis as any).ai = {
        languageModel: { create: mockCreate },
      };

      await client.checkTone('test');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('analyze message tone'),
        }),
      );
    });

    it('treats problematic field as false when not exactly true', async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue('{"problematic": "yes", "confidence": 0.8}'),
        destroy: vi.fn(),
      };
      (globalThis as any).ai = {
        languageModel: { create: vi.fn().mockResolvedValue(mockSession) },
      };

      const result = await client.checkTone('test');
      expect(result).not.toBeNull();
      expect(result!.shouldFlag).toBe(false);
    });
  });
});
