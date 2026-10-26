import { type DynamicModule, Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  CHANNEL_FANOUT_OPTIONS,
  ChannelFanoutRunner,
  type ChannelFanoutOptions,
} from './channel-fanout.runner';

/** Owner 2026-10-22 (server load audit, finding 7): the `channel-fanout`
 * queue — `api` mode queues (and processes while JOBS_ENABLED), `worker`
 * mode always processes. */
@Module({})
export class ChannelFanoutModule {
  static register(options: ChannelFanoutOptions): DynamicModule {
    return {
      module: ChannelFanoutModule,
      imports: [BlocksModule, NotificationsModule],
      providers: [
        { provide: CHANNEL_FANOUT_OPTIONS, useValue: options },
        ChannelFanoutRunner,
      ],
      exports: [ChannelFanoutRunner],
    };
  }
}
