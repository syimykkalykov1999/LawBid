import express from 'express';
import request from 'supertest';
import { responseCompression } from './app.setup';

/** Owner 2026-10-15: answers over 1 KB are compressed, small ones are not. */
describe('responseCompression', () => {
  const app = express();
  app.use(responseCompression());
  const big = {
    items: Array.from({ length: 200 }, (_, i) => ({ id: i, t: 'lawyer' })),
  };
  app.get('/big', (_req, res) => res.json(big));
  app.get('/small', (_req, res) => res.json({ ok: true }));

  it('compresses a big JSON answer and the data is the same', async () => {
    const r = await request(app).get('/big').set('Accept-Encoding', 'gzip');
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(r.body).toEqual(big);
  });

  it('does not compress a small answer', async () => {
    const r = await request(app).get('/small').set('Accept-Encoding', 'gzip');
    expect(r.headers['content-encoding']).toBeUndefined();
  });

  it('does not compress for a client that did not ask', async () => {
    const r = await request(app).get('/big').set('Accept-Encoding', 'identity');
    expect(r.headers['content-encoding']).toBeUndefined();
  });

  it('X-No-Compression switches it off per request', async () => {
    const r = await request(app)
      .get('/big')
      .set('Accept-Encoding', 'gzip')
      .set('X-No-Compression', '1');
    expect(r.headers['content-encoding']).toBeUndefined();
  });
});
