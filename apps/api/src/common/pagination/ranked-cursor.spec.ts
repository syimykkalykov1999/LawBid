import {
  decodeRankedCursor,
  encodeRankedCursor,
  rankedAfter,
} from './ranked-cursor';

describe('ranked cursor', () => {
  const key = {
    rank: 4,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    id: 'r9',
  };

  it('round-trips', () => {
    expect(decodeRankedCursor(encodeRankedCursor(key))).toEqual(key);
  });

  it('an old offset cursor or garbage does not decode', () => {
    expect(decodeRankedCursor('20')).toBeUndefined();
    expect(
      decodeRankedCursor(Buffer.from('o:20').toString('base64url')),
    ).toBeUndefined();
    expect(decodeRankedCursor('!!!')).toBeUndefined();
  });

  it('builds "after" for a descending rank', () => {
    expect(rankedAfter('rating', 'desc', key)).toEqual({
      OR: [
        { rating: { lt: 4 } },
        {
          rating: 4,
          OR: [
            { created_at: { lt: key.createdAt } },
            { created_at: key.createdAt, id: { lt: 'r9' } },
          ],
        },
      ],
    });
  });

  it('uses gt for an ascending rank', () => {
    expect(rankedAfter('rating', 'asc', key).OR[0]).toEqual({
      rating: { gt: 4 },
    });
  });
});
