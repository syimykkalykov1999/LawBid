import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { SubscriptionSyncService } from '../billing/subscription-sync.service';
import { CaseLifecycleService } from '../cases/lifecycle/case-lifecycle.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { CaseJournalService } from '../journal/case-journal.service';
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
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly counters?: CounterAggregator,
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

  /** Own messages → `[deleted]` (§5.1), 5 000 rows per statement so the
   * largest table is never locked for long; idempotent (already scrubbed
   * rows are skipped). */
  private async scrubMessages(userId: string): Promise<void> {
    for (;;) {
      const n = await this.prisma.$executeRaw`
        UPDATE messages
        SET body_original = ${DELETED_MESSAGE_BODY},
            body_display = ${DELETED_MESSAGE_BODY},
            contact_masked = false
        WHERE sender_id = ${userId}::UUID
          AND body_display <> ${DELETED_MESSAGE_BODY}
        LIMIT 5000`;
      if (n < 5000) break;
    }
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
      // Idempotent on retry (load review): a subscription the provider
      // already shows as canceled is only synced, never canceled again.
      const current = await this.payments.retrieveSubscription(
        sub.stripe_subscription_id,
      );
      const remote =
        current && current.status === 'canceled'
          ? current
          : await this.payments.cancelNow(sub.stripe_subscription_id);
      await this.sync.apply(remote);
    }

    // 2. Files: avatar, verification documents and voice notes out of S3
    // (idempotent).
    const files = await this.prisma.file.findMany({
      where: {
        owner_user_id: userId,
        deleted_at: null,
        purpose: {
          // OQ-040: voice notes are the sender's messages — gone too.
          in: [
            'avatar',
            'verification_document',
            'verification_selfie',
            'chat_voice',
            // OQ-047: files the user sent in chats.
            'chat_attachment',
          ],
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
    let follows: {
      follower_id: string;
      followee_id: string;
      follower: { role: string | null };
      followee: { role: string | null };
    }[] = [];
    let postsRemoved = 0;
    const chains = await withTxRetry(this.prisma, async (tx) => {
      follows = [];
      postsRemoved = 0;
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
        // docs/04 §14: through the state machine, one journal row per bid.
        const withdrawn = await this.bidMachine.applyToActive(
          tx,
          { attorneyId: userId },
          'system_withdraw',
        );
        const owners = await tx.case.findMany({
          where: { id: { in: withdrawn.map((r) => r.case_id) } },
          select: { id: true, client_id: true },
        });
        const clientOf = new Map(owners.map((c) => [c.id, c.client_id]));
        for (const r of withdrawn) {
          const clientId = clientOf.get(r.case_id);
          if (!clientId) continue;
          await this.journal.append(tx, {
            caseId: r.case_id,
            clientId,
            actor: { userId: null, role: null },
            attorneyId: userId,
            event: r.plan.event,
            payload: { bidId: r.id, reason: 'account_deleted' },
          });
        }
      }
      // Audit 2026-10-01: every role's posts go (clients post too), and
      // the follows either way — the other people's followers / following
      // counters drop with them (the lists already hid the account).
      const published = await tx.post.count({
        where: { author_id: userId, deleted_at: null, status: 'published' },
      });
      await tx.post.updateMany({
        where: { author_id: userId, deleted_at: null },
        data: { status: 'removed', deleted_at: now },
      });
      postsRemoved = published;
      const between = {
        OR: [{ follower_id: userId }, { followee_id: userId }],
      };
      follows = await tx.follow.findMany({
        where: between,
        select: {
          follower_id: true,
          followee_id: true,
          follower: { select: { role: true } },
          followee: { select: { role: true } },
        },
      });
      await tx.follow.deleteMany({ where: between });
      // Comments keep their rows: the author renders as "Deleted User"
      // through the scrubbed user row (§5.1). Messages are scrubbed in
      // batches after this transaction (largest table, load review).
      // Verification provider payloads may hold the person's name (§5.1
      // "ID-документы удаляются"): emptied, the row itself stays.
      await tx.verificationCheck.updateMany({
        where: { request: { attorney_id: userId } },
        data: { details: {} },
      });
      return active.map((s) => s.session_chain_id);
    });

    for (const f of follows) {
      if (f.follower_id === userId) {
        await this.counters?.bump(
          profileEntity(f.followee.role),
          f.followee_id,
          'followers_count',
          -1,
        );
      } else {
        await this.counters?.bump(
          profileEntity(f.follower.role),
          f.follower_id,
          'following_count',
          -1,
        );
      }
    }
    if (postsRemoved > 0) {
      await this.counters?.bump(
        profileEntity(user.role),
        userId,
        'posts_count',
        -postsRemoved,
      );
    }
    await this.scrubMessages(userId);
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
