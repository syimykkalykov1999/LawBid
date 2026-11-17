import { growthbookHash } from './hash';

/**
 * The "hash" cases of the GrowthBook SDK test suite for version 2
 * (packages/sdk-js/test/cases.json, tag v5.2.0, MIT): [seed, value, expected].
 * Our copy must give exactly what every GrowthBook SDK gives.
 */
const GROWTHBOOK_V2_CASES: [string, string, number][] = [
  ['seed', 'a', 0.0505],
  ['seed', 'b', 0.2696],
  ['foo', 'ab', 0.2575],
  ['foo', 'def', 0.2019],
  ['89123klj', '8952klfjas09ujkasdf', 0.124],
  ['90850943850283058242805', '123', 0.7516],
  ['()**(%$##$%#$#', '___)((*":&', 0.0128],
  ['bucket-range-rounding', 'user-3436', 0.22],
  ['bucket-range-rounding', 'user-1177', 0.344],
  ['bucket-range-rounding', 'user-427', 0.109],
  ['bucket-range-rounding', 'user-68525', 0.818],
  ['bucket-range-rounding', 'user-866', 0.172],
  ['', 'josé', 0.1315],
  ['', '用户123', 0.3071],
  ['', '😀', 0.4971],
  ['expérience', '123', 0.9001],
];

describe('growthbookHash (GrowthBook SDK hash v2)', () => {
  it.each(GROWTHBOOK_V2_CASES)('hash(%j, %j) = %d', (seed, value, want) => {
    expect(growthbookHash(seed, value)).toBe(want);
  });

  it('is always in [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const h = growthbookHash('s', `u${i}`);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
