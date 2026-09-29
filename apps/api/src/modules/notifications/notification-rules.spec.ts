import { dedupeKeyFor, quietHoursEnd } from './notification-rules';

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
});
