// Owner 2026-11-04 (R-374): removes the test accounts and everything they
// made from production, keeps the admin panel (accounts, staff, history)
// and the launch configuration (i18n, settings, flags, plans, prices,
// legal texts, templates, integrations, reference data).
// Runbook: docs/runbooks/DEPLOY_PROD.md «Очистка тестовых данных».
//
//   node dist/src/cli/purge-test-data.js --all-users
//        DRY RUN (default): every user with KEEP / DELETE and what they own
//   node dist/src/cli/purge-test-data.js --all-users --apply --confirm=DELETE-ALL-USERS
//        every app user goes (clients, attorneys, assistants), with all content:
//        database rows (TRUNCATE of the user-data tables + batched deletes),
//        S3 objects, Bunny Stream videos, Redis keys
//   node dist/src/cli/purge-test-data.js --keep-phones=7739935153,2244224434
//        [--apply --confirm=DELETE-TEST-DATA]
//        everyone except the accounts on these numbers is erased through the
//        account erasure service (the same as «Удалить аккаунт», no grace)
//   --only=db,s3,bunny,redis   (--all-users) phases, default all
//   --purge-versions           (--all-users) S3: old versions / delete markers too
//
// Admin panel accounts (role admin / admin_profiles) are ALWAYS kept. Env:
// DATABASE_URL (migrator role: TRUNCATE), REDIS_URL, S3_*, SECRETS_* or
// BUNNY_* (like scripts/prelaunch-wipe.ts). Prints counts, opaque ids,
// roles, usernames and the last 4 digits of phones; exit 1 on any failure.
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../app.module';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { SecretEnvelope } from '../common/secrets/secret-envelope';
import { AccountAnonymizationService } from '../modules/privacy/account-anonymization.service';
import {
  redisGroup,
  redisKeyKept,
  s3KeyKept,
} from '../ops/prelaunch-wipe.plan';
import {
  applyDb,
  COUNT_COLUMNS,
  dbTables,
  type Fk,
  foreignKeys,
  loadUsers,
  purgeCascadeViolations,
  q,
  survivors,
  type Survivors,
  type UserCounts,
  userCounts,
} from '../ops/purge-test-data.db';
import {
  maskPhone,
  parsePurgeArgs,
  type PurgeArgs,
  type PurgePlan,
  purgePlanFor,
  splitUsers,
  type UserRow,
  type UserSplit,
} from '../ops/purge-test-data.plan';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

// --- the table of users ---------------------------------------------------

function day(d: Date | string | null): string {
  if (!d) return '-';
  const v = d instanceof Date ? d : new Date(d);
  return Number.isNaN(v.getTime()) ? '-' : v.toISOString().slice(0, 10);
}

function printUsers(
  title: string,
  rows: { user: UserRow; note: string }[],
  counts: UserCounts,
): void {
  out(`${title}: ${rows.length}`);
  if (rows.length === 0) return;
  const head = [
    'id'.padEnd(36),
    'role'.padEnd(9),
    'username'.padEnd(20),
    'phone'.padEnd(13),
    'created'.padEnd(10),
    ...COUNT_COLUMNS.map((c) => c.padStart(8)),
    ' why',
  ];
  out(`  ${head.join(' ')}`);
  for (const { user: u, note } of rows) {
    const c = counts.get(u.id) ?? {};
    out(
      `  ${[
        u.id.padEnd(36),
        (u.role ?? '-').padEnd(9),
        (u.username ?? '-').slice(0, 20).padEnd(20),
        maskPhone(u.phone ?? u.idPhones[0]).padEnd(13),
        day(u.created).padEnd(10),
        ...COUNT_COLUMNS.map((k) => String(c[k] ?? 0).padStart(8)),
        ` ${note}`,
      ].join(' ')}`,
    );
  }
}

const KEEP_NOTE = {
  admin: 'admin panel account',
  phone: 'kept phone',
  referenced: 'kept row points at it (partner / payroll / …)',
} as const;

function printSplit(split: UserSplit, counts: UserCounts): void {
  printUsers(
    'KEEP',
    split.keep.map((k) => ({ user: k.user, note: KEEP_NOTE[k.reason] })),
    counts,
  );
  out();
  printUsers(
    'DELETE',
    split.remove.map((u) => ({
      user: u,
      note: u.status === 'deleted' ? 'erased (anonymized)' : '',
    })),
    counts,
  );
}

// --- database (--all-users) -------------------------------------------------

