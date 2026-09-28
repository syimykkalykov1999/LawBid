import { reviewerDisplayName } from './review-display';
import { displayRating } from './review-rating';

describe('reviewerDisplayName (docs/03 §7.4 "Anna K.")', () => {
  it.each([
    ['Anna', 'Kowalski', 'Anna K.'],
    ['  Anna ', ' kowalski', 'Anna K.'],
    ['Élodie', 'Ångström', 'Élodie Å.'],
    ['Anna', null, 'Anna'],
    ['Anna', '   ', 'Anna'],
    [null, 'Kowalski', null],
    ['  ', 'Kowalski', null],
  ])('%p %p -> %p', (first, last, expected) => {
    expect(reviewerDisplayName(first, last)).toBe(expected);
  });

  it('never leaks more than the surname initial', () => {
    expect(reviewerDisplayName('Anna', 'Kowalski')).not.toContain('owalski');
  });
});

describe('displayRating (one decimal, §7.4)', () => {
  it.each([
    [4.5, 4.5],
    [4.67, 4.7],
    [4.24, 4.2],
    [5, 5],
  ])('%p -> %p', (avg, shown) => {
    expect(displayRating(avg)).toBe(shown);
  });
});
