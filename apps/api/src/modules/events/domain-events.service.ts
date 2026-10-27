import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  CrossFamilyOutbox,
  type OutboxTicket,
} from '../../sharding/outbox/cross-family-outbox';
import { DomainEventConsumers } from './domain-event-consumers';
import type {
  DomainEventMap,
  DomainEventRecord,
  DomainEventType,
  EventsSink,
} from './domain-event.types';

export const AUTO_SINK_KEY = 'events:sink:auto';
const SINK_CACHE_MS = 15_000;
/** Default of `events.max_per_day`: events recorded per UTC day at most. */
export const EVENTS_MAX_PER_DAY = 1_000_000;
const dayKey = (d: Date): string =>
  `events:day:${d.toISOString().slice(0, 10)}`;

export interface DomainEventTicket {
  readonly outbox: OutboxTicket | null;
  readonly event: DomainEventRecord;
}

export interface EmitOptions {
  /** Idempotency key: emitting the same key twice records one event. */
  key?: string;
  actorId?: string | null;
}

/**
 * The one internal domain-event bus (events pipeline, N-2).
 *
 *   const tickets: Array<DomainEventTicket | null | undefined> = [];
 *   await withTxRetry(this.prisma, async (tx) => {
 *     const row = await tx.case.create(...);
 *     tickets.push(await this.events?.emit(tx, 'case.created', {...}));
 *   });
 *   await this.events?.flush(tickets);           // after the commit
 *
 * It does NOT own an outbox: the event is written by the existing cross-family
 * outbox effect `domain.event.record` (same transaction as the business write
 * on the primary database; stored + relayed on another database). After the
 * commit `flush` hands the event to the named consumers. `events.sink`:
 * off (nothing), db (table), stream (table + Kinesis), auto (DEFAULT: off
 * until a non-internal consumer is registered, i.e. while experiments /
 * analytics actually read the events; then db, and stream above the daily
 * ceiling, decided by EventsMaintenance). Perf review 2026-10-26 (R-41):
 * nothing consumed the events yet every case, bid, payment, sign-up and post
 * paid an outbox INSERT + a domain_events INSERT + a Redis INCR.
 * Hard ceiling `events.max_per_day` (default 1 000 000): past it the day
 * records nothing more, whatever the mode.
 */
@Injectable()
export class DomainEvents {
  private readonly log = new Logger(DomainEvents.name);
  private cached?: { sink: EventsSink; at: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: CrossFamilyOutbox,
    private readonly consumers: DomainEventConsumers,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** The effective sink right now (`auto` already resolved). */
  async sink(): Promise<EventsSink> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < SINK_CACHE_MS) {
      return this.cached.sink;
    }
    let sink: EventsSink = 'off';
    try {
      const raw = (await this.settings?.string('events.sink')) ?? 'auto';
      if (raw === 'off' || raw === 'db' || raw === 'stream') sink = raw;
      else if (!this.consumers.hasBusinessConsumers()) sink = 'off';
      else {
        sink =
          (await this.redis?.get(AUTO_SINK_KEY)) === 'stream' ? 'stream' : 'db';
      }
      if (sink !== 'off' && (await this.overDailyCeiling())) sink = 'off';
    } catch {
      sink = 'off';
    }
    // A stream that is not configured never receives anything.
    if (sink === 'stream' && !(process.env.EVENTS_STREAM_NAME ?? '').trim()) {
      sink = 'db';
    }
    this.cached = { sink, at: now };
    return sink;
  }

  /** Today's count (the ops.daily-counter consumer) past `events.max_per_day`. */
  private async overDailyCeiling(): Promise<boolean> {
    if (!this.redis) return false;
    let max = EVENTS_MAX_PER_DAY;
    try {
      const v = await this.settings?.number('events.max_per_day');
      if (v !== undefined && Number.isFinite(v) && v > 0) max = v;
    } catch {
      max = EVENTS_MAX_PER_DAY;
    }
    const n = Number((await this.redis.get(dayKey(new Date()))) ?? 0);
    return n >= max;
  }

  /** Call inside the business transaction. Null when the sink is off. */
  async emit<T extends DomainEventType>(
    tx: Prisma.TransactionClient,
    type: T,
    payload: DomainEventMap[T],
    opts: EmitOptions = {},
  ): Promise<DomainEventTicket | null> {
    const sink = await this.sink();
    if (sink === 'off') return null;
    const id = randomUUID();
    const key = opts.key ?? `evt:${type}:${id}`;
    const event: DomainEventRecord<T> = {
      id,
      type,
      key,
      actorId: opts.actorId ?? null,
      payload,
      occurredAt: new Date().toISOString(),
    };
    const ticket = await this.outbox.emit(
      tx,
      'domain.event.record',
      { ...event, stream: sink === 'stream' },
      key,
    );
    return { outbox: ticket, event };
  }

  /** After the commit: relay now (other databases) and run the consumers. */
  async flush(
    tickets: ReadonlyArray<DomainEventTicket | null | undefined>,
  ): Promise<void> {
    const real = tickets.filter((t): t is DomainEventTicket => !!t);
    if (real.length === 0) return;
    await this.outbox.flush(real.map((t) => t.outbox));
    for (const t of real) await this.consumers.dispatch(t.event);
  }

  /**
   * For facts that happen outside a business transaction (the user row was
   * created earlier, a post goes public later): its own tiny transaction.
   * Best effort, never throws: an event must not fail a sign-up.
   */
  async record<T extends DomainEventType>(
    type: T,
    payload: DomainEventMap[T],
    opts: EmitOptions = {},
  ): Promise<void> {
    try {
      let ticket: DomainEventTicket | null = null;
      await withTxRetry(this.prisma, async (tx) => {
        ticket = await this.emit(tx, type, payload, opts);
      });
      await this.flush([ticket]);
    } catch (e) {
      this.log.warn(`record ${type}: ${String(e)}`);
    }
  }
}