async function count(db: PrismaClient, sql: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

async function dbSummary(
  db: PrismaClient,
  plan: PurgePlan,
  live: Survivors,
): Promise<void> {
  out('== Database');
  const nonEmpty: [string, number][] = [];
  for (const t of plan.wipe) {
    const n = await count(db, `SELECT count(*) AS n FROM ${q(t)}`);
    if (n > 0) nonEmpty.push([t, n]);
  }
  out(`  TRUNCATE ${plan.wipe.length} user-data tables, rows now:`);
  for (const [t, n] of nonEmpty) out(`    ${t.padEnd(36)} ${n}`);
  out(`    (${plan.wipe.length - nonEmpty.length} more tables already empty)`);
  const users = await count(db, 'SELECT count(*) AS n FROM "users"');
  const files = await count(db, 'SELECT count(*) AS n FROM "files"');
  out(`  users: delete ${users - live.users.size}, keep ${live.users.size}`);
  out(`  files: delete ${files - live.files.size}, keep ${live.files.size}`);
  out(`  only rows of deleted users: ${plan.userRows.join(', ')}`);
  out(
    `  kept untouched: ${plan.keep.length} tables (config, admin panel, staff)`,
  );
}

// --- S3 (copied from scripts/prelaunch-wipe.ts) -------------------------------

interface BucketRef {
  name: string;
  client: S3Client;
  versionsOnly: boolean;
}

function buckets(): BucketRef[] {
  const region = process.env.S3_REGION || process.env.AWS_REGION;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const main = new S3Client({ region, endpoint, forcePathStyle: !!endpoint });
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
      client: new S3Client({ region: process.env.S3_REPLICA_REGION || region }),
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
): Promise<number> {
  out('== S3');
  const list = buckets();
  if (list.length === 0) {
    out('  skipped: S3_BUCKET_DOCUMENTS / S3_BUCKET_MEDIA not set');
    return 0;
  }
  const rows = await db.$queryRawUnsafe<{ k: string }[]>(
    'SELECT DISTINCT "s3_key" AS k FROM "files" WHERE "id"::text = ANY ($1::text[])',
    [...live.files],
  );
  const keptKeys = new Set(rows.map((r) => r.k));
  out(
    `  kept keys (official stickers, templates, admin avatars): ${keptKeys.size}`,
  );
  let removed = 0;
  for (const b of list) {
    if (b.versionsOnly && !purgeVersions) {
      out(`  ${b.name}: replica, only with --purge-versions`);
      continue;
    }
    const doomed = await doomedObjects(b, keptKeys, purgeVersions);
    const byPrefix = new Map<string, number>();
    for (const d of doomed) {
      const p = `${d.Key.split('/')[0]}/`;
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
    removed += doomed.length;
    out('    done.');
  }
  return removed;
}

// --- Bunny Stream (copied from scripts/prelaunch-wipe.ts) -----------------------

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

/** Every video of the library: only app users upload there (the demo world
 * uses no Bunny videos), and every app user is removed in this mode. */
async function bunnyPhase(db: PrismaClient, execute: boolean): Promise<number> {
  out('== Bunny Stream');
  const libs = await bunnyLibraries(db);
  if (libs.length === 0) {
    out('  skipped: no Bunny keys (admin → Ключи и сервисы, or BUNNY_* env)');
    return 0;
  }
  let removed = 0;
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
    removed += guids.length;
    out('    done.');
  }
  return removed;
}

// --- Redis (copied from scripts/prelaunch-wipe.ts) ---------------------------------

async function redisPhase(execute: boolean): Promise<number> {
  out('== Redis');
  const url = process.env.REDIS_URL;
  if (!url) {
    out('  skipped: REDIS_URL not set');
    return 0;
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
    if (!execute) return 0;
    for (let i = 0; i < doomed.length; i += 500) {
      await redis.unlink(...doomed.slice(i, i + 500));
    }
    out('    done.');
    return doomed.length;
  } finally {
    redis.disconnect();
  }
}

// --- erasure service (--keep-phones) ------------------------------------------------

/** The account erasure of «Удалить аккаунт» / GDPR, without the 14-day grace:
 * Stripe customers, Bunny videos, S3 files, messages scrubbed, posts and
 * channel posts removed, follows, tokens, sessions, cases closed, bids
 * withdrawn, the personal-data registry walk. The app starts only here. */
async function eraseAccounts(ids: readonly string[]): Promise<{
  erased: number;
  skipped: string[];
  failed: { id: string; error: string }[];
}> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const result = {
    erased: 0,
    skipped: [] as string[],
    failed: [] as { id: string; error: string }[],
  };
  try {
    const eraser = app.get(AccountAnonymizationService);
    for (const id of ids) {
      try {
        if (await eraser.anonymize(id, new Date(), 'deletion_request')) {
          result.erased += 1;
        } else {
          result.skipped.push(id);
        }
      } catch (err) {
        result.failed.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await app.close();
  }
  return result;
}

// --- main ----------------------------------------------------------------------------

async function inspect(db: PrismaClient, args: PurgeArgs) {
  const plan = purgePlanFor(await dbTables(db));
  if (plan.unknown.length) {
    throw new Error(
      `tables not in the keep / wipe lists (src/ops/prelaunch-wipe.plan.ts): ${plan.unknown.join(', ')}`,
    );
  }
  const fks: Fk[] = await foreignKeys(db);
  const bad = purgeCascadeViolations(fks, plan);
  if (bad.length) {
    throw new Error(
      `TRUNCATE CASCADE would reach kept tables: ${bad
        .map((f) => `${f.fromTable}.${f.fromColumn} → ${f.toTable}`)
        .join(', ')}`,
    );
  }
  const users = await loadUsers(db);
  const keepPhones = args.mode === 'keep_phones' ? args.keepPhones : null;
  const seed = splitUsers(users, keepPhones, new Set()).keep.map(
    (k) => k.user.id,
  );
  const live = await survivors(db, plan, fks, seed);
  const split = splitUsers(users, keepPhones, live.users);
  return { plan, fks, users, live, split };
}

async function main(): Promise<void> {
  const args = parsePurgeArgs(process.argv.slice(2));
  await unwrapKmsWrappedKeys();
  const db = new PrismaClient();
  try {
    const dbName = (
      await db.$queryRawUnsafe<{ d: string }[]>(
        'SELECT current_database() AS d',
      )
    )[0]?.d;
    if (!dbName) throw new Error('cannot read the database name');
    out(
      `Purge test data — database "${dbName}" — ${args.mode === 'all_users' ? 'ALL app users' : `keep phones ${args.keepPhones.map(maskPhone).join(', ')}`} — ${args.apply ? 'APPLY' : 'DRY RUN (nothing is deleted)'}`,
    );
    out();

    const before = await inspect(db, args);
    const { split, live, plan, fks } = before;
    const counts = await userCounts(db);
    if (
      args.mode === 'keep_phones' &&
      !split.keep.some((k) => k.reason === 'phone')
    ) {
      printSplit(split, counts);
      throw new Error('refused: no account matches the --keep-phones numbers');
    }
    printSplit(split, counts);
    out();
    if (split.remove.some((u) => u.role === 'admin')) {
      throw new Error('refused: an admin account is on the DELETE list');
    }

    if (args.mode === 'keep_phones') {
      out(
        `Apply erases ${split.remove.length} accounts through the account erasure service (no grace period).`,
      );
      if (!args.apply) {
        out('Dry run only. Add --apply --confirm=DELETE-TEST-DATA to erase.');
        return;
      }
      const res = await eraseAccounts(split.remove.map((u) => u.id));
      out();
      for (const id of res.skipped)
        out(`  not erased (legal hold or already erased): ${id}`);
      for (const f of res.failed) out(`  FAILED ${f.id}: ${f.error}`);
      out(
        `Erased: ${res.erased}, skipped: ${res.skipped.length}, failed: ${res.failed.length}`,
      );
      out();
      printSplit((await inspect(db, args)).split, await userCounts(db));
      if (res.failed.length > 0) {
        throw new Error(`${res.failed.length} accounts were not erased`);
      }
      return;
    }

    // --all-users: dry run of every phase first, always.
    const run = async (execute: boolean) => {
      const removed: Record<string, number> = {};
      if (args.phases.has('bunny'))
        removed.bunny = await bunnyPhase(db, execute);
      if (args.phases.has('db')) {
        if (!execute) await dbSummary(db, plan, live);
        else {
          out('== Database');
          const r = await applyDb(db, plan, fks, live);
          Object.assign(removed, {
            tables_truncated: r.truncated,
            sign_in_rows: r.userRows,
            user_sticker_packs: r.stickerPacks,
            files: r.files,
            users: r.users,
          });
          out('  done.');
        }
      }
      if (args.phases.has('s3')) {
        removed.s3_objects = await s3Phase(
          db,
          live,
          args.purgeVersions,
          execute,
        );
      }
      if (args.phases.has('redis'))
        removed.redis_keys = await redisPhase(execute);
      return removed;
    };
    await run(false);
    if (!args.apply) {
      out();
      out(
        'Dry run only. Add --apply --confirm=DELETE-ALL-USERS to delete (docs/runbooks/DEPLOY_PROD.md).',
      );
      return;
    }
    out();
    out('APPLY — deleting what is listed above.');
    const removed = await run(true);
    out();
    out('Removed:');
    for (const [k, n] of Object.entries(removed)) out(`  ${k.padEnd(20)} ${n}`);
    out();
    printSplit((await inspect(db, args)).split, await userCounts(db));
    out();
    out(
      'Next: search engine (if on) — node dist/src/cli/search-alias.js start --source=postgres, run, swap.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(
      `purge-test-data: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  },
);
