import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CDN_INVALIDATOR,
  type CdnInvalidator,
} from '../../common/cdn/cdn-invalidator';
import { heldIds, isHeld } from '../../common/privacy/legal-hold';
import type {
  AccountEraser,
  EraseOutcome,
} from '../../common/privacy/privacy.ports';
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
import { derivedKeys } from '../files/files.policy';
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
import { DeletionStepsService } from './deletion-steps.service';
import {
  ErasureLedgerService,
  type ErasureReason,
} from './erasure-ledger.service';
import { VendorDeletionService } from './vendor-deletion.service';
import { PersonalDataErasureService } from './personal-data-erasure.service';
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

/** Prefix of a bar number replaced by its hash on anonymization. */
export const HASHED_BAR_PREFIX = 'h:';

/** One-way stand-in for a bar number: `h:` + sha256("<STATE>:<number>"). */
export function hashedBarNumber(state: string, barNumber: string): string {
  const digest = createHash('sha256')
    .update(`${state.toUpperCase()}:${barNumber.trim().toUpperCase()}`)
    .digest('hex');
  return `${HASHED_BAR_PREFIX}${digest}`;
}

/**
 * docs/06 §5.1 (stage 6.9): after the 14-day grace period the account is
 * anonymized. Side effects with an external party run first and are
 * idempotent (Stripe cancel, S3 delete); then ONE transaction rewrites
 * the user's entities; `case_journal`, `contact_disclosures`,
 * `auth_events`, `user_consents` and `audit_log` are never touched (5-year
 * retention, they point at the pseudonymized user row).
 */
