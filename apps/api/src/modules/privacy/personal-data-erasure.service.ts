import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ALL_VARIANT_PX, variantKey } from '../files/files.policy';
import { FileReleaseService } from '../files/storage/file-release.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { familyOf } from '../../sharding/shard-manifest';
import { shardContext } from '../../sharding/shard-context';
import {
  CDN_INVALIDATOR,
  type CdnInvalidator,
} from '../../common/cdn/cdn-invalidator';
import {
  EXTERNAL_STORES,
  SWEEPS,
  type ErasurePolicy,
  type StoreKind,
} from './personal-data-registry';

/** Bump when the registry gains or loses a store (shown on the certificate). */
export const REGISTRY_VERSION = '2026-10-29';

export type StoreStatus =
  'done' | 'retained' | 'skipped' | 'not_configured' | 'blocked' | 'failed';

/** Prefix of the registry rows in `deletion_steps` (owned by the privacy
 * hardening work): one row per store, the certificate row, see below. */
export const STORE_STEP = 'store:';
export const CERT_STEP = 'certificate';

/** `deletion_steps.status` for a registry result. */
function stepStatus(
  s: StoreStatus,
): 'ok' | 'failed' | 'retained' | 'skipped' | 'pending' {
  switch (s) {
    case 'done':
      return 'ok';
    case 'retained':
      return 'retained';
    case 'skipped':
    case 'not_configured':
      return 'skipped';
    case 'blocked':
      return 'pending';
    default:
      return 'failed';
  }
}

/** What happened to one store; one entry per store in the run record. */
export interface StoreResult {
  status: StoreStatus;
  kind: StoreKind;
  policy: ErasurePolicy | 'block';
  /** Rows / objects / keys handled (when the store can count). */
  count?: number;
  /** Rows deleted per model (database stores). */
  models?: Record<string, number>;
  detail?: string;
  at: string;
}

export interface ErasureCertificate {
  certificateId: string;
  /** The pseudonymous account id (the person behind it is gone). */
  userId: string;
  homeRegion: string;
  registryVersion: string;
  completedAt: string;
  stores: Record<string, StoreResult>;
  /** What was knowingly kept and why (plain words, for the person). */
  retained: { store: string; why: string }[];
  /** sha256 of the stores block: tamper evidence for the record. */
  digest: string;
}

export interface ErasureOutcome {
  completed: boolean;
  failed: string[];
  certificate?: ErasureCertificate;
}

const TERMINAL: ReadonlySet<StoreStatus> = new Set([
  'done',
  'retained',
  'skipped',
  'not_configured',
]);
/** A run still `running` after this long counts as abandoned (a worker
 * died) and is picked up again by the scheduler. */
export const STALE_RUN_MINUTES = 60;

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

interface Delegate {
  deleteMany(args: { where: unknown }): Promise<{ count: number }>;
}

