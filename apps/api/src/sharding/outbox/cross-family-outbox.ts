import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, routingOf } from '../../prisma/prisma.service';
import { shardContext } from '../shard-context';
import { PRIMARY_DB } from '../shard-router';
import { EFFECTS, EffectContext } from './outbox-effects';

/**
 * Shard-ready step 7 (docs/architecture/SHARDING_READY.md §6 "Transactions"):
 * the transactional outbox for writes that cross families.
 *
 *   await withTxRetry(this.prisma, async (tx) => {
 *     await tx.case.create(...);                       // sharded write
 *     tickets.push(await this.outbox.emit(tx, 'user.consent.record', {...},
 *                                         `consent:${userId}:${caseId}`));
 *   });
 *   await this.outbox.flush(tickets);                  // after the commit
 *
 * Two modes, chosen per transaction:
 *  - the transaction runs on the PRIMARY database (today, always): the
 *    effect runs right there, inside the same transaction. Nothing is
 *    stored, atomicity is what it always was, the outcome is identical.
 *  - it runs on another database: the event is inserted into that
 *    database's `cross_family_outbox` in the same transaction as the sharded
 *    write; `flush` (right after the commit) applies it at once, and
 *    `sweep` (BullMQ cron, every minute) applies whatever flush could not.
 *    The relay applies an event in ONE primary-database transaction that
 *    first inserts the idempotency key into `cross_family_inbox`: a
 *    duplicate delivery inserts nothing and is skipped, so the effect
 *    happens exactly once. A failure backs off exponentially (5 s, 10 s ...
 *    capped at 1 h); after MAX_ATTEMPTS the row becomes `dead` (the dead
 *    letter, logged as `cross_family_outbox_dead`, re-queued by an admin
 *    with `retryDead`).
 *
 * `CROSS_FAMILY_OUTBOX_MODE=always` uses the stored mode even on the
 * primary database (tests, canary); `inline` never stores.
 */
export const MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 60;
const SWEEP_BATCH = 50;

/** `ops.outbox_sweep.mode` (audit X-22, 2026-10-26): off = never sweep,
 * on = every tick as before, auto = only when a database holds a row that
 * waits (one cheap EXISTS per database instead of the claiming UPDATE). */
export type OutboxSweepMode = 'off' | 'on' | 'auto';

export function parseOutboxSweepMode(raw: string): OutboxSweepMode {
  return raw === 'off' || raw === 'on' ? raw : 'auto';
}

export interface OutboxTicket {
  readonly database: string;
  readonly key: string;
}

export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 5 * 2 ** Math.max(0, attempts - 1));
}

export function outboxMode(
  env: NodeJS.ProcessEnv = process.env,
): 'auto' | 'always' | 'inline' {
  const v = (env.CROSS_FAMILY_OUTBOX_MODE ?? '').trim().toLowerCase();
  return v === 'always' || v === 'inline' ? v : 'auto';
}

interface OutboxRow {
  id: string;
  event_type: string;
  idempotency_key: string;
  payload: unknown;
  attempts: number;
}

