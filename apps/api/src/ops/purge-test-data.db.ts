/**
 * R-374: the database side of src/cli/purge-test-data.ts. Adapted from the
 * pre-launch wipe (scripts/prelaunch-wipe.ts: survivors fixpoint, TRUNCATE
 * … CASCADE guarded by cascadeViolations, batched deletes) to PostgreSQL
 * syntax (`::text`, `DELETE … WHERE id IN (SELECT … LIMIT n)`), and to keep
 * the admins' own sign-in rows. Only needs `$queryRawUnsafe` /
 * `$executeRawUnsafe`, so the specs run it against a mocked Prisma.
 */
import {
  cascadeViolations,
  type ForeignKey,
  SOFT_USER_REFS,
} from './prelaunch-wipe.plan';
import {
  chunks,
  PURGE_RESET_SQL,
  type PurgePlan,
  type UserRow,
} from './purge-test-data.plan';

export interface Db {
  $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
}

export interface Fk extends ForeignKey {
  /** pg_constraint.confdeltype: a = no action, r = restrict, c = cascade,
   * n = set null, d = set default. */
  onDelete: string;
}

export const DELETE_BATCH = 5000;

export const q = (ident: string): string => `"${ident.replace(/"/g, '""')}"`;

/** Ordinary and partitioned tables of `public`, partitions themselves left
 * out (TRUNCATE / DELETE on the parent reaches them). */
export async function dbTables(db: Db): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.relname AS t FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND NOT c.relispartition`,
  );
  return rows.map((r) => r.t);
}

export async function foreignKeys(db: Db): Promise<Fk[]> {
  const rows = await db.$queryRawUnsafe<
    {
      from_table: string;
      from_column: string;
      to_table: string;
      on_delete: string;
    }[]
  >(
    `SELECT fc.relname AS from_table, a.attname AS from_column,
            tc.relname AS to_table, c.confdeltype::text AS on_delete
       FROM pg_catalog.pg_constraint c
       JOIN pg_catalog.pg_class fc ON fc.oid = c.conrelid
       JOIN pg_catalog.pg_class tc ON tc.oid = c.confrelid
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND NOT fc.relispartition`,
  );
  return rows.map((r) => ({
    fromTable: r.from_table,
    fromColumn: r.from_column,
    toTable: r.to_table,
    onDelete: r.on_delete,
  }));
}

/** A foreign key that stops the referenced row from being deleted. */
export const pins = (fk: Fk): boolean =>
  fk.onDelete === 'a' || fk.onDelete === 'r';

/** Rows of kept / filtered tables that survive (from the pre-launch wipe). */
export const KEPT_ROWS_WHERE: Readonly<Record<string, string>> = {
  sticker_packs: '"owner_user_id" IS NULL',
  stickers:
    '"pack_id" IN (SELECT "id" FROM "sticker_packs" WHERE "owner_user_id" IS NULL)',
};

async function distinctIds(
  db: Db,
  table: string,
  column: string,
  where?: string,
  params: unknown[] = [],
): Promise<string[]> {
  const cond = [`${q(column)} IS NOT NULL`, ...(where ? [where] : [])];
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT DISTINCT ${q(column)}::text AS id FROM ${q(table)} WHERE ${cond.join(' AND ')}`,
    ...params,
  );
  return rows.map((r) => r.id);
}

export interface Survivors {
  users: Set<string>;
  files: Set<string>;
}

/**
 * Users and files that must stay: the [seed] users (admins, kept phones),
 * every user / file a kept row points at through a restricting foreign key
 * (plus SOFT_USER_REFS), avatars of kept users and owners of kept files —
 * to a fixpoint. Same walk as the pre-launch wipe's survivors().
 */