@Injectable()
export class AccountAnonymizationService implements AccountEraser {
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
    // Privacy round 13: erasure ledger (S13-1), proof per step (S13-10/11),
    // vendor deletes (S13-11) and the CDN seam (S13-4/10).
    @Optional() private readonly ledger?: ErasureLedgerService,
    @Optional() private readonly steps?: DeletionStepsService,
    @Optional() private readonly vendors?: VendorDeletionService,
    @Optional()
    @Inject(CDN_INVALIDATOR)
    private readonly cdn?: CdnInvalidator,
    // Owner 2026-10-29: the personal-data registry walk (every database,
    // every external store, certificate).
    @Optional() private readonly erasure?: PersonalDataErasureService,
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
    const ids = due.map((u) => u.id);
    // Owner 2026-10-29: accounts already anonymized whose registry walk
    // never finished (a store failed, a worker died) are resumed too.
    if (this.erasure && ids.length < take) {
      const open = await this.erasure.incompleteUserIds(
        [...skip, ...ids],
        take - ids.length,
        now,
      );
      ids.push(...open);
    }
    return ids;
  }

  /** Owner 2026-10-22: GDPR Art. 17(3)(e) — a legal hold on the person
   * (an official request in progress) keeps the account until released;
   * the daily job tries again. Round 13 (S13-6): a hold on one of the
   * person's own cases holds the account too (the case is evidence). */
  async isOnLegalHold(
    userId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (await isHeld(this.prisma, 'user', userId, now)) return true;
    const rows = await this.prisma.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM legal_holds h
      JOIN cases c ON c.id = h.target_id
      WHERE h.target_type = 'case' AND c.client_id = ${userId}::UUID
        AND h.released_at IS NULL
        AND (h.expires_at IS NULL OR h.expires_at > ${now})
      LIMIT 1`;
    return rows.length > 0;
  }

  /** S13-7: the admin confirmed the person is a minor — no grace period.
   * The fraud hashes keep blocking the same phone / e-mail / device (an
   * erased minor cannot simply come back); a legal hold still wins. */
  async eraseNow(
    userId: string,
    reason: 'minor_confirmed',
  ): Promise<EraseOutcome> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { anonymized_at: true },
    });
    if (!found) return 'missing';
    if (found.anonymized_at) return 'already';
    if (await this.isOnLegalHold(userId)) return 'held';
    await this.fraud?.freezeBanned(userId);
    const done = await this.anonymize(userId, new Date(), reason);
    return done ? 'erased' : 'held';
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
   * rows are skipped). Round 13 (S13-3): the edit history, the file name,
   * the assistant's name and the forwarded-from name go with them. */
  private async scrubMessages(userId: string): Promise<void> {
    // BUG-1 (package N-12b): the person's words leave the search index
    // first (by message id, 5 000 rows per statement).
    for (;;) {
      const n = await this.prisma.$executeRaw`
        DELETE FROM message_search_tokens
        WHERE ctid IN (
          SELECT st.ctid FROM message_search_tokens st
          JOIN messages m ON m.id = st.message_id
          WHERE m.sender_id = ${userId}::UUID
          LIMIT 5000)`;
      if (n < 5000) break;
    }
    for (;;) {
      const n = await this.prisma.$executeRaw`
        UPDATE message_edits
        SET body_original = ''
        WHERE ctid IN (
          SELECT e.ctid FROM message_edits e
          JOIN messages m ON m.id = e.message_id
          WHERE m.sender_id = ${userId}::UUID AND e.body_original <> ''
          LIMIT 5000)`;
      if (n < 5000) break;
    }
    for (;;) {
      const n = await this.prisma.$executeRaw`
        UPDATE messages
        SET body_original = ${DELETED_MESSAGE_BODY},
            body_display = ${DELETED_MESSAGE_BODY},
            contact_masked = false,
            file_name = NULL,
            sent_by_name = NULL,
            forwarded_from_name = NULL
        WHERE ctid IN (
          SELECT ctid FROM messages
          WHERE sender_id = ${userId}::UUID
            AND (body_display <> ${DELETED_MESSAGE_BODY}
              OR file_name IS NOT NULL
              OR sent_by_name IS NOT NULL
              OR forwarded_from_name IS NOT NULL)
          LIMIT 5000)`;
      if (n < 5000) break;
    }
  }

  /** S13-2: the phone-book upload (hashes of THIRD parties' numbers) and
   * its settings go with the account — chunked, a book can hold 10k+ rows.
   * Idempotent. */
  private async deleteContactBook(userId: string): Promise<void> {
    for (;;) {
      const n = await this.prisma.$executeRaw`
        DELETE FROM contact_book_hashes
        WHERE ctid IN (
          SELECT ctid FROM contact_book_hashes
          WHERE owner_id = ${userId}::UUID
          LIMIT 5000)`;
      if (n < 5000) break;
    }
    await this.prisma.contactSyncSetting.deleteMany({
      where: { user_id: userId },
    });
  }

  /** Released avatar / photo objects (and their size variants) leave the
   * CDN edge too. The seam is optional: nothing happens until bound. */
  private async invalidateCdn(files: { s3_key: string }[]): Promise<void> {
    if (!this.cdn || files.length === 0) return;
    try {
      await this.cdn.enqueue(
        files.flatMap((f) => [f.s3_key, ...derivedKeys(f.s3_key)]),
        'account_deleted',
      );
    } catch (err) {
      this.logger.warn({ err }, 'CDN invalidation was not queued');
    }
  }

  /** Owner 2026-10-20: the same for group chats — own group messages
   * become `[deleted]`, the person leaves every group. */
  private async scrubGroupMessages(userId: string): Promise<void> {
    for (;;) {
      const n = await this.prisma.$executeRaw`
        UPDATE chat_group_messages
        SET body = ${DELETED_MESSAGE_BODY}, mention_ids = '{}',
            file_name = NULL, forwarded_from_name = NULL
        WHERE ctid IN (
          SELECT ctid FROM chat_group_messages
          WHERE sender_id = ${userId}::UUID
            AND type::TEXT IN ('text', 'attachment')
            AND (body <> ${DELETED_MESSAGE_BODY}
              OR file_name IS NOT NULL
              OR forwarded_from_name IS NOT NULL)
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
  anonymize(
    userId: string,
    now: Date = new Date(),
    reason: ErasureReason = 'deletion_request',
  ): Promise<boolean> {
    return shardContext.runForUser(userId, () =>
      this.anonymizeInShard(userId, now, reason),
    );
  }

  private async anonymizeInShard(
    userId: string,
    now: Date,
    reason: ErasureReason,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        anonymized_at: true,
        avatar_file_id: true,
        phone_e164: true,
        subscription: {
          select: { id: true, status: true, stripe_subscription_id: true },
        },
      },
    });
    if (!user) return false;
    if (user.anonymized_at) {
      // Resume: the account is scrubbed, the registry walk may be open.
      if (this.erasure && (await this.erasure.hasOpenRun(userId))) {
        await this.completeErasure(userId, now);
      }
      return false;
    }
    if (await this.isOnLegalHold(userId, now)) {
      this.logger.info({ userId }, 'anonymization deferred: legal hold');
      await this.erasure?.markBlocked(userId, now);
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
    // Round 13 (S13-11): the result per vendor is recorded; a Stripe error
    // still stops here (the job retries) — the step shows `failed` meanwhile.
    if (this.steps) {
      const stripe = await this.steps.run(userId, 'stripe', async () => {
        await this.deleteStripeCustomers(userId);
        return {
          status: 'ok',
          detail: 'customers deleted; Stripe keeps invoices and payments',
        };
      });
      if (stripe === 'failed')
        throw new Error('stripe customer deletion failed');
    } else {
      await this.deleteStripeCustomers(userId);
    }
    // Twilio: the one-time-code SMS log of the number, while it is still known.
    const { vendors, steps } = this;
    if (vendors && steps) {
      await steps.run(userId, 'twilio', () =>
        vendors.purgeTwilio(user.phone_e164),
      );
    }

    // 2. Files: every purpose with the person's content out of S3
    // (privacy.constants ANONYMIZED_FILE_PURPOSES; idempotent). Owner
    // 2026-10-22 (audit #4 §5): posts, reels, stories, cases, reviews and
    // support files too — not only avatar, verification and chat files.
    // Stories go first (their rows point at post_image files).
    await this.prisma.story.deleteMany({ where: { author_id: userId } });
    await this.prisma.storyHidden.deleteMany({ where: { owner_id: userId } });
    await this.prisma.storySetting.deleteMany({ where: { user_id: userId } });
    if (this.steps) {
      await this.steps.run(userId, 'bunny', async () => {
        await this.deleteVideos(userId);
        return { status: 'ok', detail: 'videos marked deleted and purged' };
      });
    } else {
      await this.deleteVideos(userId);
    }
    const ownFiles = await this.prisma.file.findMany({
      where: {
        owner_user_id: userId,
        deleted_at: null,
        purpose: { in: [...ANONYMIZED_FILE_PURPOSES] },
      },
      select: { id: true, s3_bucket: true, s3_key: true },
    });
    // Round 13 (S13-6): a file under a legal hold is evidence — it stays.
    const heldFiles = await heldIds(
      this.prisma,
      'file',
      ownFiles.map((f) => f.id),
      now,
    );
    const files = ownFiles.filter((f) => !heldFiles.has(f.id));
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
    // Round 13 (S13-10): the released objects (avatar, photos) leave the CDN.
    await this.invalidateCdn(files.filter((f) => !evidence.has(f.id)));

    // Round 13 (S13-2/S13-3): the long, idempotent scrubs run BEFORE the
    // transaction that sets `anonymized_at`, so a crash in between is
    // retried by the next run instead of being skipped for ever.
    await this.deleteContactBook(userId);
    await this.scrubMessages(userId);
    await this.scrubGroupMessages(userId);

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
      // Round 13 (S13-9): the rows stay revoked (a refresh with an old token
      // is refused as "session revoked"), but they no longer say where the
      // person was: network address, browser, device name and id go.
      await tx.session.updateMany({
        where: { user_id: userId },
        data: {
          ip: null,
          user_agent: null,
          device_name: null,
          device_id: null,
        },
      });
      // Free text the person wrote about themselves / their matter.
      await tx.clientProfile.updateMany({
        where: { user_id: userId, preferred_contact_note: { not: null } },
        data: { preferred_contact_note: null },
      });
      await tx.case.updateMany({
        where: { client_id: userId, private_details: { not: null } },
        data: { private_details: null },
      });
      // Round 13 (S13-1): the erasure ledger row commits with the erasure.
      await this.ledger?.record(userId, now, reason, tx);
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
        // Round 13 (S13-9): the bar number identifies the person. It is
        // replaced by a one-way hash (still unique per state, so the
        // registry de-duplication keeps working: hash the incoming number
        // the same way); the license can no longer be used or re-checked.
        const licenses = await tx.attorneyLicense.findMany({
          where: { attorney_id: userId },
          select: { id: true, state_code: true, bar_number: true },
        });
        for (const l of licenses) {
          if (l.bar_number.startsWith(HASHED_BAR_PREFIX)) continue;
          await tx.attorneyLicense.update({
            where: { id: l.id },
            data: {
              bar_number: hashedBarNumber(l.state_code, l.bar_number),
              license_status: 'suspended',
              auto_check_result: Prisma.DbNull,
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
        where: {
          author_id: userId,
          deleted_at: null,
          archived_at: null,
          status: 'published',
        },
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
    await this.afterErasure(userId, reason);
    await this.completeErasure(userId, now);
    this.logger.info({ userId, role: user.role }, 'account anonymized');
    return true;
  }

  /** Round 13: what follows a committed erasure — the object copy of the
   * ledger row (S13-1), the documented-retention vendor rows (S13-11), the
   * search-index check left for the nightly reconcile (S13-10) and the
   * completion proof row. Never throws: the erasure itself is done. */
  private async afterErasure(
    userId: string,
    reason: ErasureReason,
  ): Promise<void> {
    try {
      const synced = (await this.ledger?.syncToStore(userId)) ?? false;
      if (this.steps) {
        await this.steps.record(
          userId,
          'ledger',
          synced ? 'ok' : 'pending',
          synced
            ? 'table + bucket object'
            : 'table only; privacy.reconcile copies it',
        );
        await this.vendors?.recordRetained(userId);
        // Resolved by the nightly privacy.reconcile (engine delete / skipped).
        await this.steps.record(
          userId,
          'search',
          'pending',
          'checked by the nightly reconcile',
        );
        await this.steps.record(userId, 'completion', 'ok', `reason=${reason}`);
      }
    } catch (err) {
      this.logger.warn({ err, userId }, 'erasure follow-up steps failed');
    }
  }

  /** Owner 2026-10-29: the registry walk; throws when a store failed so the
   * job retries (only the failed stores run again). */
  private async completeErasure(userId: string, now: Date): Promise<void> {
    if (!this.erasure) return;
    const outcome = await this.erasure.run(userId, now);
    if (!outcome.completed) {
      throw new Error(
        `personal data erasure incomplete: ${outcome.failed.join(', ')}`,
      );
    }
  }
}
