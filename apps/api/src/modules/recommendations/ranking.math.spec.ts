import {
  bayesRating,
  dayNumber,
  decay,
  diversify,
  hash01,
  logScale,
  reorderWithinTiers,
  saturate,
  weighted,
} from './ranking.math';

describe('ranking math', () => {
  it('saturate: 0 at 0, rises, never above 1', () => {
    expect(saturate(0, 2)).toBe(0);
    expect(saturate(2, 2)).toBeCloseTo(0.632, 2);
    expect(saturate(1000, 2)).toBeLessThanOrEqual(1);
  });

  it('decay: 1 now, about 0.37 after one scale', () => {
    expect(decay(0, 1000)).toBe(1);
    expect(decay(1000, 1000)).toBeCloseTo(0.368, 2);
    expect(decay(-5, 1000)).toBe(1);
  });

  it('bayesRating: one perfect review does not beat many good ones', () => {
    expect(bayesRating(5, 1)).toBeLessThan(bayesRating(4.8, 80));
    expect(bayesRating(0, 0)).toBeCloseTo(0.8, 2); // the prior
  });

  it('logScale tops out at the cap', () => {
    expect(logScale(0, 100)).toBe(0);
    expect(logScale(100, 100)).toBe(1);
    expect(logScale(10_000, 100)).toBe(1);
  });

  it('hash01 is stable and in [0, 1]', () => {
    expect(hash01('a:b:1')).toBe(hash01('a:b:1'));
    expect(hash01('a:b:1')).not.toBe(hash01('a:b:2'));
    const v = hash01('anything');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    expect(dayNumber(86_400_000 * 3 + 5)).toBe(3);
  });

  it('weighted: weights apply, features are clamped', () => {
    expect(weighted({ a: 0.5, b: 0.5 }, { a: 1, b: 0 })).toBe(0.5);
    expect(weighted({ a: 1 }, { a: 7 })).toBe(1);
  });

  describe('diversify', () => {
    it('keeps score order when keys differ', () => {
      const out = diversify(
        [
          { item: 'x1', score: 0.9 },
          { item: 'y1', score: 0.8 },
          { item: 'z1', score: 0.7 },
        ],
        { key: (s) => s[0] },
      );
      expect(out).toEqual(['x1', 'y1', 'z1']);
    });

    it('spreads one author across the list', () => {
      const out = diversify(
        [
          { item: 'a1', score: 0.9 },
          { item: 'a2', score: 0.88 },
          { item: 'a3', score: 0.86 },
          { item: 'b1', score: 0.7 },
          { item: 'c1', score: 0.69 },
        ],
        { key: (s) => s[0], keyPenalty: 0.25 },
      );
      expect(out.slice(0, 3)).toEqual(['a1', 'b1', 'c1']);
      expect(out).toHaveLength(5);
    });

    it('breaks a run of three of the same kind', () => {
      const items = [
        { id: 'p1', kind: 'photo', score: 0.9 },
        { id: 'p2', kind: 'photo', score: 0.89 },
        { id: 'p3', kind: 'photo', score: 0.88 },
        { id: 'r1', kind: 'reel', score: 0.85 },
      ];
      const out = diversify(
        items.map((i) => ({ item: i, score: i.score })),
        { key: (i) => i.id, kind: (i) => i.kind, runPenalty: 0.1 },
      );
      expect(out.map((i) => i.id)).toEqual(['p1', 'p2', 'r1', 'p3']);
    });
  });

  describe('reorderWithinTiers', () => {
    const tier = (t: { tier: number }) => t.tier;
    const aff = (t: { a: number }) => t.a;

    it('never crosses a tier', () => {
      const out = reorderWithinTiers(
        [
          { id: 'exact', tier: 0, a: 0 },
          { id: 'x', tier: 2, a: 0.1 },
          { id: 'y', tier: 2, a: 0.9 },
        ],
        tier,
        aff,
      );
      expect(out.map((o) => o.id)).toEqual(['exact', 'y', 'x']);
    });

    it('moves a person at most chunk-1 places', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        tier: 2,
        a: i === 9 ? 1 : 0,
      }));
      const out = reorderWithinTiers(items, tier, aff, 5);
      // p9 sits in the second chunk (p5..p9): it only leads that chunk.
      expect(out.slice(0, 5).map((o) => o.id)).toEqual([
        'p0',
        'p1',
        'p2',
        'p3',
        'p4',
      ]);
      expect(out[5].id).toBe('p9');
    });

    it('is stable on equal affinity', () => {
      const items = ['a', 'b', 'c'].map((id) => ({ id, tier: 1, a: 0.5 }));
      expect(reorderWithinTiers(items, tier, aff).map((o) => o.id)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });
});