export async function survivors(
  db: Db,
  plan: PurgePlan,
  fks: readonly Fk[],
  seed: Iterable<string>,
): Promise<Survivors> {
  const kept = new Set([...plan.keep, 'sticker_packs']);
  const users = new Set<string>(seed);
  const files = new Set<string>();
  for (const fk of fks) {
    if (!kept.has(fk.fromTable) || !pins(fk)) continue;
    const where = KEPT_ROWS_WHERE[fk.fromTable];
    if (fk.toTable === 'users') {
      for (const id of await distinctIds(
        db,
        fk.fromTable,
        fk.fromColumn,
        where,
      )) {
        users.add(id);
      }
    } else if (fk.toTable === 'files') {
      for (const id of await distinctIds(
        db,
        fk.fromTable,
        fk.fromColumn,
        where,
      )) {
        files.add(id);
      }
    }
  }
  for (const r of SOFT_USER_REFS) {
    if (!plan.keep.includes(r.table)) continue;
    for (const id of await distinctIds(db, r.table, r.column)) users.add(id);
  }
  const userToFile = fks.filter(
    (f) => f.fromTable === 'users' && f.toTable === 'files',
  );
  const fileToUser = fks.filter(
    (f) => f.fromTable === 'files' && f.toTable === 'users',
  );
  for (;;) {
    const before = users.size + files.size;
    for (const fk of userToFile) {
      for (const id of await distinctIds(
        db,
        'users',
        fk.fromColumn,
        '"id"::text = ANY ($1::text[])',
        [[...users]],
      )) {
        files.add(id);
      }
    }
    for (const fk of fileToUser) {
      for (const id of await distinctIds(
        db,
        'files',
        fk.fromColumn,
        '"id"::text = ANY ($1::text[])',
        [[...files]],
      )) {
        users.add(id);
      }
    }
    if (users.size + files.size === before) break;
  }
  return { users, files };
}

/** TRUNCATE … CASCADE must not reach a kept or user-row table. */
export function purgeCascadeViolations(
  fks: readonly ForeignKey[],
  plan: PurgePlan,
): ForeignKey[] {
  return cascadeViolations(fks, plan.wipe);
}

export async function loadUsers(db: Db): Promise<UserRow[]> {
  const rows = await db.$queryRawUnsafe<
    {
      id: string;
      role: string | null;
      phone: string | null;
      id_phones: string[] | null;
      username: string | null;
      created: Date | null;
      is_admin: boolean;
      status: string | null;
    }[]
  >(
    `SELECT u."id"::text AS id, u."role"::text AS role, u."phone_e164" AS phone,
            u."created_at" AS created, u."status"::text AS status,
            ARRAY(SELECT i."provider_uid" FROM "user_identifiers" i
                   WHERE i."user_id" = u."id" AND i."provider"::text = 'phone') AS id_phones,
            (SELECT n."username_lower" FROM "usernames" n
              WHERE n."owner_id"::text = u."id"::text LIMIT 1) AS username,
            EXISTS (SELECT 1 FROM "admin_profiles" a WHERE a."user_id" = u."id") AS is_admin
       FROM "users" u ORDER BY u."created_at", u."id"`,
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    phone: r.phone,
    idPhones: r.id_phones ?? [],
    username: r.username,
    created: r.created,
    isAdmin: r.is_admin,
    status: r.status,
  }));
}

export const COUNT_COLUMNS = [
  'posts',
  'reels',
  'comments',
  'cases',
  'bids',
  'chats',
  'messages',
  'files',
  'mb',
  'stories',
  'consults',
] as const;
export type CountColumn = (typeof COUNT_COLUMNS)[number];
export type UserCounts = Map<string, Partial<Record<CountColumn, number>>>;

/** What each user owns, one grouped query per table. */
const COUNT_SQL: readonly { sql: string; cols: CountColumn[] }[] = [
  {
    sql: `SELECT "author_id"::text AS id,
            count(*) FILTER (WHERE "video_asset_id" IS NULL)::int AS a,
            count(*) FILTER (WHERE "video_asset_id" IS NOT NULL)::int AS b
            FROM "posts" GROUP BY 1`,
    cols: ['posts', 'reels'],
  },
  {
    sql: 'SELECT "author_id"::text AS id, count(*)::int AS a FROM "comments" GROUP BY 1',
    cols: ['comments'],
  },
  {
    sql: 'SELECT "client_id"::text AS id, count(*)::int AS a FROM "cases" GROUP BY 1',
    cols: ['cases'],
  },
  {
    sql: 'SELECT "attorney_id"::text AS id, count(*)::int AS a FROM "bids" GROUP BY 1',
    cols: ['bids'],
  },
  {
    sql: 'SELECT "user_id"::text AS id, count(*)::int AS a FROM "conversation_participants" GROUP BY 1',
    cols: ['chats'],
  },
  {
    sql: 'SELECT "sender_id"::text AS id, count(*)::int AS a FROM "messages" WHERE "sender_id" IS NOT NULL GROUP BY 1',
    cols: ['messages'],
  },
  {
    sql: `SELECT "owner_user_id"::text AS id, count(*)::int AS a,
            round(sum("size_bytes") / 1048576.0)::int AS b
            FROM "files" WHERE "purged_at" IS NULL GROUP BY 1`,
    cols: ['files', 'mb'],
  },
  {
    sql: 'SELECT "author_id"::text AS id, count(*)::int AS a FROM "stories" GROUP BY 1',
    cols: ['stories'],
  },
  {
    sql: `SELECT id, count(*)::int AS a FROM (
            SELECT "attorney_id"::text AS id FROM "consultations"
            UNION ALL SELECT "client_id"::text FROM "consultations") x GROUP BY 1`,
    cols: ['consults'],
  },
];

