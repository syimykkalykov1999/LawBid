import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventRecord, DomainEventType } from './domain-event.types';

export interface DomainEventConsumer {
  /** Unique, stable name, e.g. `ops.daily-counter` (used in logs / admin). */
  readonly name: string;
  /** Event types handled, or '*' for all. */
  readonly types: readonly DomainEventType[] | '*';
  /**
   * Bookkeeping of the pipeline itself (the daily counter): it does not
   * make recording worthwhile, so `events.sink = auto` stays off with only
   * internal consumers (perf review 2026-10-26, R-41).
   */
  readonly internal?: boolean;
  handle(event: DomainEventRecord): Promise<void> | void;
}

/**
 * Consumers registered by name. In-process, after the commit; a failing
 * consumer is logged and never affects the others or the request. The
 * durable copy of every event is the `domain_events` table (and the stream).
 */
@Injectable()
export class DomainEventConsumers {
  private readonly log = new Logger(DomainEventConsumers.name);
  private readonly byName = new Map<string, DomainEventConsumer>();

  register(consumer: DomainEventConsumer): void {
    if (this.byName.has(consumer.name)) {
      throw new Error(`event consumer already registered: ${consumer.name}`);
    }
    this.byName.set(consumer.name, consumer);
  }

  /** True when someone outside the pipeline consumes events (Auto = on). */
  hasBusinessConsumers(): boolean {
    for (const c of this.byName.values()) if (!c.internal) return true;
    return false;
  }

  names(): string[] {
    return [...this.byName.keys()].sort();
  }

  async dispatch(event: DomainEventRecord): Promise<void> {
    for (const c of this.byName.values()) {
      if (c.types !== '*' && !c.types.includes(event.type)) continue;
      try {
        await c.handle(event);
      } catch (e) {
        this.log.warn(
          `consumer ${c.name} failed on ${event.type}: ${String(e)}`,
        );
      }
    }
  }
}
