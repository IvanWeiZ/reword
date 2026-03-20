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

  // Sarcasm detection
  describe('sarcasm patterns', () => {
    it('flags "oh great" sarcastic constructions', () => {
      expect(scoreMessage('oh great, another meeting')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('oh wonderful, you changed it again')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('oh fantastic, more work')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('oh perfect, just what I needed')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags sarcastic "sure" phrases', () => {
      expect(scoreMessage('sure, no problem at all')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('sure, whatever you say')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags sarcastic "wow" phrases', () => {
      expect(scoreMessage('wow, thanks')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('wow, really')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('wow, how nice')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags "thanks for nothing"', () => {
      expect(scoreMessage('thanks for nothing')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags "good for you"', () => {
      expect(scoreMessage('good for you')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags "how nice of you"', () => {
      expect(scoreMessage('how nice of you')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags "that\'s just great/wonderful/perfect"', () => {
      expect(scoreMessage("that's just great")).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage("that's just wonderful")).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage("that's just perfect")).toBeGreaterThanOrEqual(0.3);
    });

    it('does not flag genuine positive phrases', () => {
      expect(scoreMessage('that sounds great to me')).toBeLessThan(0.3);
      expect(scoreMessage('thanks so much for your help')).toBeLessThan(0.3);
    });

    it('increases score for multiple sarcasm matches', () => {
      const single = scoreMessage('oh great');
      const double = scoreMessage('oh great, good for you');
      expect(double).toBeGreaterThan(single);
    });
  });

  // Hedging overload
  describe('hedging overload', () => {
    it('flags messages with 3+ hedging phrases', () => {
      const msg = 'I think maybe we could, I guess, try a different approach';
      expect(scoreMessage(msg)).toBeGreaterThanOrEqual(0.25);
    });

    it('does not flag messages with fewer than 3 hedging phrases', () => {
      const msg = 'I think maybe we should try this';
      expect(scoreMessage(msg)).toBeLessThan(0.25);
    });

    it('detects all hedging phrases', () => {
      const msg = "I think maybe I'm not sure, possibly I guess it's sort of kind of okay";
      expect(scoreMessage(msg)).toBeGreaterThanOrEqual(0.25);
    });
  });

  // Emoji-as-tone detection
  describe('emoji-as-tone detection', () => {
    it('flags negative emojis like 🙄 and 🖕', () => {
      expect(scoreMessage('sounds about right 🙄')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('nice job 🖕')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('wow 😡')).toBeGreaterThanOrEqual(0.3);
      expect(scoreMessage('ok 🤡')).toBeGreaterThanOrEqual(0.3);
    });

    it('flags sarcastic emoji combos like "fine 🙂"', () => {
      expect(scoreMessage('fine 🙂')).toBeGreaterThanOrEqual(0.25);
      expect(scoreMessage('sure 😊')).toBeGreaterThanOrEqual(0.25);
      expect(scoreMessage('whatever 🙃')).toBeGreaterThanOrEqual(0.25);
      expect(scoreMessage('ok, great 🙂')).toBeGreaterThanOrEqual(0.25);
    });

    it('does not flag positive emoji usage like "thanks! 😊"', () => {
      // "thanks! 😊" without dismissive context — but note "thanks" is in the
      // sarcastic-emoji trigger list. A standalone "thanks" followed by 😊 is
      // sarcastic-emoji by design. Test truly positive usage without trigger words.
      expect(scoreMessage('I appreciate your help 😊')).toBeLessThan(0.25);
      expect(scoreMessage('Looks good to me 🙂')).toBeLessThan(0.25);
    });

    it('emoji score stacks with keyword score', () => {
      const withoutEmoji = scoreMessage("you're useless");
      const withEmoji = scoreMessage("you're useless 🙄");
      expect(withEmoji).toBeGreaterThan(withoutEmoji);
    });

    it('respects emoji category boost', () => {
      const base = scoreMessage('sounds about right 🙄');
      const boosted = scoreMessage('sounds about right 🙄', [], { emoji: 0.3 });
      expect(boosted).toBeLessThan(base);
    });
  });

  // Exclamation inflation
  describe('exclamation inflation', () => {
    it('flags 3+ consecutive exclamation marks', () => {
      expect(scoreMessage('Fine!!!')).toBeGreaterThanOrEqual(0.25);
      expect(scoreMessage('Really!!!!')).toBeGreaterThanOrEqual(0.25);
    });

    it('does not flag single exclamation mark as inflation', () => {
      // Single ! should not trigger exclamation inflation (though !! may trigger
      // the existing excessive-punctuation detector — that's a separate category)
      expect(scoreMessage('Great!')).toBeLessThan(0.25);
    });

    it('flags aggressive exclamation inflation in context', () => {
      expect(scoreMessage('I said I would do it!!!')).toBeGreaterThanOrEqual(0.25);
    });
  });
});
