import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt, buildIncomingAnalysisPrompt } from '../../src/shared/prompts';

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

  it('includes custom personas when provided (#13)', () => {
    const personas = [
      { label: 'Friendly', instruction: 'Reply like a close friend' },
      { label: 'Formal', instruction: 'Reply with corporate formality' },
    ];
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', [], { personas });
    expect(prompt).toContain('Friendly');
    expect(prompt).toContain('Reply like a close friend');
    expect(prompt).toContain('exactly 2 rewrites');
  });

  it('includes recipient style when provided (#8)', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', [], {
      recipientStyle: 'brief, uses emojis',
    });
    expect(prompt).toContain('brief, uses emojis');
    expect(prompt).toContain("recipient's communication style");
  });
});

describe('buildIncomingAnalysisPrompt (#14)', () => {
  it('includes the received message', () => {
    const prompt = buildIncomingAnalysisPrompt('Whatever.', []);
    expect(prompt).toContain('Whatever.');
  });

  it('includes thread context', () => {
    const context = [{ sender: 'self' as const, text: 'How are you?' }];
    const prompt = buildIncomingAnalysisPrompt('Fine.', context);
    expect(prompt).toContain('[self]: How are you?');
  });

  it('requests JSON with interpretation field', () => {
    const prompt = buildIncomingAnalysisPrompt('test', []);
    expect(prompt).toContain('"interpretation"');
    expect(prompt).toContain('"risk_level"');
  });
});
