import { Global, Module } from '@nestjs/common';
import { RealtimePublisher } from './realtime-publisher.service';

/** docs/05 §8.5: the publisher, for the API and the worker alike. The
 * socket server itself is RealtimeGatewayModule (API process only). */
@Global()
@Module({
  providers: [RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
