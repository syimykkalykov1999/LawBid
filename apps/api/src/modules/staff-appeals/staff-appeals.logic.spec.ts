import {
  anonymousLabel,
  authorStatus,
  decodeCursor,
  displayName,
  encodeCursor,
  headScore,
  holdUntil,
  insideWindow,
  isTopRated,
  maskAuthor,
  multiAppeals,
  revealAllowed,
  since,
  startOfUtcDay,
  turnoverExceeded,
  windowUntil,
} from './staff-appeals.logic';

const DAY = 86_400_000;
const T0 = new Date('2026-10-27T12:00:00Z');

describe('window math', () => {
  it('90 days after the filing the window ends exactly', () => {
    expect(windowUntil(T0, 90).getTime() - T0.getTime()).toBe(90 * DAY);
  });

  it('inside the window up to the last millisecond, outside from the end', () => {
    const end = windowUntil(T0, 90);
    expect(insideWindow(T0, new Date(end.getTime() - 1), 90)).toBe(true);
    expect(insideWindow(T0, end, 90)).toBe(false);
    expect(insideWindow(T0, new Date(T0.getTime() + 91 * DAY), 90)).toBe(false);
  });

  it('the hold is 14 days ahead and the look-back is behind', () => {
    expect(holdUntil(T0, 14).getTime() - T0.getTime()).toBe(14 * DAY);
    expect(T0.getTime() - since(T0, 60).getTime()).toBe(60 * DAY);
  });

  it('the day cap resets at 00:00 UTC', () => {
    expect(startOfUtcDay(new Date('2026-10-27T23:59:59Z')).toISOString()).toBe(
      '2026-10-27T00:00:00.000Z',
    );
  });
});

describe('anonymity masking', () => {
  const names: Record<string, string> = { w1: 'Анна Петрова' };
  const name = (id: string) => names[id];

  it('an anonymous author is only «автор обжалования №N» (no id, no name)', () => {
    const v = maskAuthor(
      { anonymous: true, author_alias: 12, author_id: 'w1' },
      name,
    );
    expect(v).toEqual({
      adminId: null,
      label: 'автор обжалования №12',
      anonymous: true,
    });
    expect(JSON.stringify(v)).not.toContain('w1');
    expect(JSON.stringify(v)).not.toContain('Анна');
  });

  it('a named author keeps the name', () => {
    expect(
      maskAuthor({ anonymous: false, author_alias: 3, author_id: 'w1' }, name),
    ).toEqual({ adminId: 'w1', label: 'Анна Петрова', anonymous: false });
  });

  it('a named author without a known name falls back to the number', () => {
    expect(
      maskAuthor({ anonymous: false, author_alias: 3, author_id: 'zz' }, name)
        .label,
    ).toBe(anonymousLabel(3));
  });

  it('display name: full name, else e-mail, else a placeholder', () => {
    expect(
      displayName({ first_name: 'A', last_name: 'B', email: 'a@b.c' }),
    ).toBe('A B');
    expect(
      displayName({ first_name: null, last_name: null, email: 'a@b.c' }),
    ).toBe('a@b.c');
    expect(
      displayName({ first_name: null, last_name: null, email: null }),
    ).toBe('без имени');
  });

  it('the author sees received / in_review / decided and never the verdict', () => {
    expect(authorStatus('new')).toBe('received');
    expect(authorStatus('seen')).toBe('in_review');
    expect(authorStatus('resolved')).toBe('decided');
  });
});

describe('reveal cap', () => {
  it('allows until the cap is used up', () => {
    expect(revealAllowed(0, 20)).toBe(true);
    expect(revealAllowed(19, 20)).toBe(true);
    expect(revealAllowed(20, 20)).toBe(false);
  });
});

describe('auto guards', () => {
  it('turnover: more than 15 % of a team of at least 5', () => {
    const base = { pct: 15, minPeople: 5 };
    expect(turnoverExceeded({ ...base, removed: 3, team: 20 })).toBe(false); // 15 % is not more
    expect(turnoverExceeded({ ...base, removed: 4, team: 20 })).toBe(true);
    expect(turnoverExceeded({ ...base, removed: 2, team: 4 })).toBe(false); // team under the minimum
    expect(turnoverExceeded({ ...base, removed: 1, team: 5 })).toBe(true);
    expect(turnoverExceeded({ ...base, removed: 1, team: 0 })).toBe(false);
  });

  it('top rated: rating 85+ or the best 20 %; no rating is never top', () => {
    const cfg = { topRating: 85, topPct: 20 };
    expect(isTopRated({ ...cfg, rating: 85, rankPct: 90 })).toBe(true);
    expect(isTopRated({ ...cfg, rating: 70, rankPct: 20 })).toBe(true);
    expect(isTopRated({ ...cfg, rating: 70, rankPct: 21 })).toBe(false);
    expect(isTopRated({ ...cfg, rating: 84, rankPct: null })).toBe(false);
    expect(isTopRated({ ...cfg, rating: null, rankPct: 1 })).toBe(false);
  });

  it('two complaints from different people', () => {
    expect(multiAppeals(1, 2)).toBe(false);
    expect(multiAppeals(2, 2)).toBe(true);
  });

  it('head score re-spreads the weights over the parts that exist', () => {
    expect(
      headScore([
        { value: 80, weight: 50 },
        { value: 60, weight: 20 },
        { value: 100, weight: 20 },
      ]),
    ).toBe(80);
    expect(
      headScore([
        { value: null, weight: 50 },
        { value: 40, weight: 20 },
        { value: 100, weight: 20 },
      ]),
    ).toBe(70);
    expect(headScore([{ value: null, weight: 50 }])).toBeNull();
  });
});

describe('cursor', () => {
  it('round-trips and rejects junk', () => {
    const c = { at: T0, id: '11111111-1111-1111-1111-111111111111' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});
