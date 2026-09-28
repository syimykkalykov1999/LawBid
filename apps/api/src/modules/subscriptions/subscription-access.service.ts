import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Pick<Prisma.TransactionClient, 'attorneyProfile'>;

/**
 * The single gate for "active subscription or trial" (.cursorrules:
 * "Доступ по подписке только через SubscriptionAccessService.isActive()").
 * docs/04 §2: bidding, messaging a client and seeing client contacts need
 * it; §7 re-checks it inside the accept transaction (pass `db` = tx).
 *
 * TODO(docs/06_PRODUCTION.md stage 6.7): stub until Stripe subscriptions
 * land — every verified attorney counts as active. Replace the body with
 * the subscriptions table check (trialing/active, period not ended);
 * callers must not change.
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(attorneyId: string, db: Db = this.prisma): Promise<boolean> {
    const profile = await db.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { verification_status: true },
    });
    return profile?.verification_status === 'verified';
  }
}
