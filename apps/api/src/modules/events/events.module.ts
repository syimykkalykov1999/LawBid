import { Global, Inject, Module, OnModuleInit, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { DomainEventConsumers } from './domain-event-consumers';
import { DomainEvents } from './domain-events.service';
import { dayCounterKey, EventsMaintenance } from './events.maintenance';
import {
  EventStreamPublisher,
  KinesisEventStreamPublisher,
} from './event-stream.publisher';

/**
 * Events pipeline (N-2). Global so any service can take `@Optional()
 * DomainEvents` without importing a module (like CrossFamilyOutbox).
 */
@Global()
@Module({
  providers: [
    DomainEventConsumers,
    DomainEvents,
    EventsMaintenance,
    { provide: EventStreamPublisher, useClass: KinesisEventStreamPublisher },
  ],
  exports: [DomainEvents, DomainEventConsumers, EventsMaintenance],
})
export class EventsModule implements OnModuleInit {
  constructor(
    private readonly consumers: DomainEventConsumers,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    // The Auto signal: events per day, counted in Redis (no heavy query).
    this.consumers.register({
      name: 'ops.daily-counter',
      types: '*',
      internal: true,
      handle: async () => {
        if (!this.redis) return;
        const key = dayCounterKey(new Date());
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.expire(key, 3 * 86_400);
      },
    });
  }
}
