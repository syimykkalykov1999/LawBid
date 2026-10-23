import { likePattern, searchWords } from './admin-text-search';

describe('admin text search helpers', () => {
  it('keeps letters and digits, lower-cased, at most 6 words', () => {
    expect(searchWords("Visa, B-1 / H1B' résumé a b c d")).toEqual([
      'visa',
      'b',
      '1',
      'h1b',
      'résumé',
      'a',
    ]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('escapes LIKE wildcards', () => {
    expect(likePattern('100%_Off\\')).toBe('%100\\%\\_off\\\\%');
  });
});
