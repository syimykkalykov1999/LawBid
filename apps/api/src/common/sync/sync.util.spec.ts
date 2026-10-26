import { HttpException } from '@nestjs/common';
import { etagMatches, notModified, weakEtag } from './cheap-etag';
import { parseUpdatedSince, syncedAt } from './sync.util';

describe('delta sync helpers (client economy plan §4)', () => {
  const now = new Date('2026-10-22T12:00:00Z');

  it('parses a fresh updatedSince', () => {
    expect(parseUpdatedSince('2026-10-22T11:00:00Z', now)).toEqual(
      new Date('2026-10-22T11:00:00Z'),
    );
    expect(parseUpdatedSince(undefined, now)).toBeUndefined();
    expect(parseUpdatedSince('', now)).toBeUndefined();
  });

  it('a gap older than 7 days is 409 SYNC_TOO_OLD', () => {
    try {
      parseUpdatedSince('2026-10-10T00:00:00Z', now);
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(409);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: 'SYNC_TOO_OLD',
      });
    }
  });

  it('garbage is 400 VALIDATION_ERROR', () => {
    expect(() => parseUpdatedSince('yesterday', now)).toThrow(HttpException);
  });

  it('syncedAt is the newest row stamp, or the request time when nothing changed', () => {
    const since = new Date('2026-10-22T10:00:00Z');
    expect(
      syncedAt(
        [
          new Date('2026-10-22T10:30:00Z'),
          null,
          new Date('2026-10-22T11:15:00Z'),
        ],
        since,
      ),
    ).toBe('2026-10-22T11:15:00.000Z');
    expect(syncedAt([], since)).toBe('2026-10-22T10:00:00.000Z');
  });
});

describe('cheap ETag', () => {
  it('builds a weak tag from parts', () => {
    expect(weakEtag(new Date(1_000), 3, 'v2')).toBe('W/"1000-3-v2"');
  });

  it('matches weak and strong forms, lists and *', () => {
    expect(etagMatches('W/"a-1"', 'W/"a-1"')).toBe(true);
    expect(etagMatches('"a-1"', 'W/"a-1"')).toBe(true);
    expect(etagMatches('W/"x", W/"a-1"', 'W/"a-1"')).toBe(true);
    expect(etagMatches('*', 'W/"a-1"')).toBe(true);
    expect(etagMatches('W/"a-2"', 'W/"a-1"')).toBe(false);
    expect(etagMatches(undefined, 'W/"a-1"')).toBe(false);
  });

  it('notModified sets the header and 304 only on a match', () => {
    const res = { setHeader: jest.fn(), status: jest.fn() };
    expect(
      notModified({ headers: { 'if-none-match': 'W/"t"' } }, res, 'W/"t"'),
    ).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('ETag', 'W/"t"');
    expect(res.status).toHaveBeenCalledWith(304);

    const res2 = { setHeader: jest.fn(), status: jest.fn() };
    expect(notModified({ headers: {} }, res2, 'W/"t"')).toBe(false);
    expect(res2.status).not.toHaveBeenCalled();
  });
});
