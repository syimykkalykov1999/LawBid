import {
  ALWAYS_PUSH,
  DEFAULT_PUSH,
  QUIET_EXEMPT,
  dedupeKeyFor,
  quietHoursApply,
  quietHoursEnd,
} from './notification-rules';

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

describe('notification rules (docs/05 §9.4, §9.5)', () => {
  it('aggregates likes per object and hour, other types not at all', () => {
    const t = new Date('2026-09-28T10:15:00Z');
    const later = new Date('2026-09-28T10:59:00Z');
    const next = new Date('2026-09-28T11:01:00Z');
    const k = dedupeKeyFor('post_like', { postId: 'p1' }, t);
    expect(k).toBe(dedupeKeyFor('post_like', { postId: 'p1' }, later));
    expect(k).not.toBe(dedupeKeyFor('post_like', { postId: 'p1' }, next));
    expect(k).not.toBe(dedupeKeyFor('post_like', { postId: 'p2' }, t));
    expect(dedupeKeyFor('new_follower', {}, t)).toContain('new_follower');
    expect(dedupeKeyFor('post_comment', { postId: 'p1' }, t)).toBeNull();
  });

  it('quiet hours across midnight, in the user time zone', () => {
    const qh = {
      start_time: time('22:00'),
      end_time: time('07:00'),
      timezone: 'America/New_York',
    };
    // 23:30 in New York (EDT, UTC-4) = 03:30Z → ends 07:00 NY = 11:00Z.
    expect(quietHoursEnd(new Date('2026-09-28T03:30:00Z'), qh)).toEqual(
      new Date('2026-09-28T11:00:00Z'),
    );
    // 12:00 in New York: outside.
    expect(quietHoursEnd(new Date('2026-09-28T16:00:00Z'), qh)).toBeNull();
  });

  it('an unknown time zone never holds pushes back', () => {
    expect(
      quietHoursEnd(new Date(), {
        start_time: time('00:00'),
        end_time: time('23:59'),
        timezone: 'Mars/Olympus',
      }),
    ).toBeNull();
  });

  it('a task reminder is not held by quiet hours and not by a muted category (Owner 2026-10-15)', () => {
    expect(QUIET_EXEMPT.has('task_reminder')).toBe(true);
    expect(ALWAYS_PUSH.has('task_reminder')).toBe(true);
    // Ordinary notifications still wait and still obey the switch.
    expect(QUIET_EXEMPT.has('bid_accepted')).toBe(false);
    expect(ALWAYS_PUSH.has('bid_accepted')).toBe(false);
  });

  // Algo audit 2026-10-27 (CASES C-2, H-2).
  it('new-case alerts are on by default; urgent cases skip quiet hours', () => {
    expect(DEFAULT_PUSH.new_cases).toBe(true);
    expect(quietHoursApply('new_urgent_case', true)).toBe(false);
    expect(quietHoursApply('new_urgent_case', false)).toBe(true);
    expect(quietHoursApply('new_case', true)).toBe(true);
    expect(quietHoursApply('task_reminder', false)).toBe(false);
  });
});
