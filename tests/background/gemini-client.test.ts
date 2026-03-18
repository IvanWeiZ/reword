import { describe, it, expect } from 'vitest';
import {
  parseAnalysisResponse,
  parseIncomingAnalysisResponse,
} from '../../src/background/gemini-client';

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
    const json =
      '```json\n{"should_flag": false, "risk_level": "low", "issues": [], "explanation": "", "rewrites": []}\n```';
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

describe('parseIncomingAnalysisResponse (#14)', () => {
  it('parses valid incoming analysis JSON', () => {
    const json = JSON.stringify({
      risk_level: 'medium',
      issues: ['dismissive tone'],
      interpretation: 'This message may be dismissive',
    });
    const result = parseIncomingAnalysisResponse(json);
    expect(result.riskLevel).toBe('medium');
    expect(result.issues).toEqual(['dismissive tone']);
    expect(result.interpretation).toBe('This message may be dismissive');
  });

  it('handles missing fields gracefully', () => {
    const json = JSON.stringify({});
    const result = parseIncomingAnalysisResponse(json);
    expect(result.riskLevel).toBe('low');
    expect(result.issues).toEqual([]);
    expect(result.interpretation).toContain('Unable to interpret');
  });

  it('handles code fence wrapped JSON', () => {
    const json =
      '```json\n{"risk_level": "high", "issues": ["hostile"], "interpretation": "This is aggressive"}\n```';
    const result = parseIncomingAnalysisResponse(json);
    expect(result.riskLevel).toBe('high');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseIncomingAnalysisResponse('not json')).toThrow();
  });
});
