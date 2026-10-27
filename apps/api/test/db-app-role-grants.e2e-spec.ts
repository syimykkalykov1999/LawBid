import { PrismaClient } from '@prisma/client';

/**
 * Deploy safety audit 2026-10-27: CI connects as a superuser, production as
 * `lawbid_app`. A privilege the app role lacks is therefore invisible in CI
 * and breaks only on the server — it happened with sequences: SERIAL /
 * BIGSERIAL defaults need USAGE on the sequence, the baseline granted only
 * tables, and search_query_log / search_clicks / search_outbox /
 * shard_change_log / admin_appeals inserts failed in production with
 * "permission denied for sequence" (fixed by 20261107134000_app_sequence_grants,
 * which also sets the default for sequences created later).
 */
describe('DB — the app role can use every sequence (prod connects as lawbid_app)', () => {
  const root = new PrismaClient();

  afterAll(async () => {
    await root.$disconnect();
  });

  it('lawbid_app has USAGE on every sequence in public', async () => {
    const rows = await root.$queryRaw<{ seq: string; ok: boolean }[]>`
      SELECT c.relname AS seq,
             has_sequence_privilege('lawbid_app', c.oid, 'USAGE') AS ok
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'S' AND n.nspname = 'public'`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.ok).map((r) => r.seq)).toEqual([]);
  });

  it('a BIGSERIAL insert works as lawbid_app (search query log)', async () => {
    // SET LOCAL ROLE: the permission checks of lawbid_app without its
    // password (local Postgres asks for one, CI trusts). The transaction is
    // rolled back on purpose, so nothing stays behind.
    const q = `deploy-safety-${Date.now()}`;
    const rollback = new Error('rollback on purpose');
    let inserted = 0;
    await expect(
      root.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE lawbid_app');
        inserted = await tx.$executeRaw`
          INSERT INTO search_query_log (q, scope, results) VALUES (${q}, 'people', 0)`;
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(inserted).toBe(1);
  });
});
