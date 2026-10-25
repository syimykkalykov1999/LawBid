import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClientFraudService } from '../client-fraud/client-fraud.service';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { publishSessionRevoked } from '../../redis/session-revoked';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { SubscriptionSyncService } from '../billing/subscription-sync.service';
import { CaseLifecycleService } from '../cases/lifecycle/case-lifecycle.service';
import { FileReleaseService } from '../files/storage/file-release.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { VideosService } from '../videos/videos.service';
import {
  ANONYMIZED_FILE_PURPOSES,
  DELETED_FIRST_NAME,
  DELETED_LAST_NAME,
  DELETED_MESSAGE_BODY,
  DELETION_GRACE_DAYS,
} from './privacy.constants';
import { shardContext } from '../../sharding/shard-context';
import { userDirectory } from '../../sharding/user-directory';

export interface AnonymizationResult {
  anonymized: string[];
  failed: { userId: string; error: string }[];
}

/** Same key SessionRevocationService uses for the access-token blacklist. */
const blacklistKey = (chainId: string) => `authbl:${chainId}`;
const BLACKLIST_TTL_SEC = 15 * 60;
const BATCH = 100;
/** Bunny deletions done inline per account; the rest goes to the
 * `videos.sweep` (it purges every `deleted` asset). */