export async function userCounts(db: Db): Promise<UserCounts> {
  const out: UserCounts = new Map();
  for (const c of COUNT_SQL) {
    const rows = await db.$queryRawUnsafe<
      { id: string; a: number; b?: number }[]
    >(c.sql);
    for (const r of rows) {
      const m = out.get(r.id) ?? {};
      m[c.cols[0]] = Number(r.a);
      if (c.cols[1]) m[c.cols[1]] = Number(r.b ?? 0);
      out.set(r.id, m);
    }
  }
  return out;
}

/**
 * `DELETE … WHERE id IN (SELECT id … LIMIT n)` until nothing is left: one
 * huge DELETE would hold locks and WAL for too long. Returns rows deleted.
 */
export async function deleteInBatches(
  db: Db,
  table: string,
  where: string,
  params: unknown[] = [],
  batch = DELETE_BATCH,
): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await db.$executeRawUnsafe(
      `DELETE FROM ${q(table)} WHERE "id" IN (SELECT "id" FROM ${q(table)} WHERE ${where} LIMIT ${Math.floor(batch)})`,
      ...params,
    );
    total += n;
    if (n < batch) return total;
  }
}

export interface DbRemoved {
  truncated: number;
  userRows: number;
  stickerPacks: number;
  files: number;
  users: number;
}

/**
 * The database part of `--all-users --apply`: TRUNCATE the wipe tables in
 * one statement, then the rows of removed users in the user-row tables, the
 * user sticker packs, the files and the users that do not survive (batched),
 * then the counters on kept rows.
 */
export async function applyDb(
  db: Db,
  plan: PurgePlan,
  fks: readonly Fk[],
  live: Survivors,
  batch = DELETE_BATCH,
): Promise<DbRemoved> {
  const keepUsers = [...live.users];
  const keepFiles = [...live.files];
  const removed: DbRemoved = {
    truncated: plan.wipe.length,
    userRows: 0,
    stickerPacks: 0,
    files: 0,
    users: 0,
  };
  for (const part of chunks(plan.wipe, 200)) {
    // cascadeViolations was checked: CASCADE only confirms the listed tables.
    await db.$executeRawUnsafe(`TRUNCATE ${part.map(q).join(', ')} CASCADE`);
  }
  for (const t of plan.userRows) {
    for (const fk of fks) {
      if (fk.fromTable !== t || fk.toTable !== 'users') continue;
      removed.userRows += await deleteInBatches(
        db,
        t,
        `${q(fk.fromColumn)} IS NOT NULL AND NOT (${q(fk.fromColumn)}::text = ANY ($1::text[]))`,
        [keepUsers],
        batch,
      );
    }
  }
  removed.stickerPacks = await deleteInBatches(
    db,
    'sticker_packs',
    '"owner_user_id" IS NOT NULL AND NOT ("owner_user_id"::text = ANY ($1::text[]))',
    [keepUsers],
    batch,
  );
  for (const fk of fks) {
    if (fk.fromTable === 'users' && fk.toTable === 'files') {
      await db.$executeRawUnsafe(
        `UPDATE "users" SET ${q(fk.fromColumn)} = NULL
          WHERE ${q(fk.fromColumn)} IS NOT NULL AND NOT ("id"::text = ANY ($1::text[]))`,
        keepUsers,
      );
    }
  }
  removed.files = await deleteInBatches(
    db,
    'files',
    'NOT ("id"::text = ANY ($1::text[]))',
    [keepFiles],
    batch,
  );
  removed.users = await deleteInBatches(
    db,
    'users',
    'NOT ("id"::text = ANY ($1::text[]))',
    [keepUsers],
    batch,
  );
  for (const sql of PURGE_RESET_SQL) await db.$executeRawUnsafe(sql);
  return removed;
}
