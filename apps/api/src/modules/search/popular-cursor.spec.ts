import { decodePopularCursor, encodePopularCursor } from './search.service';

describe('popular posts keyset cursor (owner 2026-10-14)', () => {
  it('round-trips the four sort keys', () => {
    const k = {
      likes: 50,
      comments: 3,
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      id: '3f1d3c52-0000-4000-8000-000000000001',
    };
    expect(decodePopularCursor(encodePopularCursor(k))).toEqual(k);
  });

  it('refuses garbage instead of paging from a wrong place', () => {
    expect(decodePopularCursor('not-a-cursor')).toBeUndefined();
    expect(
      decodePopularCursor(
        Buffer.from(JSON.stringify([1.5, 2, 'x', 3])).toString('base64url'),
      ),
    ).toBeUndefined();
  });
});