@Injectable()
export class CrossFamilyOutbox {
  private readonly logger = new Logger(CrossFamilyOutbox.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The physical database the current shard context points at. */
  private currentDatabase(): string {
    const ctx = shardContext.current();
    const routing = routingOf(this.prisma);
    if (!ctx || !routing) return PRIMARY_DB;
    if (ctx.physical) return ctx.physical;
    if (ctx.shard === undefined) return PRIMARY_DB;
    return routing.router.physicalFor(ctx.shard);
  }

  private databases(): Array<{
    key: string;
    client: Prisma.TransactionClient;
  }> {
    const routing = routingOf(this.prisma);
    if (!routing) return [];
    const keys = new Set<string>([
      PRIMARY_DB,
      ...routing.router.physicalKeys(),
    ]);
    return [...keys].map((key) => ({
      key,
      client: routing.clientFor(key),
    }));
  }

  /**
   * Call inside the sharded transaction. Returns a ticket for `flush`, or
   * null when the effect already ran inline.
   */
  async emit(
    tx: Prisma.TransactionClient,
    type: string,
    payload: Record<string, unknown>,
    key: string,
  ): Promise<OutboxTicket | null> {
    const effect = EFFECTS[type];
    if (!effect) throw new Error(`unknown cross-family event: ${type}`);
    const database = this.currentDatabase();
    const mode = outboxMode();
    if (mode === 'inline' || (mode === 'auto' && database === PRIMARY_DB)) {
      await effect(payload as never, {
        global: tx,
        databases: [{ key: PRIMARY_DB, client: tx }],
      });
      return null;
    }
    await tx.crossFamilyOutbox.createMany({
      data: [
        {
          event_type: type,
          idempotency_key: key,
          payload: payload as Prisma.InputJsonObject,
        },
      ],
      skipDuplicates: true,
    });
    return { database, key };
  }

  /** After the commit: applies the given events now (best effort; the
   * sweep retries what fails). Never throws. */
  async flush(
    tickets: ReadonlyArray<OutboxTicket | null | undefined>,
  ): Promise<void> {
    for (const t of tickets) {
      if (!t) continue;
      try {
        const db = this.client(t.database);
        const rows = await db.$queryRaw<OutboxRow[]>`
          SELECT id::TEXT AS id, event_type, idempotency_key, payload, attempts
          FROM cross_family_outbox
          WHERE idempotency_key = ${t.key} AND status = 'pending'`;
        if (rows[0]) await this.apply(t.database, rows[0]);
      } catch (e) {
        this.logger.warn(`flush ${t.key}: ${String(e)}`);
      }
    }
  }

  /**
   * Relay: claims due rows on every database (a lease moves
   * `next_attempt_at` forward, `FOR UPDATE SKIP LOCKED` keeps two workers
   * apart) and applies them. Returns how many were applied.
   */
  async sweep(
    mode: OutboxSweepMode = 'on',
  ): Promise<{ applied: number; failed: number; skipped?: string }> {
    if (mode === 'off') return { applied: 0, failed: 0, skipped: 'off' };
    if (mode === 'auto' && !(await this.hasPending())) {
      return { applied: 0, failed: 0, skipped: 'empty' };
    }
    let applied = 0;
    let failed = 0;
    for (const { key, client } of this.databases()) {
      const rows = await (client as unknown as PrismaService).$queryRaw<
        OutboxRow[]
      >`
        UPDATE cross_family_outbox
        SET next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS}::DOUBLE PRECISION)
        WHERE id IN (
          SELECT id FROM cross_family_outbox
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY created_at
          LIMIT ${SWEEP_BATCH}
          FOR UPDATE SKIP LOCKED)
        RETURNING id::TEXT AS id, event_type, idempotency_key, payload, attempts`;
      for (const row of rows) {
        if (await this.apply(key, row)) applied += 1;
        else failed += 1;
      }
      await this.reportOldestPending(key, client);
    }
    return { applied, failed };
  }

  /** True when any database holds a pending event (a PK-sized EXISTS). An
   * unreachable database counts as «yes»: the sweep then decides. */
  async hasPending(): Promise<boolean> {
    for (const { client } of this.databases()) {
      try {
        const rows = await (client as unknown as PrismaService).$queryRaw<
          Array<{ found: number }>
        >`SELECT 1 AS found FROM cross_family_outbox WHERE status = 'pending' LIMIT 1`;
        if (rows.length > 0) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  /**
   * DB-ops S5-3: one log line per minute and database while something is
   * pending: `{metric: "cross_family_outbox_oldest_pending", ageSeconds}`.
   * CloudWatch alarms when the relay is stuck (infra/modules/monitoring/
   * db-health.tf). Nothing is logged for an empty queue (the usual case with
   * one database). Never throws.
   */
  private async reportOldestPending(
    database: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      const rows = await (client as unknown as PrismaService).$queryRaw<
        { age: number | null }[]
      >`
        SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))::FLOAT8 AS age
        FROM cross_family_outbox WHERE status = 'pending'`;
      const age = rows[0]?.age;
      if (age === null || age === undefined) return;
      this.logger.log({
        metric: 'cross_family_outbox_oldest_pending',
        database,
        ageSeconds: Math.max(0, Math.round(Number(age))),
        msg: 'oldest pending cross-family event',
      });
    } catch (e) {
      this.logger.warn(`oldest pending age ${database}: ${String(e)}`);
    }
  }

  /** Admin: puts dead events back in the queue. */
  async retryDead(): Promise<number> {
    let n = 0;
    for (const { client } of this.databases()) {
      n += await (client as unknown as PrismaService).$executeRaw`
        UPDATE cross_family_outbox
        SET status = 'pending', attempts = 0, next_attempt_at = now()
        WHERE status = 'dead'`;
    }
    return n;
  }

  private client(database: string): PrismaService {
    return routingOf(this.prisma).clientFor(database);
  }

  /** Applies one row; true when done (or already applied before). */
  private async apply(database: string, row: OutboxRow): Promise<boolean> {
    const origin = this.client(database);
    const effect = EFFECTS[row.event_type];
    try {
      if (!effect) throw new Error(`unknown event type ${row.event_type}`);
      const primary = this.client(PRIMARY_DB);
      const dbs = this.databases();
      await primary.$transaction(async (g) => {
        const inbox = await g.crossFamilyInbox.createMany({
          data: [
            {
              idempotency_key: row.idempotency_key,
              event_type: row.event_type,
            },
          ],
          skipDuplicates: true,
        });
        if (inbox.count === 0) return; // delivered before: exactly once
        const ctx: EffectContext = { global: g, databases: dbs };
        await effect(row.payload as never, ctx);
      });
      await origin.$executeRaw`
        UPDATE cross_family_outbox
        SET status = 'done', processed_at = now(), last_error = NULL
        WHERE id = ${row.id}::UUID`;
      return true;
    } catch (e) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const message = String(e).slice(0, 500);
      await origin.$executeRaw`
        UPDATE cross_family_outbox
        SET attempts = ${attempts},
            status = ${dead ? 'dead' : 'pending'},
            last_error = ${message},
            next_attempt_at = now() + make_interval(secs => ${backoffSeconds(attempts)}::DOUBLE PRECISION)
        WHERE id = ${row.id}::UUID`;
      if (dead) {
        this.logger.error({
          metric: 'cross_family_outbox_dead',
          eventType: row.event_type,
          key: row.idempotency_key,
          error: message,
          msg: 'cross-family event moved to the dead letter',
        });
      }
      return false;
    }
  }
}
