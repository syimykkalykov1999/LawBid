import express from 'express';
import request from 'supertest';
import { CONTACTS_SYNC_PATH, useBodyParsers } from './app.setup';

/** Owner 2026-10-22: the whole phone book in one request. */
describe('useBodyParsers', () => {
  const app = express();
  useBodyParsers(app as never, '256kb');
  app.post('*path', (req, res) => {
    res.json({ n: (req.body as { hashes?: unknown[] }).hashes?.length ?? 0 });
  });
  const hashes = (n: number) =>
    Array.from({ length: n }, (_, i) => i.toString(16).padStart(64, '0'));

  it('POST /contacts/sync takes 10 000 hashes (~670 KB)', async () => {
    const res = await request(app)
      .post(CONTACTS_SYNC_PATH)
      .send({ hashes: hashes(10000) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ n: 10000 });
  });

  it('every other route keeps the general cap', async () => {
    const res = await request(app)
      .post('/api/v1/posts')
      .send({ hashes: hashes(10000) });
    expect(res.status).toBe(413);
  });
});
