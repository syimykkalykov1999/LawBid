import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  LedgerReconcileService,
  type LedgerReconcileResult,
} from '../../modules/ledger/ledger.public';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withJobLock } from './job-lock';

/**
 * Day-one foundations: `ledger.reconcile`, nightly. Balance checks, coverage
 * of paid rows, and the comparison with Stripe's balance transactions; a
 * mismatch logs `alert: ledger_mismatch`. One runner at a time.
 */
@Injectable()
export class LedgerReconcileJob {
  constructor(
    private readonly reconcile: LedgerReconcileService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  run(): Promise<LedgerReconcileResult | null> {
    return withJobLock(this.redis, 'ledger.reconcile', 10 * 60_000, () =>
      this.reconcile.run(),
    );
  }
}