/** Active legal hold on a person (GDPR Art. 17(3)(e)). */
export async function activeLegalHold(
  prisma: PrismaService,
  userId: string,
  now: Date,
): Promise<boolean> {
  const hold = await prisma.legalHold.findFirst({
    where: {
      target_type: 'user',
      target_id: userId,
      released_at: null,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    select: { id: true },
  });
  return hold !== null;
}

/**
 * Owner 2026-10-29: walks the personal-data registry for one account.
 * Idempotent and resumable: the result of every store is saved in
 * `deletion_steps` (rows `store:<id>`, PR #360) right after it finishes, a repeated call skips what is
 * already final and retries only what failed. Database sweeps run on EVERY
 * physical database (forEachDatabase); external stores (objects, CDN, Redis,
 * search) follow. A legal hold stops the whole run before anything is
 * touched here. The finished run becomes the erasure certificate.
 */
@Injectable()
export class PersonalDataErasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly release: FileReleaseService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() @Inject(CDN_INVALIDATOR) private readonly cdn?: CdnInvalidator,
  ) {
    this.logger.setContext(PersonalDataErasureService.name);
  }

  /** Records that a legal hold deferred the erasure (store `legal_hold`). */
  async markBlocked(userId: string, now: Date = new Date()): Promise<void> {
    await shardContext.runOnPrimary(() =>
      this.persist(
        userId,
        'legal_hold',
        this.result('legal_hold', 'blocked', now, {
          detail: 'legal hold active: erasure deferred until released',
        }),
      ),
    );
  }

  /** Users whose erasure started but never finished (crash, failed store):
   * registry rows exist, no certificate, nothing touched for a while, and
   * no legal hold waiting. */
  async incompleteUserIds(
    skip: string[],
    take: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    const before = new Date(now.getTime() - STALE_RUN_MINUTES * 60_000);
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT s.user_id FROM deletion_steps s
      WHERE s.step LIKE 'store:%' AND s.updated_at < ${before}
        AND (cardinality(${skip}::uuid[]) = 0 OR s.user_id <> ALL(${skip}::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM deletion_steps c
          WHERE c.user_id = s.user_id AND c.step = 'certificate' AND c.status = 'ok')
        AND NOT EXISTS (SELECT 1 FROM deletion_steps h
          WHERE h.user_id = s.user_id AND h.step = 'store:legal_hold' AND h.status = 'pending')
      GROUP BY s.user_id
      ORDER BY MIN(s.updated_at) ASC
      LIMIT ${take}`;
    return rows.map((r) => r.user_id);
  }

  /** True when registry rows exist and the certificate row does not. */
  async hasOpenRun(userId: string): Promise<boolean> {
    const rows = await this.load(userId);
    return rows.stores.size > 0 && rows.certificate === null;
  }

  async certificateOf(userId: string): Promise<{
    status: string;
    stores: Record<string, StoreResult>;
    certificate: ErasureCertificate | null;
  } | null> {
    const rows = await this.load(userId);
    if (rows.stores.size === 0 && !rows.certificate) return null;
    const stores = Object.fromEntries(rows.stores);
    const blocked = stores.legal_hold?.status === 'blocked';
    const failed = Object.values(stores).some((r) => r.status === 'failed');
    return {
      status: rows.certificate
        ? 'completed'
        : blocked
          ? 'blocked'
          : failed
            ? 'failed'
            : 'running',
      stores,
      certificate: rows.certificate,
    };
  }

  /** Runs (or resumes) the whole registry for [userId]. */
  async run(userId: string, now: Date = new Date()): Promise<ErasureOutcome> {
    return shardContext.runOnPrimary(() => this.runInner(userId, now));
  }

  private async runInner(userId: string, now: Date): Promise<ErasureOutcome> {
    const run = await this.load(userId);
    if (run.certificate) {
      return { completed: true, failed: [], certificate: run.certificate };
    }
    const stores: Record<string, StoreResult> = Object.fromEntries(run.stores);
    const step = async (
      id: string,
      fn: () => Promise<Omit<StoreResult, 'at' | 'kind' | 'policy'>>,
    ): Promise<void> => {
      const prior = stores[id];
      if (prior && TERMINAL.has(prior.status)) return;
      const meta = EXTERNAL_STORES.find((s) => s.id === id);
      const kind: StoreKind = meta?.kind ?? 'database';
      const policy = meta?.policy ?? 'erase';
      try {
        const r = await fn();
        stores[id] = { ...r, kind, policy, at: new Date().toISOString() };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error({ userId, store: id, err: detail }, 'erasure step');
        stores[id] = {
          status: 'failed',
          kind,
          policy,
          detail: detail.slice(0, 300),
          at: new Date().toISOString(),
        };
      }
      await this.persist(userId, id, stores[id]);
    };

    // 1. legal hold (final answer: nothing below runs while one is active)
    if (await activeLegalHold(this.prisma, userId, now)) {
      stores.legal_hold = this.result('legal_hold', 'blocked', now, {
        detail: 'legal hold active: erasure deferred until released',
      });
      await this.persist(userId, 'legal_hold', stores.legal_hold);
      return { completed: false, failed: ['legal_hold'] };
    }
    stores.legal_hold = this.result('legal_hold', 'done', now, {
      detail: 'no active legal hold',
    });
    await this.persist(userId, 'legal_hold', stores.legal_hold);

    // 2. every table of the registry, on every physical database
    await forEachDatabase(this.prisma, (database) =>
      step(`database:${database}`, () => this.sweepSharded(userId)),
    );
    await step('database:global', () => this.sweepGlobal(userId));

    // 3. external stores
    await step('object_storage', () => this.objectStorage(userId, now));
    await step('cdn_cache', () => this.cdnCache(userId));
    await step('video', () => this.videos(userId));
    await step('push', () =>
      Promise.resolve(this.fromSweeps(stores, ['PushToken', 'VoipToken'])),
    );
    await step('redis', () => this.redisKeys(userId));
    await step('search_index', () => this.searchIndex(userId));
    await step('analytics', () =>
      Promise.resolve(
        this.fromSweeps(stores, [
          'UserActivityDay',
          'SearchQueryLog',
          'SearchClick',
          'PostView',
          'PostViewEvent',
        ]),
      ),
    );
    await step('archive', () =>
      Promise.resolve(this.fromSweeps(stores, ['DataExportJob'])),
    );
    for (const id of ['ledger', 'audit'] as const) {
      await step(id, () =>
        Promise.resolve({
          status: 'retained' as const,
          detail: EXTERNAL_STORES.find((s) => s.id === id)?.description,
        }),
      );
    }

    const failed = Object.entries(stores)
      .filter(([, r]) => !TERMINAL.has(r.status))
      .map(([id]) => id);
    if (failed.length > 0) {
      return { completed: false, failed };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { home_region: true },
    });
    const certificate = await this.finish(
      userId,
      stores,
      user?.home_region ?? 'us',
      now,
    );
    this.logger.info({ userId }, 'personal data erased');
    return { completed: true, failed: [], certificate };
  }

  // ---- stores -------------------------------------------------------------

  private async sweepModels(
    userId: string,
    models: string[],
  ): Promise<{
    count: number;
    models: Record<string, number>;
    errors: string[];
  }> {
    const perModel: Record<string, number> = {};
    const errors: string[] = [];
    let count = 0;
    for (const model of models) {
      const fields = SWEEPS[model];
      const delegate = (this.prisma as unknown as Record<string, Delegate>)[
        lowerFirst(model)
      ];
      if (!delegate) {
        errors.push(`${model}: no delegate`);
        continue;
      }
      try {
        const { count: n } = await delegate.deleteMany({
          where:
            fields.length === 1
              ? { [fields[0]]: userId }
              : { OR: fields.map((f) => ({ [f]: userId })) },
        });
        perModel[model] = n;
        count += n;
      } catch (error) {
        errors.push(
          `${model}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { count, models: perModel, errors };
  }

  private async sweepSharded(userId: string): Promise<StoreOutcome> {
    const models = Object.keys(SWEEPS).filter((m) => familyOf(m) !== 'global');
    const r = await this.sweepModels(userId, models);
    return this.sweepOutcome(r);
  }

  private async sweepGlobal(userId: string): Promise<StoreOutcome> {
    const models = Object.keys(SWEEPS).filter((m) => familyOf(m) === 'global');
    const r = await shardContext.runOnPrimary(() =>
      this.sweepModels(userId, models),
    );
    return this.sweepOutcome(r);
  }

  private sweepOutcome(r: {
    count: number;
    models: Record<string, number>;
    errors: string[];
  }): StoreOutcome {
    if (r.errors.length > 0) {
      return {
        status: 'failed',
        count: r.count,
        models: r.models,
        detail: r.errors.join('; ').slice(0, 300),
      };
    }
    return { status: 'done', count: r.count, models: r.models };
  }

  /** Sum of the sweep counts of [models] over every database store. */
  private fromSweeps(
    stores: Record<string, StoreResult>,
    models: string[],
  ): StoreOutcome {
    let count = 0;
    const per: Record<string, number> = {};
    for (const [id, r] of Object.entries(stores)) {
      if (!id.startsWith('database:')) continue;
      if (!TERMINAL.has(r.status)) {
        throw new Error(`${id} sweep not finished`);
      }
      if (!r.models) continue;
      for (const m of models) {
        const n = r.models[m] ?? 0;
        per[m] = (per[m] ?? 0) + n;
        count += n;
      }
    }
    return { status: 'done', count, models: per };
  }

  private async objectStorage(
    userId: string,
    now: Date,
  ): Promise<StoreOutcome> {
    // Personal exports are not in ANONYMIZED_FILE_PURPOSES (they expire on
    // their own); on erasure they go now.
    const exports = await this.prisma.file.findMany({
      where: {
        owner_user_id: userId,
        purpose: 'data_export',
        deleted_at: null,
      },
      select: { id: true },
    });
    await this.release.release(
      exports.map((f) => f.id),
      'account_deleted',
      now,
    );
    // Rows released earlier (anonymization) but whose objects failed to
    // disappear are purged again: purge() only touches unpurged rows.
    const released = await this.prisma.file.findMany({
      where: { owner_user_id: userId, deleted_reason: 'account_deleted' },
      select: { id: true, purged_at: true },
    });
    const pending = released.filter((f) => f.purged_at === null);
    if (pending.length > 0) {
      await this.release.purge(
        pending.map((f) => f.id),
        now,
      );
    }
    const left = await this.prisma.file.count({
      where: {
        owner_user_id: userId,
        deleted_reason: 'account_deleted',
        purged_at: null,
      },
    });
    const evidence = await this.prisma.mediaModerationCheck.count({
      where: { owner_user_id: userId, status: 'csam_match' },
    });
    return {
      status: left === 0 ? 'done' : 'failed',
      count: released.length - left,
      detail:
        (left > 0 ? `${left} objects not removed yet (retry). ` : '') +
        (evidence > 0
          ? `${evidence} evidence file(s) kept for the mandatory report (18 U.S.C. 2258A).`
          : ''),
    };
  }

  private async cdnCache(userId: string): Promise<StoreOutcome> {
    if (!this.cdn) {
      return {
        status: 'not_configured',
        detail:
          'no CDN invalidator bound (see common/cdn); origin objects are gone and cached copies expire with their TTL',
      };
    }
    const files = await this.prisma.file.findMany({
      where: { owner_user_id: userId, deleted_reason: 'account_deleted' },
      select: { s3_key: true },
    });
    const keys = [
      ...new Set(
        files.flatMap((f) => [
          f.s3_key,
          ...ALL_VARIANT_PX.map((px) => variantKey(f.s3_key, px)),
        ]),
      ),
    ];
    if (keys.length === 0) return { status: 'done', count: 0 };
    await this.cdn.enqueue(keys, 'account_erasure');
    return { status: 'done', count: keys.length };
  }

  private async videos(userId: string): Promise<StoreOutcome> {
    const [total, pending] = await Promise.all([
      this.prisma.videoAsset.count({ where: { owner_user_id: userId } }),
      this.prisma.videoAsset.count({
        where: { owner_user_id: userId, purged_at: null },
      }),
    ]);
    return {
      status: 'done',
      count: total - pending,
      detail:
        pending > 0
          ? `${pending} video(s) marked deleted, removed at Bunny by the videos.sweep`
          : undefined,
    };
  }

  private async redisKeys(userId: string): Promise<StoreOutcome> {
    let removed = 0;
    removed += await this.redis.del(
      `presence:${userId}`,
      `blocks:${userId}`,
      `badge:${userId}`,
    );
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `idempotency:${userId}:*`,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) removed += await this.redis.del(...keys);
    } while (cursor !== '0');
    return { status: 'done', count: removed };
  }

  private async searchIndex(userId: string): Promise<StoreOutcome> {
    const [on] = await this.prisma.$queryRaw<{ on: boolean }[]>`
      SELECT search_outbox_on() AS on`;
    if (!on?.on) {
      return {
        status: 'skipped',
        detail:
          'search.engine is postgres: results read the live (scrubbed) rows, no separate index',
      };
    }
    // The triggers already queued the rows the anonymization changed; this
    // is the explicit "rebuild the person document" event.
    const n = await this.prisma.$executeRaw`
      INSERT INTO search_outbox (entity, entity_id)
      VALUES ('person', ${userId}::UUID)`;
    return { status: 'done', count: Number(n) };
  }

  // ---- run record ---------------------------------------------------------

  private result(
    id: string,
    status: StoreStatus,
    now: Date,
    extra: Partial<StoreResult> = {},
  ): StoreResult {
    const meta = EXTERNAL_STORES.find((s) => s.id === id);
    return {
      status,
      kind: meta?.kind ?? 'database',
      policy: meta?.policy ?? 'erase',
      at: now.toISOString(),
      ...extra,
    };
  }

  /** Registry rows of a person from `deletion_steps` (+ certificate). */
  private async load(userId: string): Promise<{
    stores: Map<string, StoreResult>;
    certificate: ErasureCertificate | null;
  }> {
    const rows = await this.prisma.deletionStep.findMany({
      where: {
        user_id: userId,
        OR: [{ step: { startsWith: STORE_STEP } }, { step: CERT_STEP }],
      },
      select: { step: true, status: true, detail: true },
    });
    const stores = new Map<string, StoreResult>();
    let certificate: ErasureCertificate | null = null;
    for (const r of rows) {
      let parsed: unknown = null;
      try {
        parsed = r.detail ? JSON.parse(r.detail) : null;
      } catch {
        parsed = null;
      }
      if (r.step === CERT_STEP) {
        if (r.status === 'ok' && parsed)
          certificate = parsed as ErasureCertificate;
      } else if (parsed) {
        stores.set(r.step.slice(STORE_STEP.length), parsed as StoreResult);
      }
    }
    return { stores, certificate };
  }

  private async persist(
    userId: string,
    id: string,
    r: StoreResult,
  ): Promise<void> {
    const step = `${STORE_STEP}${id}`;
    const detail = JSON.stringify(r);
    const status = stepStatus(r.status);
    await shardContext.runOnPrimary(() =>
      this.prisma.deletionStep.upsert({
        where: { user_id_step: { user_id: userId, step } },
        create: { user_id: userId, step, status, detail },
        update: { status, detail, attempts: { increment: 1 } },
      }),
    );
  }

  private async finish(
    userId: string,
    stores: Record<string, StoreResult>,
    homeRegion: string,
    now: Date,
  ): Promise<ErasureCertificate> {
    const certificate: ErasureCertificate = {
      certificateId: randomUUID(),
      userId,
      homeRegion,
      registryVersion: REGISTRY_VERSION,
      completedAt: now.toISOString(),
      stores,
      retained: EXTERNAL_STORES.filter((s) =>
        s.policy.startsWith('retain'),
      ).map((s) => ({ store: s.id, why: s.description })),
      digest: createHash('sha256').update(JSON.stringify(stores)).digest('hex'),
    };
    const detail = JSON.stringify(certificate);
    await shardContext.runOnPrimary(() =>
      this.prisma.deletionStep.upsert({
        where: { user_id_step: { user_id: userId, step: CERT_STEP } },
        create: { user_id: userId, step: CERT_STEP, status: 'ok', detail },
        update: { status: 'ok', detail, attempts: { increment: 1 } },
      }),
    );
    return certificate;
  }
}

type StoreOutcome = Omit<StoreResult, 'at' | 'kind' | 'policy'>;
