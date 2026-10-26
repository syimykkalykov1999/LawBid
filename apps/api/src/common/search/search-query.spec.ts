import { parseSearchQuery } from './search-query';

describe('parseSearchQuery', () => {
  it('ANDs the words and makes the last one a prefix', () => {
    expect(parseSearchQuery('Green Ca').tsquery).toBe("'green' & 'ca':*");
    expect(parseSearchQuery('immigr').tsquery).toBe("'immigr':*");
  });

  it('keeps only letters and digits (no tsquery syntax gets through)', () => {
    expect(parseSearchQuery("a' | b:*) & !c").tokens).toEqual(['a', 'b', 'c']);
    expect(parseSearchQuery("'; DROP TABLE x;--").tsquery).not.toContain(';');
  });

  it('works for other alphabets and caps the size', () => {
    expect(parseSearchQuery('Грин-карта США').tokens).toEqual([
      'грин',
      'карта',
      'сша',
    ]);
    expect(parseSearchQuery('a b c d e f g h i j').tokens).toHaveLength(8);
    expect(parseSearchQuery('x'.repeat(100)).tokens[0]).toHaveLength(40);
  });

  it('is empty for punctuation only', () => {
    expect(parseSearchQuery('@#!?').tsquery).toBe('');
  });
});
