import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { isMissing, normalizeProgress, settingsView } from './desk-data';

describe('desk data helpers', () => {
  it('a route that is missing or switched off is «missing», any other error is not', () => {
    expect(isMissing(new ApiError(404, 'NOT_FOUND', 'x'))).toBe(true);
    expect(isMissing(new ApiError(501, 'NOT_IMPLEMENTED', 'x'))).toBe(true);
    expect(isMissing(new ApiError(403, 'FEATURE_DISABLED', 'x'))).toBe(true);
    expect(isMissing(new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(false);
    expect(isMissing(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(false);
    expect(isMissing(new TypeError('network'))).toBe(false);
  });

  it('settings: everything off and the plan numbers while the server has not answered', () => {
    const s = settingsView(undefined, true);
    expect(s.loading).toBe(true);
    expect(s.on('staff.desk_enabled')).toBe(false);
    expect(s.num('staff.lease.ttl_verification_min')).toBe(20);
    expect(s.num('staff.lease.ttl_ticket_min')).toBe(30);
    expect(settingsView({ switches: { 'staff.desk_enabled': true }, numbers: { 'staff.lease.ttl_ticket_min': 45 } }, false).num('staff.lease.ttl_ticket_min')).toBe(45);
  });

  it('progress: reads the known fields of the rating API, ignores the rest', () => {
    const p = normalizeProgress({
      rating: 82.4,
      status: 'ok',
      decisions: 41,
      flags: ['x', 3],
      accuracy: 90,
      secret: 'ignored',
      openSuggestions: [{ kind: 'reward' }, { kind: 'replace' }],
      suggestions: [{ kind: 'reward' }],
      evidence: { trend: [70, { rating: 75 }, 'bad', 80] },
    });
    expect(p).toMatchObject({ rating: 82.4, status: 'ok', decisions: 41, flags: ['x'], accuracy: 90, clean: null });
    expect(p.suggestionKinds.sort()).toEqual(['replace', 'reward']);
    expect(p.trend).toEqual([70, 75, 80]);
    expect(normalizeProgress(null)).toMatchObject({ rating: null, status: 'low_data', flags: [], trend: [] });
  });
});
