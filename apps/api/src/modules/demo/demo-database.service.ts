import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import {
  demoDatabaseName,
  demoDatabaseUrl,
  PrismaService,
  routingOf,
} from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { REQUIRED_CONSENTS } from '../users/services/onboarding.service';
import { DEMO_AVATAR_SIZE, renderDemoAvatarPng } from './demo-avatar';
import { seedDemoWorld } from './demo-seed';

/**
 * Owner 2026-10-05 («Продвижение»): keeps the DEMO database alive without
 * anyone's hands (automation principle):
 *
 *  1. on boot: `CREATE DATABASE IF NOT EXISTS <db>_demo` (ignored when
 *     the app role may not — infra then creates it), connect, replay the
 *     very same Prisma migrations the real database runs (recorded in the
 *     demo database's `_prisma_migrations`, so `prisma migrate deploy`
 *     against it is also fine), mirror reference tables and seed the
 *     world when it is empty;
 *  2. `resetWorld()`: truncate everything, mirror, seed — used by the
 *     admin button and by the sweep when the last demo account expired;
 *  3. health (`state`) for the admin tab.
 *
 * Boot never fails because of the demo world: any error leaves
 * `state.ready = false` with a plain reason and the demo endpoints answer
 * 503 DEMO_UNAVAILABLE.
 */
export interface DemoDatabaseState {
  ready: boolean;
  reason: string | null;
  databaseName: string | null;
  migrationsApplied: number;
  migrationsPending: number;
  lastResetAt: Date | null;
  lastSeedCounts: Record<string, number> | null;
}

/** Tables copied from the real database into the demo world on reset.
 * Order respects foreign keys. Nothing here is personal data. */
const MIRRORED_MODELS = [
  'country',
  'state',
  'practiceArea',
  'i18nLanguage',
  'featureFlag',
  'appConfig',
  'legalDocument',
  'blockedEmailDomain',
  'plan',
  'planPrice',
  'stateBarRegistry',
] as const;

const LOCK_KEY = 'demo:world:lock';
const LOCK_TTL_SECONDS = 15 * 60;
// api, worker and every new task boot together on AWS: one process replays
// the demo migrations, the others wait and then find nothing pending
// (two replays at once fail with "relation … already exists").
const MIGRATE_LOCK_KEY = 'demo:world:migrate-lock';
const MIGRATE_LOCK_TTL_SECONDS = 15 * 60;
const MIGRATE_LOCK_POLL_MS = 3000;

