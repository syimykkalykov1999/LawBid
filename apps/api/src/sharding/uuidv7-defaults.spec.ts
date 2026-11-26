import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * G4 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the hot append tables
 * default to PostgreSQL 18's time-ordered `uuidv7()`; tables whose id is a
 * link secret stay random v4 (`gen_random_uuid()`), because a v7 id tells
 * when the row was made and has 74 random bits instead of 122.
 * Schema and migrations must agree (a prisma migrate diff would show drift).
 */
const PRISMA = join(__dirname, '../../prisma');
const SCHEMA = readFileSync(join(PRISMA, 'schema.prisma'), 'utf8');

const HOT_V7_TABLES = [
  'messages',
  'chat_group_messages',
  'message_edits',
  'notifications',
  'posts',
  'post_media',
  'comments',
  'post_views',
  'post_view_events',
  'stories',
  'channel_posts',
  'channel_comments',
  'files',
  'file_access_log',
  'domain_events',
  'auth_events',
  'cross_family_outbox',
  'work_lease_events',
  'case_task_events',
  'support_messages',
] as const;

const LINK_SECRET_TABLES = [
  'chat_group_invites',
  'case_invites',
  'case_shares',
  'post_shares',
  'channel_post_shares',
  'calendar_feed_tokens',
  'calendar_event_links',
] as const;

/** table name -> the `id` line of its model. */
function idLines(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of SCHEMA.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const table = /@@map\("([^"]+)"\)/.exec(m[2])?.[1] ?? m[1];
    const id = m[2].split('\n').find((l) => /^\s+id\s/.test(l));
    if (id) out.set(table, id);
  }
  return out;
}

describe('time-ordered ids (uuidv7) on the hot tables', () => {
  const ids = idLines();

  it.each(HOT_V7_TABLES)('%s defaults to uuidv7()', (table) => {
    expect(ids.get(table)).toContain('@default(dbgenerated("uuidv7()"))');
  });

  it.each(LINK_SECRET_TABLES)(
    '%s keeps a random v4 id (its id is a link secret)',
    (table) => {
      expect(ids.get(table)).toContain(
        '@default(dbgenerated("gen_random_uuid()"))',
      );
    },
  );

  it('one additive migration sets exactly these defaults', () => {
    const dir = join(PRISMA, 'migrations');
    const sql = readdirSync(dir)
      .filter((d) => existsSync(join(dir, d, 'migration.sql')))
      .map((d) => readFileSync(join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    for (const table of HOT_V7_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuidv7();`,
      );
    }
    for (const table of LINK_SECRET_TABLES) {
      expect(sql).not.toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuidv7();`,
      );
    }
  });
});
