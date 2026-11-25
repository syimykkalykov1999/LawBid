import { byFormula, withModelOrder } from './rerank';

describe('withModelOrder (F2 stage 2)', () => {
  const top = [
    { item: 'a', score: 0.9 },
    { item: 'b', score: 0.7 },
    { item: 'c', score: 0.4 },
  ];

  it('orders by the model and hands out the formula scores by place', () => {
    expect(withModelOrder(top, [0.1, 0.5, 2])).toEqual([
      { item: 'c', score: 0.9 },
      { item: 'b', score: 0.7 },
      { item: 'a', score: 0.4 },
    ]);
  });

  it('ties keep the formula order; a non-number score goes last', () => {
    expect(withModelOrder(top, [1, 1, Number.NaN]).map((s) => s.item)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('a wrong-length model answer changes nothing', () => {
    expect(withModelOrder(top, [1])).toEqual(top);
  });

  it('byFormula: best first, ties in the original order', () => {
    expect(
      byFormula([
        { item: 'x', score: 0.1 },
        { item: 'y', score: 0.5 },
        { item: 'z', score: 0.5 },
      ]).map((s) => s.item),
    ).toEqual(['y', 'z', 'x']);
  });
});
