import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CounterAggregator } from '../../modules/counters/counter-aggregator.service';

/** Rows per night per profile table in the drift sweep, by mode. */
export function driftSweepCap(mode: string, batch: number): number {
  if (mode === 'off') return 0;
  if (mode === 'on') return batch * 10;
  return batch; // auto (default)
}

/** docs/05 stage 5.1 acceptance: counters "сверяются ночной джобой".
 * Owner 2026-10-26: plus a drift sweep that fixes profile counters that
 * were wrong before (setting `counters.drift_sweep`: off / on / auto). */
@Injectable()
export class CountersReconcileJob {
  constructor(
    private readonly counters: CounterAggregator,
    private readonly settings: AppSettingsService,
  ) {}

  async run(): Promise<{
    flushed: number;
    reconciled: number;
    swept?: number;
    sweptFixed?: number;
  }> {
    const flushed = (await this.counters.flush()).rows;
    const reconciled = (await this.counters.reconcile()).rows;
    const mode = await this.settings.string('counters.drift_sweep');
    const cap = driftSweepCap(
      mode,
      await this.settings.number('counters.drift_sweep_batch'),
    );
    if (cap === 0) return { flushed, reconciled };
    const sweep = await this.counters.driftSweep(cap);
    return {
      flushed,
      reconciled,
      swept: sweep.scanned,
      sweptFixed: sweep.fixed,
    };
  }
}
