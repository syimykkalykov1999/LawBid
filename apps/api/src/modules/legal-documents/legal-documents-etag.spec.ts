import type { Request, Response } from 'express';
import {
  bumpConfigVersion,
  configTag,
} from '../feature-flags/feature-flags.public';
import { LegalDocumentsController } from './legal-documents.controller';

/** R-385: the public legal answers are a 304 from the config version
 * (publishing a document bumps it via bootstrap.invalidate()). */
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

describe('GET /legal/documents cheap ETag (R-385)', () => {
  const build = () => {
    const redis = fakeRedis();
    const docs = {
      publicTag: (type?: string, locale?: string) =>
        configTag(redis as never, 'legal', type ?? '*', locale ?? ''),
      listCurrent: jest.fn().mockResolvedValue([]),
      currentText: jest.fn().mockResolvedValue({ docType: 'terms' }),
    };
    const c = new LegalDocumentsController(docs as never, {} as never);
    return { c, docs, redis };
  };
  const terms = { type: 'terms' } as never;
  const privacy = { type: 'privacy' } as never;
  const ru = { locale: 'ru' } as never;

  it('list: a matching tag is a 304 without a query', async () => {
    const { c, docs } = build();
    const first = http();
    await c.listCurrentLegalDocuments(first.req, first.res);
    const again = http(first.headers.ETag);
    expect(
      await c.listCurrentLegalDocuments(again.req, again.res),
    ).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(docs.listCurrent).toHaveBeenCalledTimes(1);
  });

  it('text: the tag is per type, and a publish changes it', async () => {
    const { c, docs, redis } = build();
    const first = http();
    await c.getCurrentLegalDocument(terms, ru, first.req, first.res);
    const same = http(first.headers.ETag);
    expect(
      await c.getCurrentLegalDocument(terms, ru, same.req, same.res),
    ).toBeUndefined();
    const other = http(first.headers.ETag);
    expect(
      await c.getCurrentLegalDocument(privacy, ru, other.req, other.res),
    ).toBeDefined();
    await bumpConfigVersion(redis as never);
    const after = http(first.headers.ETag);
    expect(
      await c.getCurrentLegalDocument(terms, ru, after.req, after.res),
    ).toBeDefined();
    expect(docs.currentText).toHaveBeenCalledTimes(3);
  });
});
