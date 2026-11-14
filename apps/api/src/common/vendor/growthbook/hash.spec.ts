import { hash } from './hash';

/** GrowthBook's own test vectors, copied from packages/sdk-js/test/cases.json
 * ("hash", MIT): [seed, value, version, expected]. */
const CASES: [string, string, number, number | null][] = [
  ['', 'a', 1, 0.22],
  ['', 'b', 1, 0.077],
  ['b', 'a', 1, 0.946],
  ['ef', 'd', 1, 0.652],
  ['asdf', '8952klfjas09ujk', 1, 0.549],
  ['', '123', 1, 0.011],
  ['', '___)((*":&', 1, 0.563],
  ['seed', 'a', 2, 0.0505],
  ['seed', 'b', 2, 0.2696],
  ['foo', 'ab', 2, 0.2575],
  ['foo', 'def', 2, 0.2019],
  ['89123klj', '8952klfjas09ujkasdf', 2, 0.124],
  ['90850943850283058242805', '123', 2, 0.7516],
  ['()**(%$##$%#$#', '___)((*":&', 2, 0.0128],
  ['abc', 'def', 99, null],
  ['bucket-range-rounding', 'user-3436', 2, 0.22],
  ['bucket-range-rounding', 'user-1177', 2, 0.344],
  ['bucket-range-rounding', 'user-427', 2, 0.109],
  ['bucket-range-rounding', 'user-68525', 2, 0.818],
  ['bucket-range-rounding', 'user-866', 2, 0.172],
  ['bucket-range-rounding', 'user-74', 1, 0.287],
  ['bucket-range-rounding', 'user-549', 1, 0.344],
  ['', 'josé', 1, 0.586],
  ['', 'josé', 2, 0.1315],
  ['', '用户123', 2, 0.3071],
  ['', '😀', 2, 0.4971],
  ['expérience', '123', 2, 0.9001],
];

describe('vendored GrowthBook hash', () => {
  it.each(CASES)('hash(%j, %j, v%d) = %j', (seed, value, version, want) => {
    expect(hash(seed, value, version)).toBe(want);
  });
});
