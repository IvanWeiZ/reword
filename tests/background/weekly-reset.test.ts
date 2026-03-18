import { describe, it, expect } from 'vitest';
import { getMondayOfWeek } from '../../src/background/service-worker';

describe('getMondayOfWeek', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-03-18 is a Wednesday
    const result = getMondayOfWeek(new Date('2026-03-18T12:00:00Z'));
    expect(result).toBe('2026-03-16');
  });

  it('returns same day for a Monday', () => {
    // 2026-03-16 is a Monday
    const result = getMondayOfWeek(new Date('2026-03-16T12:00:00Z'));
    expect(result).toBe('2026-03-16');
  });

  it('returns previous Monday for a Sunday', () => {
    // 2026-03-15 is a Sunday
    const result = getMondayOfWeek(new Date('2026-03-15T12:00:00Z'));
    expect(result).toBe('2026-03-09');
  });

  it('returns previous Monday for a Saturday', () => {
    // 2026-03-14 is a Saturday
    const result = getMondayOfWeek(new Date('2026-03-14T12:00:00Z'));
    expect(result).toBe('2026-03-09');
  });
});
