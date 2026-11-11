import { BadRequestException } from '@nestjs/common';
import { parseAnalyticsRange } from './analytics.service';

describe('parseAnalyticsRange', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');

  it('defaults to a rolling 30-day reporting range', () => {
    const range = parseAnalyticsRange({}, now);
    expect(range.start.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(range.end).toBe(now);
  });

  it('validates electoral phase, bucket, county, and maximum period', () => {
    expect(() => parseAnalyticsRange({ phase: 'INVALID' }, now)).toThrow(BadRequestException);
    expect(() => parseAnalyticsRange({ bucket: 'hour' }, now)).toThrow(BadRequestException);
    expect(() => parseAnalyticsRange({ county: 'JUBA' }, now)).toThrow(BadRequestException);
    expect(() => parseAnalyticsRange({ from: '2024-01-01', to: '2026-11-11' }, now)).toThrow(BadRequestException);
  });

  it('accepts a bounded location- and phase-filtered range', () => {
    const range = parseAnalyticsRange({
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-11T00:00:00.000Z',
      phase: 'ELECTION_DAY',
      state: 'CES',
      county: 'JUBA',
      bucket: 'week',
    }, now);
    expect(range.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('includes the full end date and rejects impossible calendar dates', () => {
    const range = parseAnalyticsRange({ from: '2026-11-11', to: '2026-11-11' }, now);
    expect(range.end.toISOString()).toBe('2026-11-11T23:59:59.999Z');
    expect(() => parseAnalyticsRange({ from: '2026-02-31' }, now)).toThrow(BadRequestException);
  });
});
