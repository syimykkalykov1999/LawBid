import type { Prisma } from '../../generated/prisma/client';
import { recalcAttorneyRating } from '../../modules/reviews/review-rating';
import type { DbTx } from '../../prisma/secret-columns';

/**
 * Shard-ready step 7: the EFFECTS of cross-family outbox events, i.e. the
 * global-family writes that used to share a transaction with a sharded
 * write. An effect must be safe to run twice: the relay guarantees
 * exactly-once through the inbox table, but a hand-run replay (admin tool,
 * a restored backup) must not corrupt anything either.
 *
 * Where to put a write:
 *  - money and permissions (payments, balances, roles, bans, subscription
 *    state): do NOT make them an event. Write them on the global database
 *    first, in their own transaction, and let the sharded row reference
 *    the result (the tx facade does this for plain `tx.<global>` writes).
 *  - bookkeeping that can lag a moment and is derived from, or recorded
 *    next to, a sharded write (consent records, rating averages, counters):
 *    an event.
 */
export type GlobalClient = DbTx;

export interface EffectContext {
  /** Primary-database client (a transaction: the effect and its inbox row
   * commit together). */
  readonly global: GlobalClient;
  /** Every database that may hold sharded rows (one entry with one
   * database: then `global` is that database). */
  readonly databases: ReadonlyArray<{
    readonly key: string;
    readonly client: GlobalClient;
  }>;
}

export type Effect = (payload: never, ctx: EffectContext) => Promise<void>;

interface ConsentPayload {
  userId: string;
  consentType: string;
  ip: string | null;
  deviceId: string | null;
}

interface RatingPayload {
  attorneyId: string;
}

interface DomainEventPayload {
  id: string;
  type: string;
  key: string;
  actorId: string | null;
  payload: Prisma.InputJsonObject;
  occurredAt: string;
  /** True while the `stream` sink still has to ship the row. */
  stream: boolean;
}

interface TotalsRow {
  sum: bigint | number | string | null;
  count: bigint | number;
}

export const EFFECTS: Readonly<Record<string, Effect>> = {
  /** POST /cases first-time `client_contact_sharing` consent. */
  'user.consent.record': async (p: ConsentPayload, ctx) => {
    await ctx.global.userConsent.create({
      data: {
        user_id: p.userId,
        consent_type: p.consentType as never,
        granted: true,
        ip: p.ip,
        device_id: p.deviceId,
      },
    });
  },

  /**
   * Events pipeline (N-2): appends one row to `domain_events`. A repeat of
   * the same key inserts nothing (safe to replay).
   */
  'domain.event.record': async (p: DomainEventPayload, ctx) => {
    await ctx.global.domainEvent.createMany({
      data: [
        {
          id: p.id,
          type: p.type,
          idempotency_key: p.key,
          actor_user_id: p.actorId,
          payload: p.payload,
          occurred_at: new Date(p.occurredAt),
          published_at: p.stream ? null : new Date(p.occurredAt),
        },
      ],
      skipDuplicates: true,
    });
  },

  /**
   * attorney_profiles.rating_avg / rating_count from the attorney's
   * published reviews (docs/03 §7.5). Reviews of one attorney sit on every
   * database that holds a client's case, so the totals are summed over all
   * of them and the average is computed once, in SQL, on the global side.
   */
  'attorney.rating.recalc': async (p: RatingPayload, ctx) => {
    if (ctx.databases.length <= 1) {
      await recalcAttorneyRating(ctx.global, p.attorneyId);
      return;
    }
    let sum = 0;
    let count = 0;
    for (const db of ctx.databases) {
      const rows = await db.client.$queryRaw<TotalsRow[]>`
        SELECT COALESCE(sum(rating), 0) AS sum, count(id) AS count
        FROM reviews
        WHERE attorney_id = ${p.attorneyId}::UUID AND status = 'published'`;
      sum += Number(rows[0]?.sum ?? 0);
      count += Number(rows[0]?.count ?? 0);
    }
    await ctx.global.$executeRaw`
      UPDATE attorney_profiles
      SET rating_avg = COALESCE(round((${sum}::DECIMAL / NULLIF(${count}::INT, 0)), 2), 0),
          rating_count = ${count}::INT,
          updated_at = now()
      WHERE user_id = ${p.attorneyId}::UUID`;
  },
};

/**
 * THIRD_PASS_A X1 (26.11): AFTER-COMMIT effects, i.e. side effects outside
 * the database (queue a BullMQ job, call a service) that must not be lost
 * when the process dies between the commit and the call (transactional
 * outbox: Kleppmann DDIA ch. 11; microservices.io «Transactional outbox»).
 * Unlike EFFECTS they never run inside the caller's transaction (a job
 * could start before the row it reads is committed): `emit` always stores
 * the row in the same transaction, `flush` runs it right after the commit
 * and the every-minute `outbox.sweep` relay re-runs whatever did not finish
 * (a crash, a deploy kill, a Redis or database blip), with the same backoff
 * and dead letter as the other events. Delivery is at-least-once, so an
 * after-commit effect MUST be idempotent (a deterministic job id, a
 * per-recipient dedupe key). They need DI services, so the owning service
 * registers its effect on module init (the API and the worker both load it).
 */
export type AfterCommitEffect = (payload: never) => Promise<void>;

const AFTER_COMMIT = new Map<string, AfterCommitEffect>();

/** Registers (or replaces: a second app in the same process, tests) the
 * after-commit effect of [type]. */
export function registerAfterCommitEffect(
  type: string,
  effect: AfterCommitEffect,
): void {
  if (EFFECTS[type]) throw new Error(`outbox event ${type} already exists`);
  AFTER_COMMIT.set(type, effect);
}

/** The after-commit effect of [type], if one is registered. */
export function afterCommitEffect(type: string): AfterCommitEffect | undefined {
  return AFTER_COMMIT.get(type);
}
