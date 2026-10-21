import {
  assertUniquePackIds,
  convertedStars,
  DEFAULT_STAR_PACKS,
  parseStarPacks,
} from './stars.settings';

describe('stars settings', () => {
  it('falls back to the defaults on a broken row', () => {
    expect(parseStarPacks(null)).toBe(DEFAULT_STAR_PACKS);
    expect(parseStarPacks({ packs: 'x' })).toBe(DEFAULT_STAR_PACKS);
  });

  it('drops invalid packs and keeps good ones', () => {
    const packs = parseStarPacks({
      packs: [
        { id: 'ok_1', stars: 10, priceCents: 100 },
        { id: 'Bad', stars: 10, priceCents: 100 },
        { id: 'zero', stars: 0, priceCents: 100 },
        { id: 'cheap', stars: 5, priceCents: 1 },
      ],
    });
    expect(packs).toEqual([{ id: 'ok_1', stars: 10, priceCents: 100 }]);
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      assertUniquePackIds([
        { id: 'a_1', stars: 1, priceCents: 100 },
        { id: 'a_1', stars: 2, priceCents: 200 },
      ]),
    ).toThrow();
  });

  it('converts a gift to stars by the percent, rounding down', () => {
    expect(convertedStars(100, 70)).toBe(70);
    expect(convertedStars(15, 70)).toBe(10);
    expect(convertedStars(100, 0)).toBe(0);
    expect(convertedStars(100, 250)).toBe(100);
    expect(convertedStars(100, -5)).toBe(0);
  });
});
