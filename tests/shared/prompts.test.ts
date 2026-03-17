import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt } from '../../src/shared/prompts';

describe('buildAnalysisPrompt', () => {
  it('includes the user message text', () => {
    const prompt = buildAnalysisPrompt('Hello world', 'workplace', 'medium', []);
    expect(prompt).toContain('Hello world');
  });

  it('includes workplace relationship instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).toContain('professional workplace context');
  });

  it('includes romantic relationship instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'romantic', 'medium', []);
    expect(prompt).toContain('romantic relationship context');
  });

  it('includes family relationship instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'family', 'medium', []);
    expect(prompt).toContain('family relationship context');
  });

  it('includes low sensitivity instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'low', []);
    expect(prompt).toContain('clearly hostile');
  });

  it('includes high sensitivity instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'high', []);
    expect(prompt).toContain('Better safe than sorry');
  });

  it('includes thread context when provided', () => {
    const context = [
      { sender: 'other' as const, text: 'Hey, can you help?' },
      { sender: 'self' as const, text: 'Sure thing' },
    ];
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', context);
    expect(prompt).toContain('[other]: Hey, can you help?');
    expect(prompt).toContain('[self]: Sure thing');
  });

  it('omits thread context block when context is empty', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).not.toContain('Recent conversation for context');
  });

  it('includes JSON response format instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).toContain('"should_flag"');
    expect(prompt).toContain('"risk_level"');
    expect(prompt).toContain('"rewrites"');
  });
});
