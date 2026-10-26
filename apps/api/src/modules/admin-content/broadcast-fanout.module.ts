import { type DynamicModule, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  BROADCAST_OPTIONS,
  BroadcastFanoutRunner,
  type BroadcastFanoutOptions,
} from './broadcast-fanout.runner';

/** Audit 2026-10-02: the `admin-broadcast` queue — `api` mode queues (and
 * processes while JOBS_ENABLED), `worker` mode always processes. */
@Module({})
export class BroadcastFanoutModule {
  static register(options: BroadcastFanoutOptions): DynamicModule {
    return {
      module: BroadcastFanoutModule,
      imports: [NotificationsModule],
      providers: [
        { provide: BROADCAST_OPTIONS, useValue: options },
        BroadcastFanoutRunner,
      ],
      exports: [BroadcastFanoutRunner],
    };
  }
}
