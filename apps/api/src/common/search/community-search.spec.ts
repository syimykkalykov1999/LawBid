import {
  communityQuery,
  communityTier,
  rankCommunities,
} from './community-search';

describe('community search', () => {
  it('needs two letters; a leading @ is dropped', () => {
    expect(communityQuery('a')).toBeNull();
    expect(communityQuery('  ')).toBeNull();
    expect(communityQuery('@tax')?.words).toEqual(['tax']);
  });

  it('every word must be somewhere in the title or the @username', () => {
    const q = communityQuery('tax law')!;
    expect(communityTier('Law and tax', null, q)).not.toBeNull();
    expect(communityTier('Tax questions', null, q)).toBeNull();
    expect(communityTier('Tax', 'law_chat', q)).not.toBeNull();
  });

  it('orders exact, starts with, word start, inside — then by size', () => {
    const q = communityQuery('tax')!;
    const rows = [
      { title: 'Syntax help', username: null, size: 900 },
      { title: 'Big tax club', username: null, size: 500 },
      { title: 'Tax', username: null, size: 1 },
      { title: 'Tax advice', username: null, size: 50 },
      { title: 'Tax tips', username: null, size: 80 },
    ];
    expect(rankCommunities(rows, q, (r) => r, 10).map((r) => r.title)).toEqual([
      'Tax',
      'Tax tips',
      'Tax advice',
      'Big tax club',
      'Syntax help',
    ]);
  });

  it('works in other alphabets', () => {
    const q = communityQuery('налог')!;
    expect(communityTier('Налоги и право', null, q)).toBe(1);
    expect(communityTier('Семья', null, q)).toBeNull();
  });
});
