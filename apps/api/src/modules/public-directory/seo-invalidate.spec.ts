import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKOFF_MS,
  MAX_IN_PROGRESS,
  MAX_PATHS,
  MAX_WILDCARDS,
  TRIES,
  capPaths,
  invalidateWithBackoff,
  isLimitError,
} from './seo-invalidate';

const LIMIT =
  'CloudFront invalidation refused: 400 TooManyInvalidationsInProgress';

describe('seo-invalidate (mirror of scripts/seo/lib/invalidate.mjs)', () => {
  it('has the same numbers as the workflow helper', () => {
    const mjs = readFileSync(
      join(__dirname, '../../../../../scripts/seo/lib/invalidate.mjs'),
      'utf8',
    );
    const num = (name: string) =>
      Number(new RegExp(`export const ${name} = (\\d+);`).exec(mjs)?.[1]);
    expect(num('MAX_WILDCARDS')).toBe(MAX_WILDCARDS);
    expect(num('MAX_PATHS')).toBe(MAX_PATHS);
    expect(num('MAX_IN_PROGRESS')).toBe(MAX_IN_PROGRESS);
    const waits = /export const BACKOFF_MS = \[([^\]]+)\]/.exec(mjs)?.[1];
    expect(waits?.split(',').map((w) => Number(w.replace(/_/g, '')))).toEqual([
      ...BACKOFF_MS,
    ]);
    expect(TRIES).toBe(3);
  });

  describe('capPaths', () => {
    it('keeps at most 30 paths, in the given order, without duplicates', () => {
      const paths = Array.from({ length: 45 }, (_, i) => `/p/${i}/`);
      const r = capPaths([...paths, '/p/0/'], { maxWildcards: 0 });
      expect(r.paths).toEqual(paths.slice(0, 30));
      expect(r.dropped).toBe(15);
    });

    it('maxWildcards 0 (the generator) drops every wildcard, /* included', () => {
      const r = capPaths(['/*', '/lawyers/*', '/lawyers/', '/a/b/'], {
        maxWildcards: 0,
      });
      expect(r.paths).toEqual(['/lawyers/', '/a/b/']);
    });

    it('the default allows 10 wildcards; exact paths never count against them', () => {
      const wild = Array.from({ length: 12 }, (_, i) => `/w${i}/*`);
      const r = capPaths([...wild, '/exact/']);
      expect(r.paths.filter((p) => p.includes('*'))).toHaveLength(10);
      expect(r.paths).toContain('/exact/');
    });
  });

  describe('isLimitError', () => {
    it('knows the AWS limit messages only', () => {
      expect(isLimitError(LIMIT)).toBe(true);
      expect(
        isLimitError('You have exceeded the maximum number of in-progress'),
      ).toBe(true);
      expect(isLimitError('AccessDenied')).toBe(false);
      expect(isLimitError(undefined)).toBe(false);
    });
  });

  describe('invalidateWithBackoff', () => {
    const sleep = () => jest.fn(() => Promise.resolve());

    it('nothing to reset: no call', async () => {
      const create = jest.fn();
      const r = await invalidateWithBackoff({
        paths: [],
        create,
        sleep: sleep(),
      });
      expect(r).toEqual({ status: 'nothing', attempts: 0 });
      expect(create).not.toHaveBeenCalled();
    });

    it('creates at once when CloudFront is free', async () => {
      const create = jest.fn(() => Promise.resolve());
      const s = sleep();
      const r = await invalidateWithBackoff({
        paths: ['/lawyers/'],
        create,
        sleep: s,
        inProgress: () => Promise.resolve(2),
      });
      expect(r).toEqual({ status: 'created', attempts: 1 });
      expect(s).not.toHaveBeenCalled();
    });

    it('waits 30 s then 90 s on the limit error, then succeeds', async () => {
      const create = jest
        .fn<Promise<void>, [string[]]>()
        .mockRejectedValueOnce(new Error(LIMIT))
        .mockRejectedValueOnce(new Error(LIMIT))
        .mockResolvedValueOnce();
      const s = sleep();
      const r = await invalidateWithBackoff({
        paths: ['/a/'],
        create,
        sleep: s,
      });
      expect(r).toEqual({ status: 'created', attempts: 3 });
      expect(s.mock.calls).toEqual([[30_000], [90_000]]);
    });

    it('busy by the count: waits, and gives up (skipped) after 3 tries without creating', async () => {
      const create = jest.fn();
      const s = sleep();
      const r = await invalidateWithBackoff({
        paths: ['/a/'],
        create,
        sleep: s,
        inProgress: () => Promise.resolve(12),
      });
      expect(r).toEqual({ status: 'skipped', attempts: 3 });
      expect(create).not.toHaveBeenCalled();
      expect(s).toHaveBeenCalledTimes(2);
    });

    it('a count that cannot be read does not block the reset', async () => {
      const create = jest.fn(() => Promise.resolve());
      const r = await invalidateWithBackoff({
        paths: ['/a/'],
        create,
        sleep: sleep(),
        inProgress: () => Promise.reject(new Error('AccessDenied')),
      });
      expect(r.status).toBe('created');
    });

    it('any other error is thrown', async () => {
      await expect(
        invalidateWithBackoff({
          paths: ['/a/'],
          create: () => Promise.reject(new Error('AccessDenied')),
          sleep: sleep(),
        }),
      ).rejects.toThrow('AccessDenied');
    });
  });
});
