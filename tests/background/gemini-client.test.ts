import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '../../src/background/gemini-client';

describe('parseAnalysisResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      should_flag: true,
      risk_level: 'medium',
      issues: ['passive-aggressive tone'],
      explanation: 'This is dismissive',
      rewrites: [
        { label: 'Warmer', text: 'Better version' },
        { label: 'Direct but kind', text: 'Another version' },
        { label: 'Minimal change', text: 'Slight tweak' },
      ],
    });
    const result = parseAnalysisResponse(json);
    expect(result.shouldFlag).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.rewrites).toHaveLength(3);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const json = '```json\n{"should_flag": false, "risk_level": "low", "issues": [], "explanation": "", "rewrites": []}\n```';
    const result = parseAnalysisResponse(json);
    expect(result.shouldFlag).toBe(false);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseAnalysisResponse('not json')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => parseAnalysisResponse('{"should_flag": true}')).toThrow();
  });
});
