import {
  decodeFeedCursor,
  encodeFeedCursor,
  mixPage,
  recoScore,
  recoSlotsFor,
} from './feed-mixer';

describe('feed mixing (docs/05 §2.2.3)', () => {
  const f = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
  const r = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

  it('every 4th item is a recommendation when the user follows someone', () => {
    const page = mixPage(f(20), r(20), 12, true);
    expect(page).toEqual([
      'f0',
      'f1',
      'f2',
      'r0',
      'f3',
      'f4',
      'f5',
      'r1',
      'f6',
      'f7',
      'f8',
      'r2',
    ]);
    expect(recoSlotsFor(12, true)).toBe(3);
  });

  it('no follows: 100% recommendations', () => {
    expect(mixPage([], r(20), 10, false)).toEqual(r(10));
    expect(recoSlotsFor(10, false)).toBe(10);
  });

  it('followed posts run out → recommendations fill the rest', () => {
    expect(mixPage(f(2), r(10), 6, true)).toEqual([
      'f0',
      'f1',
      'r0',
      'r1',
      'r2',
      'r3',
    ]);
  });

  it('pages over a stream have no duplicates and no gaps', () => {
    const following = f(25);
    const reco = r(40);
    let fi = 0;
    let ri = 0;
    const seen: string[] = [];
    for (let page = 0; page < 5; page++) {
      const got = mixPage(following.slice(fi), reco.slice(ri), 10, true);
      fi += got.filter((x) => x.startsWith('f')).length;
      ri += got.filter((x) => x.startsWith('r')).length;
      seen.push(...got);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((x) => x.startsWith('f'))).toEqual(following);
  });

  it('cursor round-trips and rejects garbage', () => {
    const c = { f: { t: '2026-09-28T00:00:00.000Z', id: 'x' }, r: 7, v: 'v1' };
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c);
    expect(decodeFeedCursor('###')).toBeNull();
    expect(
      decodeFeedCursor(Buffer.from('{"r":-1}').toString('base64url')),
    ).toBeNull();
  });

  it('score decays with age', () => {
    expect(recoScore(10, 0, 0, 0)).toBeGreaterThan(recoScore(10, 0, 0, 10));
    expect(recoScore(0, 1, 0, 0)).toBeCloseTo(recoScore(2, 0, 0, 0));
  });
});
