import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { SessionRevocationService } from '../../auth/services/session-revocation.service';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from '../../auth/services/auth-event.service';
import type { RequestMeta } from '../../auth/services/session.service';

/**
 * DELETE /users/me (docs/01_FOUNDATION_AUTH.md §10.7). This stage ONLY
 * starts the 14-day grace period: status -> deletion_pending,
 * deletion_requested_at set, every session revoked immediately (a
 * deletion request should log the user out of every device, same as an
 * admin block). The full anonymization pipeline described in §10.7
 * (scrub PII, delete S3 documents, close active cases, reject bids,
 * cancel the attorney's Stripe subscription, retain a 5-year
 * pseudonymized case-journal record) is explicitly OUT of scope here —
 * it needs the cases/bids/files/subscriptions tables that don't exist
 * until files 2-5 are built, and a scheduled job to act on
 * deletion_requested_at once the 14 days elapse. Login-during-grace-
 * period auto-cancellation is implemented at the login sites instead
 * (AuthService.verifyOtp / SocialAuthService.login), per §10.7 "можно
 * отменить входом" — not duplicated here.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocation: SessionRevocationService,
    private readonly authEvents: AuthEventService,
  ) {}

  async requestDeletion(userId: string, meta: RequestMeta): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'deletion_pending', deletion_requested_at: new Date() },
      });
      await this.authEvents.record(
        {
          userId,
          eventType: AUTH_EVENT_TYPES.ACCOUNT_DELETION_REQUESTED,
          success: true,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    // Outside the transaction on purpose, same trade-off documented on
    // SessionRevocationService: worst case a Redis hiccup leaves an
    // already-short-lived access token valid a little longer, not a
    // half-committed deletion request.
    await this.revocation.revokeAllChainsForUser(userId, 'account_deletion');
  }
}
