// Owner 2026-10-07: removes everything the public beta testers left behind
// before the real launch — database rows, S3 objects, Bunny Stream videos
// and Redis keys — and keeps the launch configuration (the keep-list with
// a reason per table is in src/ops/prelaunch-wipe.plan.ts).
// Runbook: docs/runbooks/prelaunch-wipe.md.
//
//   node dist/scripts/prelaunch-wipe.js                 DRY RUN (default): counts only
//   node dist/scripts/prelaunch-wipe.js --execute       delete, after confirmation
//     --only=db,s3,bunny,redis   phases (default: all)
//     --purge-versions           S3: also delete old versions / delete markers
//                                (versioned buckets), so nothing can be restored
//
// --execute also needs PRELAUNCH_WIPE_CONFIRM=wipe-beta-test-data and the
// database name typed at the prompt. Without a terminal (the Redis phase
// runs as an ECS task inside the VPC) the name comes from
// PRELAUNCH_WIPE_DB_NAME, and only `--only=redis` is allowed that way.
//
// Env: DATABASE_URL (migrator role: TRUNCATE needs it), REDIS_URL,
// S3_REGION, S3_BUCKET_DOCUMENTS, S3_BUCKET_MEDIA [, S3_ENDPOINT for MinIO]
// [, S3_BUCKET_DOCUMENTS_REPLICA + S3_REPLICA_REGION with --purge-versions],
// SECRETS_MASTER_KEYS + SECRETS_ACTIVE_KID (Bunny keys saved in the admin)
// or BUNNY_LIBRARY_ID + BUNNY_API_KEY. Prints counts, never values.
import { createInterface } from 'node:readline/promises';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { SecretEnvelope } from '../src/common/secrets/secret-envelope';
import {
  cascadeViolations,
  type ForeignKey,
  planFor,
  RESET_SQL,
  redisGroup,
  redisKeyKept,
  s3KeyKept,
  SOFT_USER_REFS,
  type WipePlan,
} from '../src/ops/prelaunch-wipe.plan';

const CONFIRM_PHRASE = 'wipe-beta-test-data';
const PHASES = ['bunny', 'db', 's3', 'redis'] as const;
type Phase = (typeof PHASES)[number];

/** Rows of kept or filtered tables that survive (others are deleted). */
const KEPT_ROWS_WHERE: Readonly<Record<string, string>> = {
  sticker_packs: '"owner_user_id" IS NULL',
  stickers:
    '"pack_id" IN (SELECT "id" FROM "sticker_packs" WHERE "owner_user_id" IS NULL)',
};

interface Args {
  execute: boolean;
  purgeVersions: boolean;
  phases: Set<Phase>;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    execute: false,
    purgeVersions: false,
    phases: new Set(PHASES),
  };
  for (const a of argv) {
    if (a === '--execute') args.execute = true;
    else if (a === '--purge-versions') args.purgeVersions = true;
    else if (a.startsWith('--only=')) {
      const list = a.slice('--only='.length).split(',').filter(Boolean);
      for (const p of list) {
        if (!(PHASES as readonly string[]).includes(p)) {
          throw new Error(`unknown phase "${p}" (use ${PHASES.join(',')})`);
        }
      }
      args.phases = new Set(list as Phase[]);
    } else throw new Error(`unknown argument "${a}"`);
  }
  return args;
}

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};
const q = (ident: string): string => `"${ident.replace(/"/g, '""')}"`;

// --- database ----------------------------------------------------------

async function count(db: PrismaClient, sql: string, ...params: unknown[]) {
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(
    sql,
    ...params,
  );
  return Number(rows[0]?.n ?? 0);
}

async function dbTables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return rows.map((r) => r.t);
}

