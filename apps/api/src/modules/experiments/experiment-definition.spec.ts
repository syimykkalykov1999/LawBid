import {
  definitionProblem,
  normalizeGuardrails,
  parseVariants,
} from './experiment-definition';

const ok = [
  { key: 'control', weight: 50 },
  { key: 'new_formula', weight: 50 },
];

describe('definitionProblem', () => {
  it('accepts a normal two-variant test', () => {
    expect(definitionProblem({ key: 'case_feed_v2', variants: ok })).toBeNull();
  });

  it('refuses a bad key, a missing control, wrong sum, duplicates', () => {
    expect(definitionProblem({ key: 'X', variants: ok })).toMatch(/Ключ/);
    expect(
      definitionProblem({
        key: 'abc',
        variants: [
          { key: 'a', weight: 50 },
          { key: 'b', weight: 50 },
        ],
      }),
    ).toMatch(/control/);
    expect(
      definitionProblem({
        key: 'abc',
        variants: [
          { key: 'control', weight: 50 },
          { key: 'b', weight: 40 },
        ],
      }),
    ).toMatch(/100/);
    expect(
      definitionProblem({
        key: 'abc',
        variants: [
          { key: 'control', weight: 50 },
          { key: 'control', weight: 50 },
        ],
      }),
    ).toMatch(/повторя/);
    expect(
      definitionProblem({
        key: 'abc',
        variants: [{ key: 'control', weight: 100 }],
      }),
    ).toMatch(/от 2 до 5/);
  });

  it('refuses silly guardrails', () => {
    expect(
      definitionProblem({
        key: 'abc',
        variants: ok,
        guardrails: { minImpressions: 5 },
      }),
    ).toMatch(/показов/);
  });
});

describe('guardrails and variants parsing', () => {
  it('fills the defaults', () => {
    expect(normalizeGuardrails(null)).toEqual({
      reportsRelIncreasePct: 25,
      errorsRelIncreasePct: 25,
      minImpressions: 1000,
    });
    expect(normalizeGuardrails({ minImpressions: 5000 }).minImpressions).toBe(
      5000,
    );
  });

  it('reads stored variants defensively', () => {
    expect(parseVariants(null)).toEqual([]);
    expect(parseVariants([{ key: 'a', weight: 1 }, { nope: 1 }])).toEqual([
      { key: 'a', weight: 1 },
    ]);
  });

  it('accepts formula weights on a new variant, never on control (2026-11-08)', () => {
    const fine = definitionProblem({
      key: 'case_feed_v3',
      variants: [
        { key: 'control', weight: 50 },
        { key: 'urgent_first', weight: 50, weights: { urgency: 0.4 } },
      ],
    });
    expect(fine).toBeNull();
    expect(
      definitionProblem({
        key: 'case_feed_v3',
        variants: [
          { key: 'control', weight: 50, weights: { urgency: 0.4 } },
          { key: 'b', weight: 50 },
        ],
      }),
    ).toMatch(/control/);
    expect(
      definitionProblem({
        key: 'case_feed_v3',
        variants: [
          { key: 'control', weight: 50 },
          { key: 'b', weight: 50, weights: { urgency: 99 } },
        ],
      }),
    ).toMatch(/от 0 до 10/);
    expect(
      parseVariants([
        { key: 'b', weight: 50, weights: { urgency: 0.4, bad: 'x', 'x-y': 1 } },
      ]),
    ).toEqual([{ key: 'b', weight: 50, weights: { urgency: 0.4 } }]);
  });
});
