import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import { SubscriptionSyncService } from '../billing/subscription-sync.service';
import { CaseLifecycleService } from '../cases/lifecycle/case-lifecycle.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  DELETED_FIRST_NAME,
  DELETED_LAST_NAME,
  DELETED_MESSAGE_BODY,
  DELETION_GRACE_DAYS,
} from './privacy.constants';

export interface AnonymizationResult {
  anonymized: string[];
  failed: { userId: string; error: string }[];
}

/** Same key SessionRevocationService uses for the access-token blacklist. */
const blacklistKey = (chainId: string) => `authbl:${chainId}`;
const BLACKLIST_TTL_SEC = 15 * 60;
const BATCH = 100;

/**
 * docs/06 §5.1 (stage 6.9): after the 14-day grace period the account is
 * anonymized. Side effects with an external party run first and are
 * idempotent (Stripe cancel, S3 delete); then ONE transaction rewrites
 * the user's entities; `case_journal`, `contact_disclosures`,
 * `auth_events`, `user_consents` and `audit_log` are never touched (5-year
 * retention, they point at the pseudonymized user row).
 */
@Injectable()
export class AccountAnonymizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AccountAnonymizationService.name);
  }

  /** Daily job: every `deletion_pending` user past the grace period. */
  async anonymizeDue(now: Date = new Date()): Promise<AnonymizationResult> {
    const before = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
    const result: AnonymizationResult = { anonymized: [], failed: [] };
    for (;;) {
      const due = await this.prisma.user.findMany({
        where: {
          status: 'deletion_pending',
          deletion_requested_at: { lt: before },
          anonymized_at: null,
          id: { notIn: result.failed.map((f) => f.userId) },
        },
        select: { id: true },
        orderBy: { deletion_requested_at: 'asc' },
        take: BATCH,
      });
      if (due.length === 0) break;
      for (const { id } of due) {
        try {
          await this.anonymize(id, now);
          result.anonymized.push(id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            { userId: id, err: message },
            'anonymization failed',
          );
          result.failed.push({ userId: id, error: message });
        }
      }
      if (due.length < BATCH) break;
    }
    return result;
  }

  /** Anonymizes one user (idempotent: a second run is a no-op). */
  async anonymize(userId: string, now: Date = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        anonymized_at: true,
        avatar_file_id: true,
        subscription: {
          select: { id: true, status: true, stripe_subscription_id: true },
        },
      },
    });
    if (!user || user.anonymized_at) return false;

    // 1. Stripe: cancel immediately (§5.1); payments stay as finance rows.
    const sub = user.subscription;
    if (
      sub?.stripe_subscription_id &&
      !['canceled', 'expired'].includes(sub.status)
    ) {
      const remote = await this.payments.cancelNow(sub.stripe_subscription_id);
      await this.sync.apply(remote);
    }

    // 2. Files: avatar + verification documents out of S3 (idempotent).
    const files = await this.prisma.file.findMany({
      where: {
        owner_user_id: userId,
        deleted_at: null,
        purpose: {
          in: ['avatar', 'verification_document', 'verification_selfie'],
        },
      },
      select: { id: true, s3_bucket: true, s3_key: true },
    });
    if (files.length > 0 && this.storage.configured) {
      const byBucket = new Map<string, string[]>();
      for (const f of files) {
        byBucket.set(f.s3_bucket, [
          ...(byBucket.get(f.s3_bucket) ?? []),
          f.s3_key,
        ]);
      }
      for (const [bucket, keys] of byBucket) {
        await this.storage.remove(bucket, keys);
      }
    }

    // 3. Cases still in work are closed with a journal event and the
    // counterpart is notified (one transaction per case, before the
    // identity is scrubbed so the journal rows keep their actor ids).
    await this.lifecycle.closeCasesOfDeletedUser(userId, now);
    if (user.role === 'client') {
      await this.lifecycle.archiveOpenCasesOfClient(userId, now);
    }

    // 4. One transaction over the user's entities.
    const chains = await withTxRetry(this.prisma, async (tx) => {
      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { anonymized_at: true },
      });
      if (!fresh || fresh.anonymized_at) return [] as string[];

      await tx.user.update({
        where: { id: userId },
        data: {
          first_name: DELETED_FIRST_NAME,
          last_name: DELETED_LAST_NAME,
          email: null,
          email_verified_at: null,
          phone_e164: null,
          phone_verified_at: null,
          avatar_file_id: null,
          status: 'deleted',
          anonymized_at: now,
        },
      });
      await tx.userIdentifier.deleteMany({ where: { user_id: userId } });
      await tx.pushToken.deleteMany({ where: { user_id: userId } });
      const active = await tx.session.findMany({
        where: { user_id: userId, revoked_at: null },
        select: { session_chain_id: true },
        distinct: ['session_chain_id'],
      });
      await tx.session.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now, revoked_reason: 'account_deletion' },
      });
      if (files.length > 0) {
        await tx.file.updateMany({
          where: { id: { in: files.map((f) => f.id) } },
          data: { deleted_at: now },
        });
      }

      if (user.role === 'attorney') {
        const profile = await tx.attorneyProfile.findUnique({
          where: { user_id: userId },
          select: { user_id: true },
        });
        if (profile) {
          const handle = `deleted_${userId.replace(/-/g, '').slice(0, 8)}`;
          await tx.attorneyProfile.update({
            where: { user_id: userId },
            data: {
              username: handle,
              username_lower: handle,
              bio: null,
              firm_name: null,
              // Hidden from search/feeds and out of every gate.
              verification_status: 'suspended',
            },
          });
        }
        await tx.bid.updateMany({
          where: { attorney_id: userId, status: 'active' },
          data: { status: 'withdrawn' },
        });
        await tx.post.updateMany({
          where: { author_id: userId, deleted_at: null },
          data: { status: 'removed', deleted_at: now },
        });
      }
      // Comments keep their rows: the author renders as "Deleted User"
      // through the scrubbed user row (§5.1).
      await tx.message.updateMany({
        where: { sender_id: userId },
        data: {
          body_original: DELETED_MESSAGE_BODY,
          body_display: DELETED_MESSAGE_BODY,
          contact_masked: false,
        },
      });
      return active.map((s) => s.session_chain_id);
    });

    // Access tokens of the revoked chains die within their 15 minutes.
    if (chains.length > 0) {
      await Promise.all(
        chains.map((id) =>
          this.redis.set(blacklistKey(id), '1', 'EX', BLACKLIST_TTL_SEC),
        ),
      );
    }
    await this.access.invalidate(userId);
    this.logger.info({ userId, role: user.role }, 'account anonymized');
    return true;
  }
}

export type AnonymizationTx = Prisma.TransactionClient;
