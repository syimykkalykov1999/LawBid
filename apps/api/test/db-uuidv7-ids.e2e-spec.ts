import { PrismaClient } from '../src/generated/prisma/client';
import { pgAdapter } from '../src/prisma/pg-adapter';

/**
 * G4 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md), against a real PostgreSQL 18
 * after `prisma migrate deploy`:
 * - the hot append tables default to the built-in time-ordered `uuidv7()`;
 * - a row inserted without an id gets a version 7 id, and later rows get
 *   larger ids (the B-tree grows at its right edge, like Snowflake ids);
 * - tables whose id is a link secret keep random v4 ids.
 */
describe('DB — time-ordered ids (uuidv7) on the hot tables', () => {
  const db = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM auth_events WHERE event_type = 'test.uuidv7'`;
    await db.$disconnect();
  });

  async function idDefault(table: string): Promise<string | null> {
    const [row] = await db.$queryRaw<{ d: string | null }[]>`
      SELECT column_default AS d FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
        AND column_name = 'id'`;
    return row?.d ?? null;
  }

  it.each([
    'messages',
    'chat_group_messages',
    'notifications',
    'posts',
    'comments',
    'post_view_events',
    'files',
    'domain_events',
    'auth_events',
    'cross_family_outbox',
    'support_messages',
  ])('%s defaults to uuidv7()', async (table) => {
    expect(await idDefault(table)).toBe('uuidv7()');
  });

  it.each([
    'chat_group_invites',
    'case_invites',
    'case_shares',
    'post_shares',
    'calendar_feed_tokens',
  ])('%s keeps gen_random_uuid() (link secret)', async (table) => {
    expect(await idDefault(table)).toBe('gen_random_uuid()');
  });

  it('a row without an id gets a v7 id, and the next row a larger one', async () => {
    const rows: { id: string; v: number }[] = [];
    for (let i = 0; i < 5; i += 1) {
      const [row] = await db.$queryRaw<{ id: string; v: number }[]>`
        INSERT INTO auth_events (event_type, success)
        VALUES ('test.uuidv7', true)
        RETURNING id::TEXT AS id, uuid_extract_version(id)::INT AS v`;
      rows.push(row);
      // Past the same millisecond, so the order is the clock's, not the
      // sub-millisecond counter's.
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(rows.map((r) => r.v)).toEqual([7, 7, 7, 7, 7]);
    const sorted = [...rows.map((r) => r.id)].sort();
    expect(rows.map((r) => r.id)).toEqual(sorted);
  });
});
