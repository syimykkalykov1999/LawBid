import { caseQueryWords } from './postgres-search.provider';

/** Owner 2026-10-28: a mixed case query («развод в бруклине», «dui in
 * texas») — every meaningful word must name the text, topic or place. */
describe('caseQueryWords', () => {
  it('drops little words and 1-letter words, keeps at most 4', () => {
    expect(caseQueryWords('DUI in Texas')).toEqual(['dui', 'texas']);
    expect(caseQueryWords('развод в бруклине')).toEqual(['развод', 'бруклине']);
    expect(caseQueryWords('a b c')).toEqual([]);
    expect(caseQueryWords('one two three four five')).toHaveLength(4);
  });
});
