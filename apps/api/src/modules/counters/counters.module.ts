import { Global, Module } from '@nestjs/common';
import { CounterAggregator } from './counter-aggregator.service';

/** docs/05 stage 5.1 counters aggregator; global so posts, comments and
 * follows share one flusher per process. */
@Global()
@Module({
  providers: [CounterAggregator],
  exports: [CounterAggregator],
})
export class CountersModule {}