async function foreignKeys(db: PrismaClient): Promise<ForeignKey[]> {
  const rows = await db.$queryRawUnsafe<
    { from_table: string; from_column: string; to_table: string }[]
  >(
    `SELECT c.conrelid::REGCLASS::STRING AS from_table,
            a.attname AS from_column,
            c.confrelid::REGCLASS::STRING AS to_table
       FROM pg_catalog.pg_constraint c
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'`,
  );
  const bare = (t: string) => t.replace(/^public\./, '').replace(/"/g, '');
  return rows.map((r) => ({
    fromTable: bare(r.from_table),
    fromColumn: r.from_column,
    toTable: bare(r.to_table),
  }));
}

async function distinctIds(
  db: PrismaClient,
  table: string,
  column: string,
  where?: string,
  params: unknown[] = [],
): Promise<string[]> {
  const cond = [`${q(column)} IS NOT NULL`, ...(where ? [where] : [])];
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT DISTINCT ${q(column)}::STRING AS id FROM ${q(table)} WHERE ${cond.join(' AND ')}`,
    ...params,
  );
  return rows.map((r) => r.id);
}

interface Survivors {
  users: string[];
  files: string[];
  /** Why each kept non-admin user stays: "table.column" → count. */
  userReasons: Map<string, number>;
}

/**
 * Users and files that must stay: admins, everything a kept row points
 * at (foreign keys read from the database plus SOFT_USER_REFS), the
 * avatars of kept users and the owners of kept files — to a fixpoint.
 */
async function survivors(
  db: PrismaClient,
  plan: WipePlan,
  fks: ForeignKey[],
): Promise<Survivors> {
  const kept = new Set(plan.keep.concat(['sticker_packs']));
  const users = new Set<string>();
  const files = new Set<string>();
  const userReasons = new Map<string, number>();
  const addUsers = (ids: string[], reason: string) => {
    let added = 0;
    for (const id of ids) {
      if (!users.has(id)) {
        users.add(id);
        added++;
      }
    }
    if (added) userReasons.set(reason, (userReasons.get(reason) ?? 0) + added);
  };

  for (const fk of fks) {
    if (!kept.has(fk.fromTable)) continue;
    const where = KEPT_ROWS_WHERE[fk.fromTable];
    if (fk.toTable === 'users') {
      addUsers(
        await distinctIds(db, fk.fromTable, fk.fromColumn, where),
        `${fk.fromTable}.${fk.fromColumn}`,
      );
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
    addUsers(
      await distinctIds(db, r.table, r.column),
      `${r.table}.${r.column}`,
    );
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
        `"id"::STRING = ANY ($1::STRING[])`,
        [[...users]],
      )) {
        files.add(id);
      }
    }
    for (const fk of fileToUser) {
      addUsers(
        await distinctIds(
          db,
          'files',
          fk.fromColumn,
          `"id"::STRING = ANY ($1::STRING[])`,
          [[...files]],
        ),
        `files.${fk.fromColumn} (owner of a kept file)`,
      );
    }
    if (users.size + files.size === before) break;
  }
  return { users: [...users], files: [...files], userReasons };
}

async function dbPhase(
  db: PrismaClient,
  plan: WipePlan,
  fks: ForeignKey[],
  live: Survivors,
  execute: boolean,
): Promise<void> {
  out('== Database');
  const rows: [string, number][] = [];
  for (const t of plan.wipe) {
    rows.push([t, await count(db, `SELECT count(*) AS n FROM ${q(t)}`)]);
  }
  const userTotal = await count(db, 'SELECT count(*) AS n FROM "users"');
  const fileTotal = await count(db, 'SELECT count(*) AS n FROM "files"');
  const userPacks = await count(
    db,
    'SELECT count(*) AS n FROM "sticker_packs" WHERE "owner_user_id" IS NOT NULL',
  );
  const nonEmpty = rows.filter(([, n]) => n > 0);
  out(`  TRUNCATE ${plan.wipe.length} tables, rows now:`);
  for (const [t, n] of nonEmpty) out(`    ${t.padEnd(36)} ${n}`);
  out(`    (${plan.wipe.length - nonEmpty.length} more tables already empty)`);
  out(
    `  users: delete ${userTotal - live.users.length}, keep ${live.users.length}`,
  );
  for (const [why, n] of live.userReasons) {
    out(`    kept because of ${why}: ${n}`);
  }
  out(
    `  files: delete ${fileTotal - live.files.length}, keep ${live.files.length}`,
  );
  out(`  sticker_packs made by users: delete ${userPacks}`);
  out(`  kept untouched: ${plan.keep.join(', ')}`);
  if (!execute) return;

  // Every referencing table is in the list (cascadeViolations checked), so
  // CASCADE only confirms what the statement already names.
  await db.$executeRawUnsafe(`TRUNCATE ${plan.wipe.map(q).join(', ')} CASCADE`);
  await db.$executeRawUnsafe(
    'DELETE FROM "sticker_packs" WHERE "owner_user_id" IS NOT NULL',
  );
  const keepUsers = [live.users];
  const keepFiles = [live.files];
  for (const fk of fks) {
    if (fk.fromTable === 'users' && fk.toTable === 'files') {
      await db.$executeRawUnsafe(
        `UPDATE "users" SET ${q(fk.fromColumn)} = NULL
          WHERE ${q(fk.fromColumn)} IS NOT NULL AND NOT ("id"::STRING = ANY ($1::STRING[]))`,
        ...keepUsers,
      );
    }
  }
  // Batched: one huge DELETE can exceed CockroachDB's transaction limits.
  for (const [table, keep] of [
    ['files', keepFiles],
    ['users', keepUsers],
  ] as const) {
    let n: number;
    do {
      n = await db.$executeRawUnsafe(
        `DELETE FROM ${q(table)} WHERE NOT ("id"::STRING = ANY ($1::STRING[])) LIMIT 5000`,
        ...keep,
      );
    } while (n > 0);
  }
  for (const sql of RESET_SQL) await db.$executeRawUnsafe(sql);
  out('  done.');
}

// --- S3 ------------------------------------------------------------------

interface BucketRef {
  name: string;
  client: S3Client;
  versionsOnly: boolean;
}

function buckets(): BucketRef[] {
  const region = process.env.S3_REGION || process.env.AWS_REGION;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const main = new S3Client({
    region,
    endpoint,
    forcePathStyle: !!endpoint,
  });
  const list: BucketRef[] = [];
  for (const name of [
    process.env.S3_BUCKET_DOCUMENTS,
    process.env.S3_BUCKET_MEDIA,
  ]) {
    if (name) list.push({ name, client: main, versionsOnly: false });
  }
  const replica = process.env.S3_BUCKET_DOCUMENTS_REPLICA;
  if (replica) {
    list.push({
      name: replica,
      client: new S3Client({
        region: process.env.S3_REPLICA_REGION || region,
      }),
      versionsOnly: true,
    });
  }
  return list;
}

interface Doomed {
  Key: string;
  VersionId?: string;
}

async function doomedObjects(
  b: BucketRef,
  keptKeys: ReadonlySet<string>,
  versions: boolean,
): Promise<Doomed[]> {
  const doomed: Doomed[] = [];
  if (versions) {
    let KeyMarker: string | undefined;
    let VersionIdMarker: string | undefined;
    do {
      const res = await b.client.send(
        new ListObjectVersionsCommand({
          Bucket: b.name,
          KeyMarker,
          VersionIdMarker,
        }),
      );
      for (const v of [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]) {
        if (v.Key && !s3KeyKept(v.Key, keptKeys)) {
          doomed.push({ Key: v.Key, VersionId: v.VersionId });
        }
      }
      KeyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
      VersionIdMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
    } while (KeyMarker);
    return doomed;
  }
  let ContinuationToken: string | undefined;
  do {
    const res = await b.client.send(
      new ListObjectsV2Command({ Bucket: b.name, ContinuationToken }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key && !s3KeyKept(o.Key, keptKeys)) doomed.push({ Key: o.Key });
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return doomed;
}

async function s3Phase(
  db: PrismaClient,
  live: Survivors,
  purgeVersions: boolean,
  execute: boolean,
): Promise<void> {
  out('== S3');
  const list = buckets();
  if (list.length === 0) {
    out('  skipped: S3_BUCKET_DOCUMENTS / S3_BUCKET_MEDIA not set');
    return;
  }
  const rows = await db.$queryRawUnsafe<{ k: string }[]>(
    `SELECT DISTINCT "s3_key" AS k FROM "files" WHERE "id"::STRING = ANY ($1::STRING[])`,
    live.files,
  );
  const keptKeys = new Set(rows.map((r) => r.k));
  out(
    `  kept keys (official stickers, templates, admin avatars): ${keptKeys.size}`,
  );
  for (const b of list) {
    if (b.versionsOnly && !purgeVersions) {
      out(`  ${b.name}: replica, only with --purge-versions`);
      continue;
    }
    const doomed = await doomedObjects(b, keptKeys, purgeVersions);
    const byPrefix = new Map<string, number>();
    for (const d of doomed) {
      const p = d.Key.split('/')[0] + '/';
      byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
    }
    out(
      `  ${b.name}: delete ${doomed.length} ${purgeVersions ? 'versions / delete markers' : 'objects'}`,
    );
    for (const [p, n] of [...byPrefix].sort()) out(`    ${p.padEnd(28)} ${n}`);
    if (!execute) continue;
    for (let i = 0; i < doomed.length; i += 1000) {
      const res = await b.client.send(
        new DeleteObjectsCommand({
          Bucket: b.name,
          Delete: { Objects: doomed.slice(i, i + 1000), Quiet: true },
        }),
      );
      if (res.Errors?.length) {
        throw new Error(
          `${b.name}: ${res.Errors.length} objects not deleted (${res.Errors[0]?.Code ?? 'error'})`,
        );
      }
    }
    out('    done.');
  }
  if (!purgeVersions) {
    out(
      '  note: versioned buckets keep old versions 30 / 90 days (lifecycle);',
    );
    out('        add --purge-versions to remove them now.');
  }
}

// --- Bunny Stream ----------------------------------------------------------

interface BunnyLib {
  libraryId: string;
  apiKey: string;
}

async function bunnyLibraries(db: PrismaClient): Promise<BunnyLib[]> {
  const libs = new Map<string, BunnyLib>();
  const keys = process.env.SECRETS_MASTER_KEYS;
  const kid = process.env.SECRETS_ACTIVE_KID;
  if (keys && kid) {
    const env = new SecretEnvelope(keys, kid);
    const rows = await db.integrationCredential.findMany({
      where: { provider: 'bunny_stream', status: 'active' },
    });
    for (const row of rows) {
      const fields = {
        ...(row.public_config as Record<string, string>),
        ...(JSON.parse(
          env.decrypt(row.secret_enc, `${row.provider}:${row.version}`),
        ) as Record<string, string>),
      };
      if (fields.libraryId && fields.apiKey) {
        libs.set(fields.libraryId, {
          libraryId: fields.libraryId,
          apiKey: fields.apiKey,
        });
      }
    }
  }
  const envLib = process.env.BUNNY_LIBRARY_ID;
  const envKey = process.env.BUNNY_API_KEY;
  if (envLib && envKey && !libs.has(envLib)) {
    libs.set(envLib, { libraryId: envLib, apiKey: envKey });
  }
  return [...libs.values()];
}

async function bunny(
  lib: BunnyLib,
  method: string,
  path: string,
): Promise<Response> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${lib.libraryId}${path}`,
    {
      method,
      headers: { AccessKey: lib.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny ${method} answered HTTP ${res.status}`);
  }
  return res;
}

async function bunnyPhase(db: PrismaClient, execute: boolean): Promise<void> {
  out('== Bunny Stream');
  const libs = await bunnyLibraries(db);
  if (libs.length === 0) {
    out('  skipped: no Bunny keys (admin → Ключи и сервисы, or BUNNY_* env)');
    return;
  }
  for (const lib of libs) {
    const guids: string[] = [];
    for (let page = 1; ; page++) {
      const res = await bunny(
        lib,
        'GET',
        `/videos?page=${page}&itemsPerPage=100`,
      );
      const body = (await res.json()) as {
        items?: { guid: string }[];
        totalItems?: number;
      };
      const items = body.items ?? [];
      guids.push(...items.map((v) => v.guid));
      if (items.length < 100 || guids.length >= (body.totalItems ?? 0)) break;
    }
    out(`  library ${lib.libraryId}: delete ${guids.length} videos (all)`);
    if (!execute) continue;
    for (const g of guids) await bunny(lib, 'DELETE', `/videos/${g}`);
    out('    done.');
  }
}

// --- Redis ------------------------------------------------------------------

async function redisPhase(execute: boolean): Promise<void> {
  out('== Redis');
  const url = process.env.REDIS_URL;
  if (!url) {
    out('  skipped: REDIS_URL not set');
    return;
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 3 });
  try {
    const doomed: string[] = [];
    const groups = new Map<string, number>();
    let kept = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'COUNT', 1000);
      cursor = next;
      for (const k of keys) {
        if (redisKeyKept(k)) {
          kept++;
          continue;
        }
        doomed.push(k);
        const g = redisGroup(k);
        groups.set(g, (groups.get(g) ?? 0) + 1);
      }
    } while (cursor !== '0');
    out(
      `  delete ${doomed.length} keys, keep ${kept} (budget, queues, locks, i18n)`,
    );
    for (const [g, n] of [...groups].sort()) out(`    ${g.padEnd(28)} ${n}`);
    if (!execute) return;
    for (let i = 0; i < doomed.length; i += 500) {
      await redis.unlink(...doomed.slice(i, i + 500));
    }
    out('    done.');
  } finally {
    redis.disconnect();
  }
}

// --- main ---------------------------------------------------------------------

async function confirm(args: Args, dbName: string): Promise<void> {
  if (process.env.PRELAUNCH_WIPE_CONFIRM !== CONFIRM_PHRASE) {
    throw new Error(
      `refused: set PRELAUNCH_WIPE_CONFIRM=${CONFIRM_PHRASE} to delete anything`,
    );
  }
  let typed: string;
  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      typed = (
        await rl.question(
          `\nEverything listed above will be DELETED for good.\nType the database name (${dbName}) to continue: `,
        )
      ).trim();
    } finally {
      rl.close();
    }
  } else {
    if (args.phases.size !== 1 || !args.phases.has('redis')) {
      throw new Error(
        'refused: run in a terminal (docker run -it) — only --only=redis may run without one',
      );
    }
    typed = process.env.PRELAUNCH_WIPE_DB_NAME ?? '';
  }
  if (typed !== dbName)
    throw new Error('refused: database name does not match');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    const dbName = (
      await db.$queryRawUnsafe<{ d: string }[]>(
        'SELECT current_database() AS d',
      )
    )[0]?.d;
    if (!dbName) throw new Error('cannot read the database name');
    out(
      `Pre-launch wipe — database "${dbName}" — ${args.execute ? 'EXECUTE' : 'DRY RUN (nothing is deleted)'}`,
    );
    out(`Phases: ${[...args.phases].join(', ')}`);
    out();

    const needDb = args.phases.has('db') || args.phases.has('s3');
    let plan: WipePlan | null = null;
    let fks: ForeignKey[] = [];
    let live: Survivors | null = null;
    if (needDb) {
      plan = planFor(await dbTables(db));
      if (plan.unknown.length) {
        throw new Error(
          `tables not in the keep / wipe lists (src/ops/prelaunch-wipe.plan.ts): ${plan.unknown.join(', ')}`,
        );
      }
      fks = await foreignKeys(db);
      const bad = cascadeViolations(fks, plan.wipe);
      if (bad.length) {
        throw new Error(
          `TRUNCATE CASCADE would reach kept tables: ${bad
            .map((f) => `${f.fromTable}.${f.fromColumn} → ${f.toTable}`)
            .join(', ')}`,
        );
      }
      live = await survivors(db, plan, fks);
    }

    // Dry run first (always), then the confirmation, then the same again
    // for real.
    const run = async (execute: boolean) => {
      if (args.phases.has('bunny')) await bunnyPhase(db, execute);
      if (args.phases.has('db') && plan && live) {
        await dbPhase(db, plan, fks, live, execute);
      }
      if (args.phases.has('s3') && live) {
        await s3Phase(db, live, args.purgeVersions, execute);
      }
      if (args.phases.has('redis')) await redisPhase(execute);
    };
    await run(false);
    if (!args.execute) {
      out();
      out(
        'Dry run only. Add --execute to delete (docs/runbooks/prelaunch-wipe.md).',
      );
      return;
    }
    await confirm(args, dbName);
    out();
    await run(true);
    out();
    out('Wipe finished. Run the dry run again: every count must be 0.');
  } finally {
    await db.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(
      `prelaunch-wipe: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  },
);
