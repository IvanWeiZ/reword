import { describe, it, expect } from 'vitest';
import { scoreMessage } from '../../src/content/heuristic-scorer';

describe('scoreMessage', () => {
  it('scores short affirmative messages as clean', () => {
    expect(scoreMessage('ok')).toBeLessThan(0.3);
    expect(scoreMessage('sounds good')).toBeLessThan(0.3);
    expect(scoreMessage('thanks!')).toBeLessThan(0.3);
  });

  it('scores factual/logistical messages as clean', () => {
    expect(scoreMessage('meeting at 3')).toBeLessThan(0.3);
    expect(scoreMessage('see the attached file')).toBeLessThan(0.3);
  });

  it('flags passive-aggressive patterns', () => {
    expect(scoreMessage('fine.')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('whatever')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('per my last email')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('as I already mentioned')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags ALL CAPS as potentially aggressive', () => {
    expect(scoreMessage('I TOLD YOU THIS ALREADY')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags excessive punctuation', () => {
    expect(scoreMessage('are you serious??!!')).toBeGreaterThanOrEqual(0.3);
  });

  it('flags dismissive language', () => {
    expect(scoreMessage('not like I had plans or anything')).toBeGreaterThanOrEqual(0.3);
    expect(scoreMessage('I guess that works')).toBeGreaterThanOrEqual(0.3);
  });

  it('scores warm, clear messages as clean', () => {
    expect(scoreMessage('I really appreciate your help with this project')).toBeLessThan(0.3);
    expect(scoreMessage('That sounds like a great idea, let me know how I can help')).toBeLessThan(
      0.3,
    );
  });

  it('returns a number between 0 and 1', () => {
    const score = scoreMessage('whatever, I guess that works. Not like I had plans or anything!!!');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  // Feature #9: custom patterns
  it('flags messages matching custom patterns (#9)', () => {
    const customPatterns = ['\\bwhy would you\\b'];
    const score = scoreMessage('why would you do that', customPatterns);
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  it('does not flag when custom patterns do not match (#9)', () => {
    const customPatterns = ['\\bxyz123\\b'];
    const score = scoreMessage('hello there', customPatterns);
    expect(score).toBeLessThan(0.3);
  });

  it('ignores invalid regex in custom patterns (#9)', () => {
    const customPatterns = ['[invalid'];
    // Should not throw, just skip the invalid pattern
    const score = scoreMessage('hello there', customPatterns);
    expect(score).toBeLessThan(0.3);
  });

  it('works with empty custom patterns array (#9)', () => {
    const score = scoreMessage('whatever', []);
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

});
