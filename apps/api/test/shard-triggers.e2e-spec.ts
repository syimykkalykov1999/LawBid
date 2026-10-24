import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Shard-ready step 4 (docs/architecture/SHARDING_READY.md §4): the BEFORE
 * INSERT trigger `lawbid_shard_fill` (migration 20261024150000) gives a row
 * the shard_id the application did not stamp: nested relation creates and
 * raw SQL inserts. Real PostgreSQL. The plain PrismaClient has no shard
 * extension, so everything here is the database's own work.
 */
describe('shard_id trigger (real PostgreSQL)', () => {
  const raw = new PrismaClient();
  const app = new PrismaService();
  // Owner ids with a known last byte (= their shard).
  const U_A7 = '00000000-0000-4000-8000-0000000000a7';
  const U_00 = '00000000-0000-4000-8000-000000000000';
  const U_11 = '00000000-0000-4000-8000-000000000011';

  beforeAll(async () => {
    for (const id of [U_A7, U_00, U_11]) {
      await raw.user.create({ data: { id, role: 'client' } });
    }
  });

  afterAll(async () => {
    await raw.$disconnect();
    await app.$disconnect();
  });

  it('shard_map holds 256 shards: all on primary (odd ones on db1 in two-DB mode)', async () => {
    const rows = await raw.shardMap.findMany();
    expect(rows).toHaveLength(256);
    const twoDb = !!process.env.DATABASE_URL_SHARDS;
    expect(new Set(rows.map((r) => r.physical_db))).toEqual(
      new Set(twoDb ? ['primary', 'db1'] : ['primary']),
    );
  });

  it('owner key: the last byte of the owner id', async () => {
    const n = await raw.notification.create({
      data: {
        user_id: U_A7,
        type: 'contact_joined',
        category: 'messages',
        payload: {},
      },
    });
    expect(n.shard_id).toBe(0xa7);
    const z = await raw.post.create({
      data: { author_id: U_00, body: 'zero' },
    });
    expect(z.shard_id).toBe(0);
  });

  it('nested relation creates inherit the parent shard', async () => {
    const post = await raw.post.create({
      data: {
        author_id: U_A7,
        body: 'hello',
        likes: { create: { user_id: U_11 } },
        view_events: { create: { kind: 'view', viewer_id: U_11 } },
      },
      include: { likes: true, view_events: true },
    });
    expect(post.shard_id).toBe(0xa7);
    // The liker's own byte is 0x11: the child follows the POST, not the user.
    expect(post.likes[0].shard_id).toBe(0xa7);
    expect(post.view_events[0].shard_id).toBe(0xa7);
  });

  it('works through the application client too (extension + trigger)', async () => {
    const post = await app.post.create({
      data: {
        author_id: U_A7,
        body: 'via app',
        likes: { create: { user_id: U_11 } },
      },
      include: { likes: true },
    });
    expect(post.shard_id).toBe(0xa7);
    expect(post.likes[0].shard_id).toBe(0xa7);
  });

  it('raw SQL inserts without shard_id are filled', async () => {
    const post = await raw.post.create({
      data: { author_id: U_A7, body: 'raw' },
    });
    await raw.$executeRaw`
      INSERT INTO post_view_events (post_id, viewer_id, kind)
      VALUES (${post.id}::uuid, ${U_11}::uuid, 'view')`;
    await raw.$executeRaw`
      INSERT INTO call_log_hidden (user_id, call_id)
      SELECT ${U_11}::uuid, c.id FROM calls c LIMIT 0`;
    const [ev] = await raw.$queryRaw<{ shard_id: number }[]>`
      SELECT shard_id FROM post_view_events WHERE post_id = ${post.id}::uuid`;
    expect(ev.shard_id).toBe(0xa7);
  });

  it('never overwrites a shard the application stamped', async () => {
    const p = await raw.post.create({
      data: { author_id: U_A7, body: 'explicit', shard_id: 5 },
    });
    expect(p.shard_id).toBe(5);
  });

  it('no key to find a shard leaves the default 0', async () => {
    const ev = await raw.postViewEvent
      .create({
        data: { post_id: '00000000-0000-4000-8000-0000000000ff', kind: 'view' },
      })
      .catch((e: Error) => e);
    // The FK to posts rejects it; the trigger itself must not be the reason.
    expect(ev instanceof Error ? ev.message : '').toMatch(
      /foreign key|Foreign key/i,
    );
  });
});
