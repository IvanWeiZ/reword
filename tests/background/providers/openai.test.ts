import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_ANALYSIS_JSON = JSON.stringify({
  should_flag: true,
  risk_level: 'medium',
  issues: ['Dismissive tone'],
  explanation: 'This sounds dismissive',
  rewrites: [{ label: 'Warmer', text: 'I appreciate your input' }],
});

const VALID_INCOMING_JSON = JSON.stringify({
  risk_level: 'medium',
  issues: ['Passive-aggressive'],
  interpretation: 'The sender may be frustrated',
});

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    apiKey: string;
    chat = { completions: { create: mockCreate } };
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey;
    }
  },
}));

import { OpenAIProvider } from '../../../src/background/providers/openai';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
    vi.clearAllMocks();
  });

  describe('configure / isConfigured', () => {
    it('returns false before configure is called', () => {
      expect(provider.isConfigured()).toBe(false);
    });

    it('returns true after configure is called', () => {
      provider.configure('sk-test-key');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('analyzeStreaming', () => {
    it('throws when not configured', async () => {
      await expect(
        provider.analyzeStreaming('hello', 'colleague', 'medium', [], vi.fn()),
      ).rejects.toThrow('OpenAI client not configured');
    });

    it('streams content and returns parsed result', async () => {
      const chunks = [{ choices: [{ delta: { content: VALID_ANALYSIS_JSON } }] }];

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      provider.configure('sk-test-key');
      const onStream = vi.fn();

      const result = await provider.analyzeStreaming(
        'Whatever.',
        'colleague',
        'medium',
        [],
        onStream,
      );

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stream).toBe(true);

      expect(onStream).toHaveBeenCalledWith(VALID_ANALYSIS_JSON);
      expect(result).toEqual({
        shouldFlag: true,
        riskLevel: 'medium',
        issues: ['Dismissive tone'],
        explanation: 'This sounds dismissive',
        rewrites: [{ label: 'Warmer', text: 'I appreciate your input' }],
      });
    });

    it('accumulates multiple stream chunks', async () => {
      const half1 = VALID_ANALYSIS_JSON.slice(0, 30);
      const half2 = VALID_ANALYSIS_JSON.slice(30);

      const chunks = [
        { choices: [{ delta: { content: half1 } }] },
        { choices: [{ delta: { content: half2 } }] },
      ];

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      provider.configure('sk-test-key');
      const onStream = vi.fn();

      const result = await provider.analyzeStreaming(
        'Whatever.',
        'colleague',
        'medium',
        [],
        onStream,
      );

      expect(onStream).toHaveBeenCalledTimes(2);
      expect(onStream).toHaveBeenNthCalledWith(1, half1);
      expect(onStream).toHaveBeenNthCalledWith(2, VALID_ANALYSIS_JSON);
      expect(result.shouldFlag).toBe(true);
    });

    it('skips chunks with empty delta content', async () => {
      const chunks = [
        { choices: [{ delta: { content: '' } }] },
        { choices: [{ delta: { content: VALID_ANALYSIS_JSON } }] },
        { choices: [{ delta: { content: null } }] },
      ];

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      provider.configure('sk-test-key');
      const onStream = vi.fn();

      await provider.analyzeStreaming('Whatever.', 'colleague', 'medium', [], onStream);

      // Only the non-empty chunk triggers onStream
      expect(onStream).toHaveBeenCalledOnce();
    });
  });

  describe('analyze', () => {
    it('delegates to analyzeStreaming with noop callback', async () => {
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: VALID_ANALYSIS_JSON } }] };
        },
      });

      provider.configure('sk-test-key');
      const result = await provider.analyze('Whatever.', 'colleague', 'medium', []);

      expect(result.shouldFlag).toBe(true);
      expect(result.riskLevel).toBe('medium');
    });
  });

  describe('analyzeIncoming', () => {
    it('throws when not configured', async () => {
      await expect(provider.analyzeIncoming('hello', [])).rejects.toThrow(
        'OpenAI client not configured',
      );
    });

    it('parses message content from response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: VALID_INCOMING_JSON } }],
      });

      provider.configure('sk-test-key');
      const result = await provider.analyzeIncoming('Fine. Do whatever you want.', []);

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stream).toBe(false);

      expect(result).toEqual({
        riskLevel: 'medium',
        issues: ['Passive-aggressive'],
        interpretation: 'The sender may be frustrated',
      });
    });

    it('handles missing message content gracefully', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      provider.configure('sk-test-key');
      // null content coalesces to '', which will fail JSON parse
      await expect(provider.analyzeIncoming('hello', [])).rejects.toThrow();
    });
  });

  describe('validateApiKey', () => {
    it('returns true when API call succeeds', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      });

      const result = await provider.validateApiKey('sk-valid-key');
      expect(result).toBe(true);
    });

    it('returns false when API call throws', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await provider.validateApiKey('sk-bad-key');
      expect(result).toBe(false);
    });
  });
});
