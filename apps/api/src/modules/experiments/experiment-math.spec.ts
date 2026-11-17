import { createHash, randomUUID } from 'node:crypto';
import { hash01 } from '../recommendations/ranking.math';
import {
  assignVariant,
  bucket,
  chiSquareSurvival,
  differenceOf,
  inImpressionSample,
  inRollout,
  meanInterval,
  ndcgAtK,
  normalCdf,
  ratioInterval,
  srmCheck,
  wilsonInterval,
} from './experiment-math';

/** A fixed, random-looking unit id for sample [i] of set [tag] (SHA-256,
 * like real random UUIDs): the statistical tests below give the same result
 * every run; random ids made the SRM check (p < 0.001) fail now and then. */
const unit = (i: number, tag = 0) => {
  const h = createHash('sha256').update(`${tag}:${i}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const VARIANTS = [
  { key: 'control', weight: 50 },
  { key: 'new_formula', weight: 50 },
];

describe('assignVariant', () => {
  it('is deterministic for the same unit and key', () => {
    const id = randomUUID();
    const a = assignVariant(id, 'case_feed_v2', VARIANTS, 100);
    for (let i = 0; i < 5; i++) {
      expect(assignVariant(id, 'case_feed_v2', VARIANTS, 100)).toBe(a);
    }
  });

  it('splits 50/50 within sampling noise and passes its own SRM check', () => {
    const n = 40_000;
    const counts: Record<string, number> = { control: 0, new_formula: 0 };
    // Fixed unit ids, not randomUUID(): the SRM check flags p < 0.001 by
    // design, so random ids made this test fail ~1 run in 1000 (CI 14.11).
    for (let i = 0; i < n; i++) {
      const id = unit(i);
      const v = assignVariant(id, 'split_test', VARIANTS, 100);
      counts[v as string]++;
    }
    expect(Math.abs(counts.control / n - 0.5)).toBeLessThan(0.01);
    expect(srmCheck(counts, VARIANTS).flag).toBe(false);
  });

  it('respects uneven weights', () => {
    const vs = [
      { key: 'control', weight: 90 },
      { key: 'b', weight: 10 },
    ];
    const n = 40_000;
    let b = 0;
    for (let i = 0; i < n; i++) {
      if (assignVariant(unit(i, 1), 'uneven', vs, 100) === 'b') b++;
    }
    expect(Math.abs(b / n - 0.1)).toBeLessThan(0.01);
  });

  it('puts about trafficPercent of the units in the test, the rest get null', () => {
    const n = 40_000;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (assignVariant(unit(i, 2), 'small', VARIANTS, 10) !== null) inside++;
    }
    expect(Math.abs(inside / n - 0.1)).toBeLessThan(0.01);
  });

  it('keeps everyone who was inside when the share is raised', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => unit(i, 3));
    const at5 = ids.map((id) => assignVariant(id, 'ramp', VARIANTS, 5));
    const at50 = ids.map((id) => assignVariant(id, 'ramp', VARIANTS, 50));
    ids.forEach((_, i) => {
      if (at5[i] !== null) expect(at50[i]).toBe(at5[i]);
    });
  });

  it('is independent between experiments', () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => unit(i, 4));
    let both = 0;
    for (const id of ids) {
      const a = assignVariant(id, 'exp_a', VARIANTS, 100);
      const b = assignVariant(id, 'exp_b', VARIANTS, 100);
      if (a === 'new_formula' && b === 'new_formula') both++;
    }
    expect(Math.abs(both / ids.length - 0.25)).toBeLessThan(0.015);
  });

  it('gives nobody a variant at 0%', () => {
    expect(assignVariant(randomUUID(), 'off', VARIANTS, 0)).toBeNull();
  });
});

describe('inRollout / inImpressionSample', () => {
  it('0 is off, 100 is on, 30 is about 30% and stable', () => {
    const id = randomUUID();
    expect(inRollout('f', id, 0)).toBe(false);
    expect(inRollout('f', id, 100)).toBe(true);
    const n = 30_000;
    let on = 0;
    for (let i = 0; i < n; i++) if (inRollout('flag_x', unit(i, 5), 30)) on++;
    expect(Math.abs(on / n - 0.3)).toBeLessThan(0.01);
    expect(inRollout('flag_x', id, 30)).toBe(inRollout('flag_x', id, 30));
  });

  it('raising the percent keeps the users already in', () => {
    const ids = Array.from({ length: 4000 }, (_, i) => unit(i, 6));
    for (const id of ids) {
      if (inRollout('grow', id, 10))
        expect(inRollout('grow', id, 30)).toBe(true);
    }
  });

  it('the impression sample is a stable share of users', () => {
    const n = 30_000;
    let on = 0;
    for (let i = 0; i < n; i++) if (inImpressionSample(randomUUID(), 10)) on++;
    expect(Math.abs(on / n - 0.1)).toBeLessThan(0.01);
  });
});

// ---- hash versions (owner row 150) -------------------------------------

/** Sequential, near-identical ids: the case that showed the bias of v1. */
const similar = (n: number) => Array.from({ length: n }, (_, i) => `user-${i}`);

/** Chi-square of a 2x2 table [aa, ab, ba, bb] against independence (df 1). */
function chi2x2(t: [number, number, number, number]): number {
  const n = t[0] + t[1] + t[2] + t[3];
  const rows = [t[0] + t[1], t[2] + t[3]];
  const cols = [t[0] + t[2], t[1] + t[3]];
  let x = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const e = (rows[i] * cols[j]) / n;
      x += (t[i * 2 + j] - e) ** 2 / e;
    }
  }
  return x;
}

/** 2x2 table of "treatment in key1" x "treatment in key2" over [ids]. */
function crossTable(
  ids: string[],
  k1: string,
  k2: string,
  hashVersion: 1 | 2,
): [number, number, number, number] {
  const t: [number, number, number, number] = [0, 0, 0, 0];
  for (const id of ids) {
    const a = assignVariant(id, k1, VARIANTS, 100, hashVersion) === 'control';
    const b = assignVariant(id, k2, VARIANTS, 100, hashVersion) === 'control';
    t[(a ? 2 : 0) + (b ? 1 : 0)]++;
  }
  return t;
}

/** chi-square(df 1) above this = p < 0.001, the SRM alarm level. */
const CHI2_P001 = 10.828;

describe('hash version 1 (every existing experiment and flag)', () => {
  it('is exactly the old FNV-1a hash, so nobody moves', () => {
    for (let i = 0; i < 200; i++) {
      const id = unit(i, 20);
      expect(bucket('case_feed:variant:', id, 1)).toBe(
        hash01(`case_feed:variant:${id}`),
      );
    }
    const id = unit(1, 21);
    const before = hash01(`flag:reels:${id}`) * 100 < 30;
    expect(inRollout('reels', id, 30)).toBe(before);
    expect(inRollout('reels', id, 30, 1)).toBe(before);
    expect(assignVariant(id, 'k', VARIANTS, 100)).toBe(
      assignVariant(id, 'k', VARIANTS, 100, 1),
    );
  });

  it('is biased on similar ids and correlated between similar keys (why v2)', () => {
    const ids = similar(40_000);
    expect(chi2x2(crossTable(ids, 'feed_v1', 'feed_v2', 1))).toBeGreaterThan(
      CHI2_P001,
    );
    let on = 0;
    for (const id of ids) if (inRollout('reels', id, 10, 1)) on++;
    expect(Math.abs(on / ids.length - 0.1)).toBeGreaterThan(0.005);
  });
});

describe('hash version 2 (GrowthBook SDK hash v2)', () => {
  it('is fnv32a(fnv32a(seed + value) + "") of the GrowthBook SDK', () => {
    // A GrowthBook test vector with our seed shape.
    expect(bucket('seed', 'a', 2)).toBe(0.0505);
  });

  it('splits similar ids 50/50 and passes its own SRM check', () => {
    const counts: Record<string, number> = { control: 0, new_formula: 0 };
    for (const id of similar(40_000)) {
      counts[assignVariant(id, 'split_test', VARIANTS, 100, 2) as string]++;
    }
    expect(Math.abs(counts.control / 40_000 - 0.5)).toBeLessThan(0.005);
    expect(srmCheck(counts, VARIANTS).flag).toBe(false);
  });

  it('passes SRM on random-looking ids with uneven weights', () => {
    const vs = [
      { key: 'control', weight: 70 },
      { key: 'b', weight: 20 },
      { key: 'c', weight: 10 },
    ];
    const counts: Record<string, number> = { control: 0, b: 0, c: 0 };
    for (let i = 0; i < 40_000; i++) {
      counts[assignVariant(unit(i, 22), 'three', vs, 100, 2) as string]++;
    }
    expect(srmCheck(counts, vs).flag).toBe(false);
    expect(Math.abs(counts.c / 40_000 - 0.1)).toBeLessThan(0.005);
  });

  it.each([
    ['feed_v1', 'feed_v2'],
    ['a', 'b'],
    ['case_feed', 'case_fees'],
    ['exp_a', 'exp_b'],
  ])('%s and %s are independent on similar ids', (k1, k2) => {
    expect(chi2x2(crossTable(similar(40_000), k1, k2, 2))).toBeLessThan(
      CHI2_P001,
    );
  });

  it('is independent on random-looking ids too', () => {
    const ids = Array.from({ length: 40_000 }, (_, i) => unit(i, 23));
    expect(chi2x2(crossTable(ids, 'feed_v1', 'feed_v2', 2))).toBeLessThan(
      CHI2_P001,
    );
  });

  it('the traffic gate and the variant are independent', () => {
    const t: [number, number, number, number] = [0, 0, 0, 0];
    for (const id of similar(40_000)) {
      const inside = bucket('ramp:traffic:', id, 2) < 0.5;
      const control = bucket('ramp:variant:', id, 2) < 0.5;
      t[(inside ? 2 : 0) + (control ? 1 : 0)]++;
    }
    expect(chi2x2(t)).toBeLessThan(CHI2_P001);
  });

  it('puts trafficPercent of similar ids in and keeps them when raised', () => {
    const ids = similar(40_000);
    let inside = 0;
    for (const id of ids) {
      const at10 = assignVariant(id, 'small', VARIANTS, 10, 2);
      if (at10 !== null) {
        inside++;
        expect(assignVariant(id, 'small', VARIANTS, 50, 2)).toBe(at10);
      }
    }
    expect(Math.abs(inside / ids.length - 0.1)).toBeLessThan(0.005);
  });

  it('a flag rollout is the asked share of similar ids and only grows', () => {
    const ids = similar(40_000);
    let on = 0;
    for (const id of ids) {
      if (inRollout('reels', id, 10, 2)) {
        on++;
        expect(inRollout('reels', id, 30, 2)).toBe(true);
      }
    }
    expect(Math.abs(on / ids.length - 0.1)).toBeLessThan(0.005);
  });

  it('v1 and v2 give different splits (switching moves people)', () => {
    let moved = 0;
    for (let i = 0; i < 1000; i++) {
      const id = unit(i, 24);
      if (
        assignVariant(id, 'k', VARIANTS, 100, 1) !==
        assignVariant(id, 'k', VARIANTS, 100, 2)
      ) {
        moved++;
      }
    }
    expect(moved).toBeGreaterThan(300);
  });
});

describe('distributions', () => {
  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
  });

  it('chiSquareSurvival matches the table', () => {
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(5.991, 2)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(10.828, 1)).toBeCloseTo(0.001, 4);
    expect(chiSquareSurvival(0, 3)).toBe(1);
  });
});

describe('srmCheck', () => {
  it('passes a fair split', () => {
    const r = srmCheck({ control: 5030, new_formula: 4970 }, VARIANTS);
    expect(r.flag).toBe(false);
    expect(r.p).toBeGreaterThan(0.1);
  });

  it('flags a broken split (the classic 48/52 on 100k)', () => {
    const r = srmCheck({ control: 52_000, new_formula: 48_000 }, VARIANTS);
    expect(r.flag).toBe(true);
    expect(r.p).toBeLessThan(0.001);
  });

  it('does not judge a tiny sample', () => {
    expect(srmCheck({ control: 30, new_formula: 10 }, VARIANTS).flag).toBe(
      false,
    );
  });

  it('works with uneven weights and three variants', () => {
    const vs = [
      { key: 'control', weight: 50 },
      { key: 'a', weight: 30 },
      { key: 'b', weight: 20 },
    ];
    expect(srmCheck({ control: 5000, a: 3000, b: 2000 }, vs).flag).toBe(false);
    expect(srmCheck({ control: 4000, a: 3000, b: 3000 }, vs).flag).toBe(true);
  });
});

describe('intervals', () => {
  it('ratioInterval: a plain ratio with a sensible interval', () => {
    // 1000 users, each saw 10 and clicked 1 (CTR 10%), no variation between users.
    const s = {
      n: 1000,
      sx: 10_000,
      sy: 1000,
      sxx: 100_000,
      syy: 1000,
      sxy: 10_000,
    };
    const iv = ratioInterval(s);
    expect(iv.value).toBeCloseTo(0.1, 6);
    expect(iv.low).toBeCloseTo(0.1, 6);
    expect(iv.high).toBeCloseTo(0.1, 6);
  });

  it('ratioInterval: widens when users differ', () => {
    // Half the users click 2 of 10, half 0 of 10: CTR 10% but noisy.
    const s = {
      n: 1000,
      sx: 10_000,
      sy: 1000,
      sxx: 100_000,
      syy: 2000,
      sxy: 10_000,
    };
    const iv = ratioInterval(s);
    expect(iv.value).toBeCloseTo(0.1, 6);
    expect(iv.high - iv.low).toBeGreaterThan(0.01);
    expect(iv.low).toBeLessThan(0.1);
    expect(iv.high).toBeGreaterThan(0.1);
  });

  it('wilsonInterval stays inside 0..1 and brackets the share', () => {
    const iv = wilsonInterval(30, 100);
    expect(iv.value).toBeCloseTo(0.3, 6);
    expect(iv.low).toBeGreaterThan(0.2);
    expect(iv.high).toBeLessThan(0.41);
    expect(wilsonInterval(0, 50).low).toBe(0);
    expect(wilsonInterval(50, 50).high).toBeCloseTo(1, 10);
  });

  it('meanInterval of a constant has zero width', () => {
    const iv = meanInterval(100, 500, 2500);
    expect(iv.value).toBe(5);
    expect(iv.high - iv.low).toBeCloseTo(0, 6);
  });

  it('differenceOf: a clear lift is significant, equal values are not', () => {
    const c = wilsonInterval(1000, 10_000);
    const t = wilsonInterval(1200, 10_000);
    const d = differenceOf(c, t);
    expect(d.low).toBeGreaterThan(0);
    expect(d.relative).toBeCloseTo(0.2, 6);
    expect(d.p).toBeLessThan(0.001);
    const same = differenceOf(c, wilsonInterval(1005, 10_000));
    expect(same.low).toBeLessThan(0);
    expect(same.high).toBeGreaterThan(0);
    expect(same.p).toBeGreaterThan(0.5);
  });
});

describe('ndcgAtK', () => {
  it('is 1 for the ideal order and lower for a worse one', () => {
    expect(ndcgAtK([3, 2, 1, 0], 10)).toBeCloseTo(1, 9);
    expect(ndcgAtK([0, 1, 2, 3], 10)).toBeLessThan(0.7);
  });

  it('is 0 when nothing is relevant', () => {
    expect(ndcgAtK([0, 0, 0], 10)).toBe(0);
  });

  it('cuts at k', () => {
    expect(ndcgAtK([0, 0, 1], 2)).toBe(0);
    expect(ndcgAtK([0, 0, 1], 3)).toBeGreaterThan(0);
  });
});