@Injectable()
export class DemoDatabaseService implements OnApplicationBootstrap {
  private readonly state: DemoDatabaseState = {
    ready: false,
    reason: 'not initialised',
    databaseName: demoDatabaseName(),
    migrationsApplied: 0,
    migrationsPending: 0,
    lastResetAt: null,
    lastSeedCounts: null,
  };
  private preparing: Promise<void> | null = null;
  /** True while this process truncates, mirrors and seeds the world: the
   * database is migrated (`ready`) but has no reference rows yet. */
  private seeding = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly storage?: S3StorageService,
  ) {
    this.logger.setContext(DemoDatabaseService.name);
  }

  onApplicationBootstrap(): void {
    // Detached on purpose: the first run replays ~100 migrations and seeds
    // the world (tens of seconds); the API must not wait for it.
    // A stubbed PrismaService (unit/e2e harness) has no routing handle.
    if (!routingOf(this.prisma)) return;
    // Test runs prepare the demo world only when a test asks for it.
    if (process.env.NODE_ENV === 'test' && !process.env.DEMO_DATABASE_URL) {
      return;
    }
    void this.prepare();
  }

  snapshot(): DemoDatabaseState {
    return { ...this.state };
  }

  isReady(): boolean {
    return this.state.ready;
  }

  isSeeding(): boolean {
    return this.seeding;
  }

  /** The raw demo client (no soft-delete extension) for seed/bulk work. */
  rawDemoClient(): PrismaClient | null {
    return routingOf(this.prisma).demoClient();
  }

  realClient(): PrismaService {
    return routingOf(this.prisma).realClient();
  }

  /** Prepares the demo database; safe to call again (single flight). */
  prepare(): Promise<void> {
    this.preparing ??= this.doPrepare().finally(() => {
      this.preparing = null;
    });
    return this.preparing;
  }

  private async doPrepare(): Promise<void> {
    const url = demoDatabaseUrl();
    if (!url) {
      this.fail('DEMO_DATABASE_URL=off: the demo world is switched off');
      return;
    }
    try {
      await this.ensureDatabase();
      const demo = this.rawDemoClient();
      if (!demo) {
        this.fail('no demo client');
        return;
      }
      await demo.$connect();
      await this.withMigrateLock(() => this.applyMigrations(demo));
      routingOf(this.prisma).markDemoReady(true, 'ready');
      this.state.ready = true;
      this.state.reason = null;
      const users = await demo.user.count();
      if (users === 0) await this.resetWorld({ keepAccounts: true });
      this.logger.info(
        { database: this.state.databaseName },
        'Demo world ready',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.fail(msg);
      this.logger.warn({ err: e }, 'Demo world is not available');
    }
  }

  private fail(reason: string): void {
    this.state.ready = false;
    this.state.reason = reason;
    routingOf(this.prisma).markDemoReady(false, reason);
  }

  private async ensureDatabase(): Promise<void> {
    const name = demoDatabaseName();
    if (!name || !/^[a-z0-9_]+$/i.test(name)) {
      throw new Error(`invalid demo database name "${name ?? ''}"`);
    }
    try {
      await this.realClient().$executeRawUnsafe(
        `CREATE DATABASE IF NOT EXISTS "${name}"`,
      );
    } catch (e) {
      // The app role may lack CREATE DATABASE in production: infra creates
      // the database (docs/ops/demo-world.md) and this is only a note.
      this.logger.warn(
        { err: e },
        'Could not create the demo database myself; expecting it to exist',
      );
    }
  }

  // ---- migrations ------------------------------------------------------

  private async withMigrateLock(run: () => Promise<void>): Promise<void> {
    const token = randomUUID();
    const deadline = Date.now() + MIGRATE_LOCK_TTL_SECONDS * 1000;
    for (;;) {
      const locked = await this.redis.set(
        MIGRATE_LOCK_KEY,
        token,
        'EX',
        MIGRATE_LOCK_TTL_SECONDS,
        'NX',
      );
      if (locked === 'OK') break;
      if (Date.now() > deadline) {
        throw new Error('demo migrations are still running in another process');
      }
      await new Promise((r) => setTimeout(r, MIGRATE_LOCK_POLL_MS));
    }
    try {
      await run();
    } finally {
      if ((await this.redis.get(MIGRATE_LOCK_KEY)) === token) {
        await this.redis.del(MIGRATE_LOCK_KEY);
      }
    }
  }

  private migrationsDir(): string | null {
    const candidates = [
      resolve(process.cwd(), 'prisma/migrations'),
      resolve(__dirname, '../../../prisma/migrations'),
      resolve(__dirname, '../../../../prisma/migrations'),
    ];
    return candidates.find((c) => existsSync(c)) ?? null;
  }

  private async applyMigrations(demo: PrismaClient): Promise<void> {
    const dir = this.migrationsDir();
    if (!dir) throw new Error('prisma/migrations folder not found');
    await demo.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const applied = new Set(
      (
        await demo.$queryRawUnsafe<{ migration_name: string }[]>(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        )
      ).map((r) => r.migration_name),
    );
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const pending = names.filter((n) => !applied.has(n));
    this.state.migrationsPending = pending.length;
    this.state.migrationsApplied = applied.size;
    for (const name of pending) {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      const statements = splitSqlStatements(sql);
      const id = randomUUID();
      await demo.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)`,
        id,
        createHash('sha256').update(sql).digest('hex'),
        name,
      );
      let steps = 0;
      for (const statement of statements) {
        await demo.$executeRawUnsafe(statement);
        steps += 1;
      }
      await demo.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = $2 WHERE id = $1`,
        id,
        steps,
      );
      this.state.migrationsApplied += 1;
      this.state.migrationsPending -= 1;
      this.logger.info({ migration: name, steps }, 'Demo world migrated');
    }
  }

  // ---- world -----------------------------------------------------------

  /** Wipes every table of the demo world, mirrors reference data and seeds
   * it again. `keepAccounts` is for boot (the registry is already empty or
   * belongs to a previous world — the sweep sorts that out). */
  async resetWorld(opts: { keepAccounts?: boolean } = {}): Promise<void> {
    const demo = this.rawDemoClient();
    if (!demo || !this.state.ready) {
      throw new Error(this.state.reason ?? 'demo world not ready');
    }
    const token = randomUUID();
    const locked = await this.redis.set(
      LOCK_KEY,
      token,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    if (locked !== 'OK') {
      this.logger.info('Demo world reset already running elsewhere');
      return;
    }
    this.seeding = true;
    try {
      await this.deleteDemoFiles(demo);
      await this.truncateAll(demo);
      await this.mirrorReference(demo);
      const counts = await seedDemoWorld(demo);
      await this.finishUsers(demo);
      if (!opts.keepAccounts) {
        await this.realClient().demoAccount.deleteMany({});
      }
      this.state.lastResetAt = new Date();
      this.state.lastSeedCounts = counts;
      this.logger.info({ counts }, 'Demo world reset');
    } finally {
      this.seeding = false;
      const current = await this.redis.get(LOCK_KEY);
      if (current === token) await this.redis.del(LOCK_KEY);
    }
  }

  private async truncateAll(demo: PrismaClient): Promise<void> {
    const rows = await demo.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
    );
    const names = rows
      .map((r) => r.table_name)
      .filter((n) => /^[a-z0-9_]+$/i.test(n));
    if (names.length === 0) return;
    await demo.$executeRawUnsafe(
      `TRUNCATE ${names.map((n) => `"${n}"`).join(', ')} CASCADE`,
    );
  }

  private async mirrorReference(demo: PrismaClient): Promise<void> {
    const real = this.realClient() as unknown as Record<
      string,
      { findMany: () => Promise<Record<string, unknown>[]> }
    >;
    const target = demo as unknown as Record<
      string,
      {
        createMany: (args: {
          data: Record<string, unknown>[];
          skipDuplicates: boolean;
        }) => Promise<unknown>;
      }
    >;
    for (const model of MIRRORED_MODELS) {
      let rows = await real[model].findMany();
      // feature_flags.updated_by references users, and the demo world has
      // none of the real admins (FK violation in prod, 2026-10-07).
      if (model === 'featureFlag') {
        rows = rows.map((r) => ({ ...r, updated_by: null }));
      }
      for (let i = 0; i < rows.length; i += 500) {
        await target[model].createMany({
          data: rows.slice(i, i + 500),
          skipDuplicates: true,
        });
      }
    }
  }

  /** S3 objects of the demo world live under their own keys; delete them
   * before the rows that remember them are truncated. Best effort. */
  private async deleteDemoFiles(demo: PrismaClient): Promise<void> {
    if (!this.storage) return;
    try {
      const files = await demo.file.findMany({
        select: { s3_bucket: true, s3_key: true },
        take: 5000,
      });
      const byBucket = new Map<string, string[]>();
      for (const f of files) {
        const list = byBucket.get(f.s3_bucket) ?? [];
        list.push(f.s3_key);
        byBucket.set(f.s3_bucket, list);
      }
      for (const [bucket, keys] of byBucket) {
        for (let i = 0; i < keys.length; i += 1000) {
          await this.storage.remove(bucket, keys.slice(i, i + 1000));
        }
      }
    } catch (e) {
      this.logger.warn({ err: e }, 'Could not delete demo files from S3');
    }
  }

  /**
   * Makes demo users look fully onboarded to the app: required consents
   * for the current legal documents, a completed onboarding row, verified
   * phone/e-mail stamps, and for attorneys a generated avatar (the app
   * sends an attorney without a clean photo back to the photo step).
   * `userIds` omitted = every user without a completed onboarding row.
   */
  async finishUsers(demo: PrismaClient, userIds?: string[]): Promise<void> {
    const users = await demo.user.findMany({
      where: userIds
        ? { id: { in: userIds } }
        : { onboarding_state: null, deleted_at: null },
      select: {
        id: true,
        role: true,
        created_at: true,
        avatar_file_id: true,
        phone_verified_at: true,
        email_verified_at: true,
      },
    });
    if (users.length === 0) return;
    const docs = await demo.legalDocument.findMany({
      where: { is_current: true },
      select: { id: true, doc_type: true, locale: true },
    });
    const docFor = (type: string): string | null =>
      (
        docs.find((d) => d.doc_type === type && d.locale === 'en') ??
        docs.find((d) => d.doc_type === type)
      )?.id ?? null;
    await demo.userConsent.createMany({
      data: users.flatMap((u) =>
        REQUIRED_CONSENTS.map((type) => ({
          user_id: u.id,
          consent_type: type,
          document_id: docFor(type),
          granted: true,
          created_at: u.created_at,
        })),
      ),
    });
    await demo.onboardingState.createMany({
      data: users.map((u) => ({
        user_id: u.id,
        current_step: null,
        completed_at: u.created_at,
      })),
      skipDuplicates: true,
    });
    await demo.user.updateMany({
      where: { id: { in: users.map((u) => u.id) }, phone_verified_at: null },
      data: { phone_verified_at: new Date() },
    });
    await demo.user.updateMany({
      where: { id: { in: users.map((u) => u.id) }, email_verified_at: null },
      data: { email_verified_at: new Date() },
    });
    const attorneys = users.filter(
      (u) => u.role === 'attorney' && !u.avatar_file_id,
    );
    if (attorneys.length === 0 || !this.storage?.configured) return;
    let bucket: string;
    try {
      bucket = this.storage.bucket('media');
    } catch {
      return;
    }
    for (const u of attorneys) {
      try {
        const png = renderDemoAvatarPng(u.id);
        const fileId = randomUUID();
        const key = `demo/avatar/${u.id}/${fileId}`;
        await this.storage.put(bucket, key, png, 'image/png');
        await demo.file.create({
          data: {
            id: fileId,
            owner_user_id: u.id,
            purpose: 'avatar',
            s3_bucket: bucket,
            s3_key: key,
            mime: 'image/png',
            size_bytes: BigInt(png.length),
            sha256: createHash('sha256').update(png).digest('hex'),
            width: DEMO_AVATAR_SIZE,
            height: DEMO_AVATAR_SIZE,
            scan_status: 'clean',
            is_public: true,
          },
        });
        await demo.user.update({
          where: { id: u.id },
          data: { avatar_file_id: fileId },
        });
      } catch (e) {
        this.logger.warn({ err: e, user: u.id }, 'demo avatar failed');
      }
    }
  }

  /** Runs `fn` inside the demo world (Prisma routed to the demo DB). */
  runDemo<T>(fn: () => Promise<T>): Promise<T> {
    return demoContext.runDemo(fn);
  }
}

/**
 * Splits a Prisma migration file into statements: `;` outside single
 * quotes, `$$` bodies and `--` comments ends one. Prisma's CockroachDB
 * migrations contain neither functions nor procedures, but the splitter
 * copes with them anyway.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  let inDollar = false;
  let inComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inComment) {
      if (ch === '\n') inComment = false;
      continue;
    }
    if (!inQuote && !inDollar && ch === '-' && next === '-') {
      inComment = true;
      i += 1;
      continue;
    }
    if (!inDollar && ch === "'") {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (!inQuote && ch === '$' && next === '$') {
      inDollar = !inDollar;
      cur += '$$';
      i += 1;
      continue;
    }
    if (!inQuote && !inDollar && ch === ';') {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}
