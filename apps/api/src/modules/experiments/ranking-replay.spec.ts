import { replayNdcg, scoreWith, type ReplayImpression } from './ranking-replay';

/** 200 lists of 10 items; the item people act on is the one with the highest `quality`. */
function lists(n: number, shownBy: 'quality' | 'recency'): ReplayImpression[] {
  const out: ReplayImpression[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let l = 0; l < n; l++) {
    const items = Array.from({ length: 10 }, (_, i) => ({
      itemId: `c${l}_${i}`,
      quality: rnd(),
      recency: rnd(),
    }));
    const best = items.reduce((a, b) => (b.quality > a.quality ? b : a));
    const order = [...items].sort((a, b) => b[shownBy] - a[shownBy]);
    order.forEach((it, idx) =>
      out.push({
        listId: `l${l}`,
        itemId: it.itemId,
        position: idx + 1,
        features: { quality: it.quality, recency: it.recency },
        relevance: it === best ? 1 : 0,
      }),
    );
  }
  return out;
}

describe('replay', () => {
  it('scores with weights and ignores unknown or invalid features', () => {
    expect(scoreWith({ a: 0.5, b: 0.5 }, { a: 1, b: 0 })).toBe(0.5);
    expect(scoreWith({ a: 1, zzz: 1 }, { a: 2 })).toBe(1); // clamped to 0..1
    expect(scoreWith({ a: 1 }, { a: Number.NaN })).toBe(0);
  });

  it('new weights that follow what people act on beat an order that ignores it', () => {
    const imps = lists(300, 'recency');
    const r = replayNdcg(imps, { quality: 1 });
    expect(r.judgedLists).toBe(300);
    expect(r.newNdcg).toBeGreaterThan(r.oldNdcg);
    expect(r.low).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/надёжно лучше/);
  });

  it('weights that ignore the signal are not better than the good order', () => {
    const imps = lists(300, 'quality');
    const r = replayNdcg(imps, { recency: 1 });
    expect(r.newNdcg).toBeLessThan(r.oldNdcg);
    expect(r.high).toBeLessThan(0);
    expect(r.verdict).toMatch(/хуже/);
  });

  it('the same weights as the shown order change nothing', () => {
    const imps = lists(300, 'quality');
    const r = replayNdcg(imps, { quality: 1 });
    expect(r.delta).toBeCloseTo(0, 9);
    expect(r.verdict).toMatch(/Разницы не видно/);
  });

  it('refuses to judge when nobody did anything or there are few lists', () => {
    const none = lists(50, 'quality').map((i) => ({ ...i, relevance: 0 }));
    expect(replayNdcg(none, { quality: 1 }).judgedLists).toBe(0);
    const few = replayNdcg(lists(10, 'recency'), { quality: 1 });
    expect(few.verdict).toMatch(/мало/);
  });
});