const BUNNY_PURGE_INLINE = 50;

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
    private readonly release: FileReleaseService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly counters?: CounterAggregator,
    // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a blocked account deleted
    // keeps its hashes blocking.
    @Optional() private readonly fraud?: ClientFraudService,
    // Owner 2026-10-22 (audit #4 §5): reels and story videos at Bunny.
    @Optional() private readonly videos?: VideosService,
  ) {
    this.logger.setContext(AccountAnonymizationService.name);
  }

  /** Users past the grace period, oldest request first (one page). */
  async dueUserIds(
    now: Date = new Date(),
    skip: string[] = [],
    take = BATCH,
  ): Promise<string[]> {
    const before = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
    const due = await this.prisma.user.findMany({
      where: {
        status: 'deletion_pending',
        deletion_requested_at: { lt: before },
        anonymized_at: null,
        ...(skip.length > 0 ? { id: { notIn: skip } } : {}),
      },
      select: { id: true },
      orderBy: { deletion_requested_at: 'asc' },
      take,
    });
    return due.map((u) => u.id);
  }

  /** Owner 2026-10-22: GDPR Art. 17(3)(e) — a legal hold on the person
   * (an official request in progress) keeps the account until released;
   * the daily job tries again. */
  async isOnLegalHold(
    userId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const hold = await this.prisma.legalHold.findFirst({
      where: {
        target_type: 'user',
        target_id: userId,
        released_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      select: { id: true },
    });
    return hold !== null;
  }

  /** Daily job (inline fallback of AccountDeletionRunner): every
   * `deletion_pending` user past the grace period. */
  async anonymizeDue(now: Date = new Date()): Promise<AnonymizationResult> {
    const result: AnonymizationResult = { anonymized: [], failed: [] };
    const skipped: string[] = [];
    for (;;) {
      const due = await this.dueUserIds(now, [
        ...skipped,
        ...result.failed.map((f) => f.userId),
      ]);
      if (due.length === 0) break;
      for (const id of due) {
        try {
          if (await this.anonymize(id, now)) result.anonymized.push(id);
          else skipped.push(id);
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

  /**
   * Owner 2026-10-22 (audit #4 §5, Stripe "Delete a customer"): the
   * person's Stripe customers go — the platform one (subscriptions) and
   * the ones on attorneys' connected accounts (saved cards for case
   * payments). Stripe keeps their invoices and payments; our finance rows
   * stay. Idempotent: a customer already deleted is a no-op.
   */
  private async deleteStripeCustomers(userId: string): Promise<void> {
    if (!this.payments.deleteCustomer) return;
    const platform = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: userId },
      select: { stripe_customer_id: true },
    });
    if (platform) {
      await this.payments.deleteCustomer(platform.stripe_customer_id);
    }
    const connected = await this.prisma.connectedCustomer.findMany({
      where: { client_id: userId },
      select: { stripe_account_id: true, stripe_customer_id: true },
    });
    for (const c of connected) {
      await this.payments.deleteCustomer(c.stripe_customer_id, {
        stripeAccount: c.stripe_account_id,
      });
      await this.prisma.connectedCustomer.deleteMany({
        where: { client_id: userId, stripe_account_id: c.stripe_account_id },
      });
    }
  }

  /** Owner 2026-10-22 (audit #4 §5): the person's videos (reels, story and
   * channel videos) are marked deleted and removed at Bunny; what fails
   * here is retried by the `videos.sweep`. */
  private async deleteVideos(userId: string): Promise<void> {
    const assets = await this.prisma.videoAsset.findMany({
      where: { owner_user_id: userId, purged_at: null },
      select: { id: true, external_id: true, deleted_at: true },
    });
    if (assets.length === 0) return;
    const live = assets.filter((a) => a.deleted_at === null).map((a) => a.id);
    if (this.videos) {
      await this.videos.markDeleted(live);
      for (const a of assets.slice(0, BUNNY_PURGE_INLINE)) {
        await this.videos.purgeNow(a);
      }
    } else if (live.length > 0) {
      await this.prisma.videoAsset.updateMany({
        where: { id: { in: live }, deleted_at: null },
        data: { status: 'deleted', deleted_at: new Date() },
      });
    }
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
        WHERE ctid IN (
          SELECT ctid FROM messages
          WHERE sender_id = ${userId}::UUID
            AND body_display <> ${DELETED_MESSAGE_BODY}
          LIMIT 5000)`;
      if (n < 5000) break;
    }
  }

  /** Owner 2026-10-20: the same for group chats — own group messages
   * become `[deleted]`, the person leaves every group. */
  private async scrubGroupMessages(userId: string): Promise<void> {
    for (;;) {
      const n = await this.prisma.$executeRaw`
        UPDATE chat_group_messages
        SET body = ${DELETED_MESSAGE_BODY}, mention_ids = '{}'
        WHERE ctid IN (
          SELECT ctid FROM chat_group_messages
          WHERE sender_id = ${userId}::UUID
            AND type::TEXT IN ('text', 'attachment')
            AND body <> ${DELETED_MESSAGE_BODY}
          LIMIT 5000)`;
      if (n < 5000) break;
    }
    await this.prisma.chatGroupMember.updateMany({
      where: { user_id: userId, left_at: null },
      data: { left_at: new Date(), left_reason: 'left' },
    });
  }

  /** Anonymizes one user (idempotent: a second run is a no-op). Runs in the
   * user's shard: their cases, posts, follows and tokens live there, and the
   * global rows it touches are written through the tx facade (primary first). */
  anonymize(userId: string, now: Date = new Date()): Promise<boolean> {
    return shardContext.runForUser(userId, () =>
      this.anonymizeInShard(userId, now),
    );
  }

  private async anonymizeInShard(userId: string, now: Date): Promise<boolean> {
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
    if (await this.isOnLegalHold(userId, now)) {
      this.logger.info({ userId }, 'anonymization deferred: legal hold');
      return false;
    }

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
    // Owner 2026-10-22: then the Stripe customers themselves (Art. 17).
    await this.deleteStripeCustomers(userId);

    // 2. Files: every purpose with the person's content out of S3
    // (privacy.constants ANONYMIZED_FILE_PURPOSES; idempotent). Owner
    // 2026-10-22 (audit #4 §5): posts, reels, stories, cases, reviews and
    // support files too — not only avatar, verification and chat files.
    // Stories go first (their rows point at post_image files).
    await this.prisma.story.deleteMany({ where: { author_id: userId } });
    await this.prisma.storyHidden.deleteMany({ where: { owner_id: userId } });
    await this.prisma.storySetting.deleteMany({ where: { user_id: userId } });
    await this.deleteVideos(userId);
    const files = await this.prisma.file.findMany({
      where: {
        owner_user_id: userId,
        deleted_at: null,
        purpose: { in: [...ANONYMIZED_FILE_PURPOSES] },
      },
      select: { id: true, s3_bucket: true, s3_key: true },
    });
    // Owner 2026-10-22 (18 U.S.C. §2258A(h)): a picture matched as CSAM is
    // evidence — kept (never served) for the report, not released here.
    const evidence = new Set(
      (
        await this.prisma.mediaModerationCheck.findMany({
          where: {
            owner_user_id: userId,
            status: 'csam_match',
            file_id: { not: null },
          },
          select: { file_id: true },
        })
      ).map((c) => c.file_id),
    );
    // Owner 2026-10-05: objects shared with another user's identical
    // upload stay for them; everything else goes, previews included.
    await this.release.release(
      files.filter((f) => !evidence.has(f.id)).map((f) => f.id),
      'account_deleted',
      now,
    );

    // 3. Cases still in work are closed with a journal event and the
    // counterpart is notified (one transaction per case, before the
    // identity is scrubbed so the journal rows keep their actor ids).
    await this.lifecycle.closeCasesOfDeletedUser(userId, now);
    if (user.role === 'client') {
      await this.lifecycle.archiveOpenCasesOfClient(userId, now);
    }

    // 4. One transaction over the user's entities.
    let follows: { follower_id: string; followee_id: string }[] = [];
    let postsRemoved = 0;
    const chains = await withTxRetry(this.prisma, async (tx) => {
      follows = [];
      postsRemoved = 0;
      const fresh = await tx.user.findUnique({
        where: { id: userId },
        select: { anonymized_at: true },
      });
      if (!fresh || fresh.anonymized_at) return [] as string[];
      if (user.status === 'suspended')
        await this.fraud?.freezeBanned(userId, tx);

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
      // Owner 2026-10-20: bookings, hours, public questions and answers.
      await tx.consultationSettings.deleteMany({
        where: { attorney_id: userId },
      });
      const mine = await tx.consultation.findMany({
        where: {
          status: { in: ['pending', 'confirmed'] },
          OR: [{ attorney_id: userId }, { client_id: userId }],
        },
        select: { id: true },
      });
      if (mine.length > 0) {
        const ids = mine.map((c) => c.id);
        await tx.consultation.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'cancelled',
            cancelled_by_id: userId,
            cancel_reason: 'account_deleted',
          },
        });
        await tx.attorneyTask.updateMany({
          where: { consultation_id: { in: ids } },
          data: { status: 'cancelled', archived_at: now },
        });
      }
      await tx.legalQuestion.updateMany({
        where: { author_id: userId, deleted_at: null },
        data: { status: 'removed', deleted_at: now },
      });
      const answers = await tx.legalAnswer.findMany({
        where: { attorney_id: userId, deleted_at: null },
        select: { id: true, question_id: true, status: true },
      });
      for (const a of answers) {
        await tx.legalAnswer.update({
          where: { id: a.id },
          data: { status: 'removed', deleted_at: now, is_best: false },
        });
        await tx.legalQuestion.updateMany({
          where: withDeleted({ id: a.question_id }),
          data: {
            ...(a.status === 'published'
              ? { answer_count: { decrement: 1 } }
              : {}),
          },
        });
        await tx.legalQuestion.updateMany({
          where: withDeleted({ id: a.question_id, best_answer_id: a.id }),
          data: { best_answer_id: null },
        });
      }
      await tx.userIdentifier.deleteMany({ where: { user_id: userId } });
      await tx.pushToken.deleteMany({ where: { user_id: userId } });
      // Owner 2026-10-13: address-book matches, both directions.
      await tx.contactMatch.deleteMany({
        where: { OR: [{ owner_id: userId }, { matched_id: userId }] },
      });
      const active = await tx.session.findMany({
        where: { user_id: userId, revoked_at: null },
        select: { session_chain_id: true },
        distinct: ['session_chain_id'],
      });
      await tx.session.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now, revoked_reason: 'account_deletion' },
      });
      const released = files.filter((f) => !evidence.has(f.id));
      if (released.length > 0) {
        await tx.file.updateMany({
          where: { id: { in: released.map((f) => f.id) } },
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
      // Owner 2026-10-22: channel posts lose their media above — hidden too.
      await tx.channelPost.updateMany({
        where: { author_id: userId, deleted_at: null },
        data: { status: 'removed', deleted_at: now },
      });
      const between = {
        OR: [{ follower_id: userId }, { followee_id: userId }],
      };
      follows = await tx.follow.findMany({
        where: between,
        select: { follower_id: true, followee_id: true },
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

    // Shard-ready step 6: the other side's role from the user directory.
    const followRoles = await userDirectory(this.prisma).select(
      follows.flatMap((f) => [f.follower_id, f.followee_id]),
      { role: true },
    );
    for (const f of follows) {
      if (f.follower_id === userId) {
        await this.counters?.bump(
          profileEntity(followRoles.get(f.followee_id)?.role ?? null),
          f.followee_id,
          'followers_count',
          -1,
        );
      } else {
        await this.counters?.bump(
          profileEntity(followRoles.get(f.follower_id)?.role ?? null),
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
    await this.scrubGroupMessages(userId);
    // Access tokens of the revoked chains die within their 15 minutes.
    if (chains.length > 0) {
      await Promise.all(
        chains.map(async (id) => {
          await this.redis.set(blacklistKey(id), '1', 'EX', BLACKLIST_TTL_SEC);
          // Owner 2026-10-22: its live sockets close now (RealtimeGateway).
          await publishSessionRevoked(this.redis, { sessionId: id, userId });
        }),
      );
    }
    await this.access.invalidate(userId);
    this.logger.info({ userId, role: user.role }, 'account anonymized');
    return true;
  }
}
