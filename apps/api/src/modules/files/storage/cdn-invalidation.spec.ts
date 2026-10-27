import type Redis from 'ioredis';
import {
  CdnInvalidationQueue,
  MAX_WILDCARD_PATHS_PER_REQUEST,
  baseKeyOf,
  invalidationPath,
  invalidationPaths,
} from './cdn-invalidation';
import { invalidationBody } from './cloudfront-invalidation.client';

/** Just the Redis commands the queue uses. */
function fakeRedis() {
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, number>();
  const redis = {
    sadd: jest.fn((k: string, ...m: string[]) => {
      const s = sets.get(k) ?? new Set<string>();
      m.forEach((x) => s.add(x));
      sets.set(k, s);
      return Promise.resolve(m.length);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    scard: jest.fn((k: string) => Promise.resolve(sets.get(k)?.size ?? 0)),
    spop: jest.fn((k: string, n: number) => {
      const s = sets.get(k) ?? new Set<string>();
      const out = [...s].slice(0, n);
      out.forEach((x) => s.delete(x));
      return Promise.resolve(out);
    }),
    get: jest.fn((k: string) =>
      Promise.resolve(strings.has(k) ? String(strings.get(k)) : null),
    ),
    incrby: jest.fn((k: string, n: number) => {
      strings.set(k, (strings.get(k) ?? 0) + n);
      return Promise.resolve(strings.get(k));
    }),
  };
  return { redis: redis as unknown as Redis, sets, strings };
}

describe('invalidation paths', () => {
  it('strips size variants and AVIF twins to one wildcard per file', () => {
    expect(baseKeyOf('avatars/u1/f1_w256.avif')).toBe('avatars/u1/f1');
    expect(baseKeyOf('posts/p/f1_w1080')).toBe('posts/p/f1');
    expect(baseKeyOf('posts/p/f1.avif')).toBe('posts/p/f1');
    expect(invalidationPath('avatars/u1/f1_w256')).toBe('/avatars/u1/f1*');
    expect(
      invalidationPaths([
        'a/f1',
        'a/f1_w320',
        'a/f1_w1080',
        'a/f1.avif',
        'a/f1_w320.avif',
        'a/f2',
      ]),
    ).toEqual(['/a/f1*', '/a/f2*']);
  });

  it('percent-encodes odd characters but keeps slashes', () => {
    expect(invalidationPath('a b/c#d')).toBe('/a%20b/c%23d*');
  });

  it('builds the CloudFront XML batch', () => {
    const body = invalidationBody(['/a*', '/b&c*'], 'ref-1');
    expect(body).toContain('<Quantity>2</Quantity>');
    expect(body).toContain('<Path>/a*</Path>');
    expect(body).toContain('<Path>/b&amp;c*</Path>');
    expect(body).toContain('<CallerReference>ref-1</CallerReference>');
  });
});

describe('CdnInvalidationQueue', () => {
  const now = new Date('2026-10-25T10:00:00Z');

  it('collapses repeats and sends one batched request per distribution', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    await q.enqueue('media', ['a/f1', 'a/f1_w320', 'a/f2']);
    await q.enqueue('media', ['a/f1']);
    await q.enqueue('documents', ['d/x']);
    expect(await q.pending('media')).toBe(2);
    const send = jest.fn(() => Promise.resolve());
    const res = await q.flush(send, {
      distributions: { media: 'EMEDIA12345', documents: 'EDOCS123456' },
      batchMax: 500,
      monthlyCap: 1000,
      now,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith({
      distributionId: 'EMEDIA12345',
      paths: expect.arrayContaining(['/a/f1*', '/a/f2*']),
    });
    expect(res).toMatchObject({ requests: 2, paths: 3, dropped: 0 });
    expect(await q.pending('media')).toBe(0);
  });

  it('does nothing for a target without a distribution id', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    await q.enqueue('media', ['a/f1']);
    const send = jest.fn(() => Promise.resolve());
    const res = await q.flush(send, {
      distributions: {},
      batchMax: 10,
      monthlyCap: 0,
      now,
    });
    expect(send).not.toHaveBeenCalled();
    expect(res.paths).toBe(0);
  });

  it('puts the paths back when CloudFront fails', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    await q.enqueue('media', ['a/f1', 'a/f2']);
    const onError = jest.fn();
    const res = await q.flush(
      () => Promise.reject(new Error('boom')),
      {
        distributions: { media: 'EMEDIA12345' },
        batchMax: 10,
        monthlyCap: 0,
        now,
      },
      onError,
    );
    expect(res.requeued).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await q.pending('media')).toBe(2);
  });

  it('respects the batch size and the monthly cap', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    await q.enqueue('media', ['a/1', 'a/2', 'a/3', 'a/4']);
    const send = jest.fn(() => Promise.resolve());
    const opts = {
      distributions: { media: 'EMEDIA12345' },
      batchMax: 3,
      monthlyCap: 4,
      now,
    };
    expect((await q.flush(send, opts)).paths).toBe(3);
    // 1 left in the queue, cap leaves room for exactly 1 more path.
    expect((await q.flush(send, opts)).paths).toBe(1);
    await q.enqueue('media', ['a/5', 'a/6']);
    const res = await q.flush(send, opts);
    expect(res).toMatchObject({ paths: 0, dropped: 2 });
  });

  it('the daily ceiling holds paths back for tomorrow (they stay queued)', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    await q.enqueue('media', ['a/1', 'a/2', 'a/3']);
    const send = jest.fn(() => Promise.resolve());
    const opts = {
      distributions: { media: 'EMEDIA12345' },
      batchMax: 10,
      monthlyCap: 0,
      dailyCap: 2,
      now,
    };
    const first = await q.flush(send, opts);
    expect(first).toMatchObject({ paths: 2, dropped: 0 });
    expect(await q.pending('media')).toBe(1);
    // Same day: no room left, nothing sent, nothing lost.
    expect((await q.flush(send, opts)).paths).toBe(0);
    expect(await q.pending('media')).toBe(1);
    // Next day: it goes.
    const tomorrow = new Date('2026-10-26T10:00:00Z');
    expect((await q.flush(send, { ...opts, now: tomorrow })).paths).toBe(1);
  });

  it('never sends more than 15 wildcard paths in one request (CloudFront quota)', async () => {
    const { redis } = fakeRedis();
    const q = new CdnInvalidationQueue(redis);
    const keys = Array.from({ length: 40 }, (_, i) => `a/f${i}`);
    await q.enqueue('media', keys);
    const send = jest.fn(() => Promise.resolve());
    const res = await q.flush(send, {
      distributions: { media: 'EMEDIA12345' },
      batchMax: 500,
      monthlyCap: 0,
      now,
    });
    expect(MAX_WILDCARD_PATHS_PER_REQUEST).toBe(15);
    expect(send).toHaveBeenCalledTimes(1);
    const [sent] = send.mock.calls[0] as unknown as [{ paths: string[] }];
    expect(sent.paths).toHaveLength(15);
    expect(res.paths).toBe(15);
    expect(await q.pending('media')).toBe(25);
  });
});
