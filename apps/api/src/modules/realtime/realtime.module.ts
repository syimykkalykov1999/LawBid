import { Global, Module } from '@nestjs/common';
import { RealtimeEventLog } from './realtime-event-log';
import { RealtimePublisher } from './realtime-publisher.service';

/** docs/05 §8.5: the publisher, for the API and the worker alike. The
 * socket server itself is RealtimeGatewayModule (API process only). */
@Global()
@Module({
  providers: [RealtimePublisher, RealtimeEventLog],
  exports: [RealtimePublisher, RealtimeEventLog],
})
export class RealtimeModule {}
