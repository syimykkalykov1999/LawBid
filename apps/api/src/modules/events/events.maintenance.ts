import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { DomainEventRecord, DomainEventType } from './domain-event.types';
import { AUTO_SINK_KEY, DomainEvents } from './domain-events.service';
import { EventStreamPublisher } from './event-stream.publisher';

const PRUNE_BATCH = 5000;
const PRUNE_MAX_BATCHES = 20;
const RELAY_BATCH = 500;

export const dayCounterKey = (d: Date): string =>
  `events:day:${d.toISOString().slice(0, 10)}`;

/**
 * Cron `events.maintain` (every 5 minutes, nearly free): (1) the Auto signal,
 * events/day against `events.auto_ceiling_per_day`; (2) with the stream
 * sink, ships unpublished rows to Kinesis; (3) once an hour, removes rows
 * older than `events.retention_days`.
 */
@Injectable()
export class EventsMaintenance {
  private readonly log = new Logger(EventsMaintenance.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
    private readonly publisher: EventStreamPublisher,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async run(
    now: Date = new Date(),
  ): Promise<{ pruned: number; published: number; auto: string | null }> {
    const auto = await this.evaluateAuto(now);
    const published = await this.relay();
    const pruned = now.getUTCMinutes() < 5 ? await this.prune(now) : 0;
    return { pruned, published, auto };
  }

  /** `auto`: stream above the ceiling (today or yesterday), else db. */
  async evaluateAuto(now: Date): Promise<string | null> {
    const mode = (await this.settings?.string('events.sink')) ?? 'db';
    if (mode !== 'auto' || !this.redis) return null;
    const ceiling =
      (await this.settings?.number('events.auto_ceiling_per_day')) ?? 0;
    const yesterday = new Date(now.getTime() - 86_400_000);
    const [a, b] = await Promise.all([
      this.redis.get(dayCounterKey(now)),
      this.redis.get(dayCounterKey(yesterday)),
    ]);
    const perDay = Math.max(Number(a ?? 0), Number(b ?? 0));
    const next = ceiling > 0 && perDay >= ceiling ? 'stream' : 'db';
    await this.redis.set(AUTO_SINK_KEY, next);
    return next;
  }

  /** Ships rows the stream sink has not published yet (at-least-once). */
  async relay(): Promise<number> {
    if ((await this.events.sink()) !== 'stream') return 0;
    if (!this.publisher.available()) return 0;
    let total = 0;
    for (;;) {
      const rows = await this.prisma.domainEvent.findMany({
        where: { published_at: null },
        orderBy: { occurred_at: 'asc' },
        take: RELAY_BATCH,
      });
      if (rows.length === 0) return total;
      const records: DomainEventRecord[] = rows.map((r) => ({
        id: r.id,
        type: r.type as DomainEventType,
        key: r.idempotency_key,
        actorId: r.actor_user_id,
        payload: r.payload as never,
        occurredAt: r.occurred_at.toISOString(),
      }));
      try {
        await this.publisher.publish(records);
      } catch (e) {
        this.log.warn(`stream publish failed, retry next run: ${String(e)}`);
        return total;
      }
      await this.prisma.domainEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { published_at: new Date() },
      });
      total += rows.length;
      if (rows.length < RELAY_BATCH) return total;
    }
  }

  /** Removes published events past the retention, in small batches. */
  async prune(now: Date): Promise<number> {
    const days = (await this.settings?.number('events.retention_days')) ?? 30;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    let total = 0;
    for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
      const old = await this.prisma.domainEvent.findMany({
        where: { occurred_at: { lt: cutoff }, published_at: { not: null } },
        select: { id: true },
        take: PRUNE_BATCH,
      });
      if (old.length === 0) break;
      const r = await this.prisma.domainEvent.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
      total += r.count;
      if (old.length < PRUNE_BATCH) break;
    }
    return total;
  }
}
