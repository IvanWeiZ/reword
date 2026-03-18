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

  it('includes medium sensitivity instructions', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).toContain('could reasonably be misread');
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

  it('defaults to 3 rewrites when no personas provided', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).toContain('exactly 3 rewrites');
    expect(prompt).toContain('different intensity levels');
  });

  it('omits persona block when personas array is empty', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', [], { personas: [] });
    expect(prompt).not.toContain('Custom rewrite styles');
    expect(prompt).toContain('exactly 3 rewrites');
  });

  it('omits recipient style block when not provided', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).not.toContain("recipient's communication style");
  });

  it('formats multiple thread context messages with sender labels', () => {
    const context = [
      { sender: 'other' as const, text: 'First message' },
      { sender: 'self' as const, text: 'Second message' },
      { sender: 'other' as const, text: 'Third message' },
    ];
    const prompt = buildAnalysisPrompt('reply', 'romantic', 'medium', context);
    expect(prompt).toContain('[other]: First message');
    expect(prompt).toContain('[self]: Second message');
    expect(prompt).toContain('[other]: Third message');
    expect(prompt).toContain('Recent conversation for context');
  });

  it('wraps user message in quotes in the prompt', () => {
    const prompt = buildAnalysisPrompt('This is my message', 'workplace', 'medium', []);
    expect(prompt).toContain('"This is my message"');
  });

  it('includes relationship-specific flagging criteria for romantic', () => {
    const prompt = buildAnalysisPrompt('test', 'romantic', 'medium', []);
    expect(prompt).toContain('sarcasm');
    expect(prompt).toContain('emotional dismissal');
    expect(prompt).toContain('passive-aggression');
  });

  it('includes relationship-specific flagging criteria for workplace', () => {
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', []);
    expect(prompt).toContain('condescension');
    expect(prompt).toContain('blame-shifting');
  });

  it('includes relationship-specific flagging criteria for family', () => {
    const prompt = buildAnalysisPrompt('test', 'family', 'medium', []);
    expect(prompt).toContain('guilt-tripping');
    expect(prompt).toContain('emotional manipulation');
  });

  it('includes persona instructions with label and instruction text', () => {
    const personas = [
      { label: 'Empathetic', instruction: 'Use I-statements and validate feelings' },
    ];
    const prompt = buildAnalysisPrompt('test', 'workplace', 'medium', [], { personas });
    expect(prompt).toContain('"Empathetic": Use I-statements and validate feelings');
    expect(prompt).toContain('exactly 1 rewrites');
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

  it('omits thread context when empty', () => {
    const prompt = buildIncomingAnalysisPrompt('test', []);
    expect(prompt).not.toContain('Recent conversation for context');
  });

  it('describes tone issues to detect', () => {
    const prompt = buildIncomingAnalysisPrompt('test', []);
    expect(prompt).toContain('passive-aggression');
    expect(prompt).toContain('hostility');
    expect(prompt).toContain('dismissiveness');
    expect(prompt).toContain('manipulation');
  });

  it('wraps received message in quotes', () => {
    const prompt = buildIncomingAnalysisPrompt('That is interesting', []);
    expect(prompt).toContain('"That is interesting"');
  });

  it('includes benign message fallback instructions', () => {
    const prompt = buildIncomingAnalysisPrompt('test', []);
    expect(prompt).toContain('clearly benign');
    expect(prompt).toContain('straightforward and well-intentioned');
  });
});
