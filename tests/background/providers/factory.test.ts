import { describe, it, expect, vi } from 'vitest';

// Mock all three SDKs before importing providers
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class MockGoogleGenerativeAI {
    getGenerativeModel = vi.fn();
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn(), stream: vi.fn() };
  },
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

import {
  createProvider,
  GeminiProvider,
  ClaudeProvider,
  OpenAIProvider,
} from '../../../src/background/providers';

describe('createProvider factory', () => {
  it('returns a GeminiProvider for "gemini"', () => {
    const provider = createProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe('gemini');
  });

  it('returns a ClaudeProvider for "claude"', () => {
    const provider = createProvider('claude');
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe('claude');
  });

  it('returns an OpenAIProvider for "openai"', () => {
    const provider = createProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('throws for an unknown provider name', () => {
    expect(() => createProvider('unknown' as 'gemini')).toThrow('Unknown provider: unknown');
  });
});
