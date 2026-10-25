import { Prisma, PrismaClient } from '@prisma/client';
import { familyOf } from '../../src/sharding/shard-manifest';

/**
 * Shard-ready step 5 (docs/architecture/SHARDING_READY.md §6 "Tests"): the
 * two-database e2e mode, `E2E_TWO_DB=1`.
 *
 * What it builds (see e2e-global-setup.ts):
 *  - the usual e2e database is the `primary` one (global family + shard_map);
 *  - a second, equally migrated database `<name>_s1` is the physical `db1`,
 *    handed to the API as DATABASE_URL_SHARDS;
 *  - `shard_map` sends every ODD logical shard to `db1`, even shards stay on
 *    `primary` (the plan's "even shards to db0, odd to db1");
 *  - foreign keys BETWEEN families (global -> case, case -> user ...) are
 *    dropped in both databases. A sharded row on db1 points at a user that
 *    lives on primary, which is exactly what step 9 of the plan does for
 *    real ("drop cross-family FKs"); without it no insert on db1 could pass.
 *
 * What it proves: every sharded-family query that carries a shard context
 * (route ids, the signed-in user, `shardContext.run*`) reaches the right
 * database and works there; what it cannot prove yet is listed in
 * two-db-suites.json (`knownLimitations`) for the plan's steps 6 to 8.
 */
export type TwoDbMode = 'off' | 'odd' | 'all';

/**
 * `E2E_TWO_DB=1` (or `odd`): odd shards on db1, even on primary, the plan's
 * mixed map. `E2E_TWO_DB=all`: EVERY shard on db1, so all sharded-family
 * rows live on the second database and only the global family on primary;
 * deterministic (the mixed map depends on whether random user ids happen to
 * be odd), which is what CI gates on.
 */
export function twoDbMode(env: NodeJS.ProcessEnv = process.env): TwoDbMode {
  const v = (env.E2E_TWO_DB ?? '').trim().toLowerCase();
  if (v === 'all') return 'all';
  return ['1', 'true', 'odd'].includes(v) ? 'odd' : 'off';
}

export function twoDbEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return twoDbMode(env) !== 'off';
}

/** Where the map sends a logical shard in this mode. */
export function expectedPhysicalDb(
  shard: number,
  env: NodeJS.ProcessEnv = process.env,
): 'primary' | 'db1' {
  const mode = twoDbMode(env);
  if (mode === 'all') return 'db1';
  return mode === 'odd' && shard % 2 === 1 ? 'db1' : 'primary';
}

/** Writes shard_map for the mode (all `primary` when off). */
export async function seedShardMap(
  url: string,
  mode: TwoDbMode,
): Promise<void> {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.$executeRaw`DELETE FROM shard_map`;
    await db.$executeRaw`
      INSERT INTO shard_map (logical_shard, physical_db, version)
      SELECT s,
             CASE WHEN ${mode} = 'all' OR (${mode} = 'odd' AND s % 2 = 1)
                  THEN 'db1' ELSE 'primary' END,
             1
      FROM generate_series(0, 255) AS s`;
  } finally {
    await db.$disconnect();
  }
}

/** Drops every foreign key whose two tables belong to different families. */
export async function dropCrossFamilyForeignKeys(url: string): Promise<number> {
  const familyOfTable = new Map<string, string>();
  for (const m of Prisma.dmmf.datamodel.models) {
    const family = familyOf(m.name);
    if (family) familyOfTable.set(m.dbName ?? m.name, family);
  }
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const fks = await db.$queryRaw<
      { conname: string; tbl: string; ref: string }[]
    >`
      SELECT c.conname, cl.relname AS tbl, rl.relname AS ref
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class rl ON rl.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`;
    let dropped = 0;
    for (const fk of fks) {
      const a = familyOfTable.get(fk.tbl);
      const b = familyOfTable.get(fk.ref);
      if (!a || !b || a === b) continue;
      await db.$executeRawUnsafe(
        `ALTER TABLE "${fk.tbl}" DROP CONSTRAINT "${fk.conname}"`,
      );
      dropped += 1;
    }
    return dropped;
  } finally {
    await db.$disconnect();
  }
}
