import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CasePaymentsService } from '../../modules/case-payments/case-payments.service';
import { DisputeService } from '../../modules/stripe-ops/dispute.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withJobLock } from './job-lock';

/**
 * Stripe robustness 2026-10-27:
 *  - `stripe-ops.sweep` (nightly): compares recent case payments with
 *    Stripe (repairs what a lost webhook left behind, queues drift) and
 *    checks the dispute rate against the card-network thresholds.
 *  - `stripe-ops.dispute-reminders` (hourly): deadline reminders to staff
 *    and the attorney.
 * One runner at a time.
 */
@Injectable()
export class StripeOpsJob {
  constructor(
    private readonly casePayments: CasePaymentsService,
    private readonly disputes: DisputeService,
    private readonly settings: AppSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  sweep(): Promise<unknown> {
    return withJobLock(
      this.redis,
      'stripe-ops.sweep',
      20 * 60_000,
      async () => {
        const days = await this.settings.number(
          'stripe_ops.sweep_lookback_days',
        );
        const reconcile = await this.casePayments.reconcileWithStripe(days);
        const rate = await this.disputes.checkRate();
        return { reconcile, rate };
      },
    );
  }

  remindDisputes(): Promise<unknown> {
    return withJobLock(
      this.redis,
      'stripe-ops.dispute-reminders',
      5 * 60_000,
      () => this.disputes.remindDeadlines(),
    );
  }
}
