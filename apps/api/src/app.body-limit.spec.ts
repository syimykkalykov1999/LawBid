import express from 'express';
import request from 'supertest';
import {
  ADMIN_BULK_PATHS,
  CONTACTS_SYNC_PATH,
  useBodyParsers,
} from './app.setup';
import { OWNER_BULK_MAX } from './common/admin-bulk/admin-bulk';

/** Owner 2026-10-22: the whole phone book in one request. */
describe('useBodyParsers', () => {
  const app = express();
  useBodyParsers(app as never, '256kb');
  app.post('*path', (req, res) => {
    const b = req.body as { hashes?: unknown[]; ids?: unknown[] };
    res.json({ n: (b.hashes ?? b.ids)?.length ?? 0 });
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

  it('owner 12.11: admin bulk routes take OWNER_BULK_MAX uuids', async () => {
    const ids = Array.from(
      { length: OWNER_BULK_MAX },
      (_, i) => `00000000-0000-4000-8000-${`${i}`.padStart(12, '0')}`,
    );
    for (const path of ADMIN_BULK_PATHS) {
      const res = await request(app).post(path).send({ ids, reason: 'x' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ n: OWNER_BULK_MAX });
    }
  });
});
