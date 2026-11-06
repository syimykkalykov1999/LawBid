import type { Request, Response } from 'express';
import { bumpConfigVersion } from '../../feature-flags/feature-flags.public';
import { I18nLanguagesService } from '../services/i18n-languages.service';
import { I18nController } from './i18n.controller';

/** R-385: GET /i18n/languages answers 304 from the config version, before
 * any query; a language change (version bump) gives the new list. */
function http(ifNoneMatch?: string) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: jest.fn(),
  };
  const req = { headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {} };
  return {
    req: req as unknown as Request,
    res: res as unknown as Response,
    status: res.status,
    headers,
  };
}

/** A Redis double for the config version counter. */
function fakeRedis() {
  const kv = new Map<string, string>();
  return {
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    incr: jest.fn((k: string) => {
      const n = Number(kv.get(k) ?? 0) + 1;
      kv.set(k, String(n));
      return Promise.resolve(n);
    }),
  };
}

describe('GET /i18n/languages cheap ETag (R-385)', () => {
  const build = () => {
    const redis = fakeRedis();
    const prisma = {
      i18nLanguage: { findMany: jest.fn().mockResolvedValue([{ code: 'en' }]) },
    };
    const svc = new I18nLanguagesService(prisma as never, redis as never);
    const c = new I18nController(svc, {} as never);
    return { c, prisma, redis };
  };

  it('a repeated request with the tag is a 304 without a query', async () => {
    const { c, prisma } = build();
    const first = http();
    expect(await c.listLanguages(first.req, first.res)).toEqual([
      { code: 'en' },
    ]);
    expect(first.headers.ETag).toMatch(/^W\/"langs-/);
    prisma.i18nLanguage.findMany.mockClear();
    const again = http(first.headers.ETag);
    expect(await c.listLanguages(again.req, again.res)).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(prisma.i18nLanguage.findMany).not.toHaveBeenCalled();
  });

  it('a config change (new or switched language) answers the new list', async () => {
    const { c, prisma, redis } = build();
    const first = http();
    await c.listLanguages(first.req, first.res);
    await bumpConfigVersion(redis as never);
    const again = http(first.headers.ETag);
    expect(await c.listLanguages(again.req, again.res)).toBeDefined();
    expect(again.status).not.toHaveBeenCalled();
    expect(prisma.i18nLanguage.findMany).toHaveBeenCalledTimes(2);
  });
});
