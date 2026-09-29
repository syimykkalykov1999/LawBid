import { Injectable } from '@nestjs/common';
import { CounterAggregator } from '../../modules/counters/counter-aggregator.service';

/** docs/05 stage 5.1 acceptance: counters "сверяются ночной джобой". */
@Injectable()
export class CountersReconcileJob {
  constructor(private readonly counters: CounterAggregator) {}

  async run(): Promise<{ flushed: number; reconciled: number }> {
    const flushed = (await this.counters.flush()).rows;
    const reconciled = (await this.counters.reconcile()).rows;
    return { flushed, reconciled };
  }
}
