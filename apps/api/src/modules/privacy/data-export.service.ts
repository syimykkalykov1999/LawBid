import { Inject, Injectable, Optional } from '@nestjs/common';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import {
  createZipExport,
  jsonArrayStream,
  jsonObjectStream,
  jsonValueStream,
  pagedBySkip,
  pagedById,
  EXPORT_MAX_MS_DEFAULT,
  type ExportProgress,
} from '../../common/streaming/export-stream';
import { PrismaService } from '../../prisma/prisma.service';
import { buildDataExportEmail } from '../auth/notifications/email-templates';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_EMAIL } from '../notifications/push/push.constants';
import {
  DATA_EXPORT_LINK_TTL_SEC,
  DATA_EXPORT_STALE_PROCESSING_MS,
} from './privacy.constants';
import { privateDetailsAad } from '../../common/secrets/field-aad';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { emailFlowsOn } from '../feature-flags/email-flows';

/** Largest personal-data ZIP we build (the user is told to contact support). */
export const DATA_EXPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** A `processing` row older than this is a dead worker; a retry may reclaim it. */
const STALE_PROCESSING_MS = EXPORT_MAX_MS_DEFAULT + 5 * 60 * 1000;

type Lazy = () => AsyncIterable<unknown>;

/**
 * docs/06 §5.2: collects the user's own data (profile, cases, bids, posts,
 * comments, likes, own messages, consents, devices) into JSON files inside
 * one ZIP, stores it in the private documents bucket, records the `files`
 * row and the `data_export_jobs` result, then notifies (push row + email
 * with a 24-hour link).
 *
 * WP-G 2026-10-25: STREAMED. The long lists (messages, posts, ...) are read
 * from the database 1000 rows at a time, written into the ZIP as they come
 * and uploaded to S3 as a multipart upload, so memory stays flat for any
 * account size. Limits: 2 GiB / 20 minutes per export. Restartable: a
 * failed attempt aborts the upload, puts the row back to `queued` and the
 * BullMQ retry builds the same key from scratch (idempotent).
 */
@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_EMAIL) private readonly email: EmailProvider,
    private readonly logger: PinoLogger,
    @Optional() private readonly costGuard?: CostGuardService,
    @Optional() private readonly cipher?: MessageBodyCipher,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {
    this.logger.setContext(DataExportService.name);
  }

  /** The short sections: a handful of rows each. */
  private async small(userId: string): Promise<Record<string, unknown>> {
    const p = this.prisma;
    const [
      user,
      clientProfile,
      attorneyProfile,
      consents,
      privacySettings,
      sessions,
    ] = await Promise.all([
      p.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          status: true,
          first_name: true,
          last_name: true,
          email: true,
          email_verified_at: true,
          phone_e164: true,
          phone_verified_at: true,
          ui_language: true,
          theme: true,
          created_at: true,
        },
      }),
      p.clientProfile.findUnique({ where: { user_id: userId } }),
      p.attorneyProfile.findUnique({
        where: { user_id: userId },
        include: { licenses: true, practice_areas: true },
      }),
      p.userConsent.findMany({ where: { user_id: userId }, take: 5000 }),
      p.userPrivacySettings.findUnique({ where: { user_id: userId } }),
      p.session.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          device_id: true,
          device_name: true,
          platform: true,
          app_version: true,
          ip: true,
          created_at: true,
          last_used_at: true,
          revoked_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 5000,
      }),
    ]);
    return {
      'profile.json': { user, clientProfile, attorneyProfile },
      'consents.json': consents,
      // Owner 2026-10-22 (CCPA): the audience settings and the current
      // «Do not sell or share» answer (the history is in consents.json).
      'privacy.json': {
        settings: privacySettings,
        doNotSell:
          [...consents]
            .filter((c) => c.consent_type === 'do_not_sell')
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
            ?.granted ?? false,
      },
      'devices.json': sessions,
    };
  }

  /**
   * The long sections, as lazy keyset-paged generators (nothing is read
   * until the ZIP reaches that entry). Order: oldest first.
   */
  private big(userId: string): Record<string, Lazy | Record<string, Lazy>> {
    const p = this.prisma;
    const order = [{ created_at: 'asc' as const }, { id: 'asc' as const }];
    const page = (after: string | undefined) => ({
      orderBy: order,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    });
    const keyset =
      <T extends { id: string }>(
        f: (after: string | undefined, take: number) => Promise<T[]>,
      ): Lazy =>
      () =>
        pagedById(f);
    const likes =
      <T>(f: (skip: number, take: number) => Promise<T[]>): Lazy =>
      () =>
        pagedBySkip(f);
    const likeOrder = [{ created_at: 'asc' as const }];
    return {
      // S3-5: the private details are stored sealed; the owner gets plain text.
      'cases.json': keyset(async (a, take) => {
        const rows = await p.case.findMany({
          where: { client_id: userId },
          take,
          ...page(a),
        });
        return rows.map((c) => ({
          ...c,
          private_details:
            c.private_details === null
              ? null
              : (this.cipher?.openField(
                  c.private_details,
                  privateDetailsAad(c.id),
                ) ?? c.private_details),
        }));
      }),
      'bids.json': keyset((a, take) =>
        p.bid.findMany({ where: { attorney_id: userId }, take, ...page(a) }),
      ),
      'posts.json': keyset((a, take) =>
        p.post.findMany({ where: { author_id: userId }, take, ...page(a) }),
      ),
      'comments.json': {
        posts: keyset((a, take) =>
          p.comment.findMany({
            where: { author_id: userId },
            take,
            ...page(a),
          }),
        ),
        // OQ-034: comments under cases.
        cases: keyset((a, take) =>
          p.caseComment.findMany({
            where: { author_id: userId },
            take,
            ...page(a),
          }),
        ),
      },
      'likes.json': {
        posts: likes((skip, take) =>
          p.postLike.findMany({
            where: { user_id: userId },
            orderBy: [...likeOrder, { post_id: 'asc' }],
            skip,
            take,
          }),
        ),
        comments: likes((skip, take) =>
          p.commentLike.findMany({
            where: { user_id: userId },
            orderBy: [...likeOrder, { comment_id: 'asc' }],
            skip,
            take,
          }),
        ),
        caseComments: likes((skip, take) =>
          p.caseCommentLike.findMany({
            where: { user_id: userId },
            orderBy: [...likeOrder, { comment_id: 'asc' }],
            skip,
            take,
          }),
        ),
      },
      'messages.json': keyset(async (a, take) => {
        const rows = await p.message.findMany({
          where: { sender_id: userId },
          select: {
            id: true,
            conversation_id: true,
            type: true,
            body_original: true,
            // OQ-040: voice notes (the file id; audio stays in storage).
            file_id: true,
            duration_ms: true,
            created_at: true,
          },
          take,
          ...page(a),
        });
        return rows.map((m) => ({
          ...m,
          body_original:
            this.cipher?.open(m.body_original, m.id) ?? m.body_original,
        }));
      }),
    };
  }

  /**
   * Everything as plain objects (small tests / tools only: it holds the
   * whole export in memory, the worker never calls it).
   */
  async collect(userId: string): Promise<Record<string, unknown>> {
    const out = await this.small(userId);
    const drain = async (it: AsyncIterable<unknown>) => {
      const rows: unknown[] = [];
      for await (const r of it) rows.push(r);
      return rows;
    };
    for (const [name, v] of Object.entries(this.big(userId))) {
      if (typeof v === 'function') out[name] = await drain(v());
      else {
        const o: Record<string, unknown> = {};
        for (const [k, f] of Object.entries(v)) o[k] = await drain(f());
        out[name] = o;
      }
    }
    return out;
  }

  /**
   * The worker body: builds, stores, records and notifies.
   *
   * S10-3 (crash safety): the claim is `queued -> processing`, but a job
   * that BullMQ hands out AGAIN (the worker was Spot-killed or stalled
   * mid-build: `retry`) may take over a `processing` row, and so may any
   * call that finds the row untouched for DATA_EXPORT_STALE_PROCESSING_MS.
   * Before, a retry saw `processing`, "succeeded" with 0 bytes and the
   * export stayed `processing` for good. Research: Temporal/Cadence
   * activity heartbeat-timeout + retry and the SQS visibility-timeout
   * redelivery — a redelivery must resume the work, not no-op. `ready`
   * and `failed` rows are still left alone (the job already finished).
   */
  async process(
    exportId: string,
    opts: {
      retry?: boolean;
      // WP-G: streamed exports report their progress.
      onProgress?: (p: ExportProgress) => void;
    } = {},
  ): Promise<{ bytes: number }> {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: exportId },
      include: {
        user: {
          select: {
            email: true,
            email_verified_at: true,
            status: true,
            ui_language: true,
          },
        },
      },
    });
    if (!job || job.type !== 'user_data') return { bytes: 0 };
    // Atomic claim: the BullMQ worker and a manual/retry call never build
    // the same export twice (unique s3_key). A `processing` row left by a
    // dead worker (older than the time limit) can be taken over.
    // A streamed export may legitimately run up to its time limit: never
    // take over a row younger than that (WP-G), nor than the S10-3 floor.
    const stale = new Date(
      Date.now() -
        Math.max(DATA_EXPORT_STALE_PROCESSING_MS, STALE_PROCESSING_MS),
    );
    const { count } = await this.prisma.dataExportJob.updateMany({
      where: {
        id: exportId,
        OR: [
          { status: 'queued' },
          opts.retry
            ? { status: 'processing' }
            : { status: 'processing', updated_at: { lt: stale } },
        ],
      },
      data: { status: 'processing' },
    });
    if (count === 0) return { bytes: 0 };
    const now = new Date();
    const bucket = this.storage.bucket('documents');
    const key = `exports/user-data/${job.user_id}/${exportId}.zip`;
    let bytes = 0;
    let sha256 = '';
    try {
      const progress: ExportProgress = { rows: 0, bytes: 0 };
      let lastTick = 0;
      const tick = () => {
        const t = Date.now();
        if (t - lastTick < 2000) return;
        lastTick = t;
        opts.onProgress?.({ ...progress });
      };
      const small = await this.small(job.user_id);
      const big = this.big(job.user_id);
      const names = [...Object.keys(small), ...Object.keys(big)];
      const zip = createZipExport(
        (archive) => {
          archive.append(
            jsonValueStream({
              generatedAt: now.toISOString(),
              files: names,
              note: 'LawBid data export (docs/06 §5.2).',
            }),
            { name: 'README.json' },
          );
          for (const [name, value] of Object.entries(small)) {
            archive.append(jsonValueStream(value), { name });
          }
          const onRow = () => {
            progress.rows += 1;
            tick();
          };
          for (const [name, v] of Object.entries(big)) {
            archive.append(
              typeof v === 'function'
                ? jsonArrayStream(v(), onRow)
                : jsonObjectStream(
                    Object.fromEntries(
                      Object.entries(v).map(([k, f]) => [k, f()]),
                    ),
                    onRow,
                  ),
              { name },
            );
          }
        },
        {
          maxBytes: DATA_EXPORT_MAX_BYTES,
          onBytes: (b) => {
            progress.bytes = b;
            tick();
          },
        },
      );
      await this.storage.putStream(bucket, key, zip.body, 'application/zip');
      bytes = zip.body.bytes;
      sha256 = zip.body.digest();
      opts.onProgress?.({ rows: progress.rows, bytes });
    } catch (error) {
      // Restartable: the multipart upload was aborted by putStream; the
      // row goes back to `queued` so the BullMQ retry (same key, same
      // id) can claim it. After the last attempt the runner marks it failed.
      await this.prisma.dataExportJob.updateMany({
        where: { id: exportId, status: 'processing' },
        data: { status: 'queued' },
      });
      throw error;
    }
    const expiresAt = new Date(now.getTime() + DATA_EXPORT_LINK_TTL_SEC * 1000);
    const fileData = {
      owner_user_id: job.user_id,
      purpose: 'data_export' as const,
      s3_bucket: bucket,
      s3_key: key,
      mime: 'application/zip',
      // WP-G: streamed — size and hash come from the stream.
      size_bytes: BigInt(bytes),
      sha256,
      scan_status: 'clean' as const,
    };
    // A takeover after a crash may find the row of the first run (same
    // key): reuse it instead of leaving a second row for one object.
    const earlier = await this.prisma.file.findFirst({
      where: {
        owner_user_id: job.user_id,
        purpose: 'data_export',
        s3_bucket: bucket,
        s3_key: key,
      },
      select: { id: true },
    });
    const file = earlier
      ? await this.prisma.file.update({
          where: { id: earlier.id },
          data: fileData,
        })
      : await this.prisma.file.create({ data: fileData });
    await this.prisma.dataExportJob.update({
      where: { id: exportId },
      data: { status: 'ready', file_id: file.id, expires_at: expiresAt },
    });
    await this.notifications.emit({
      type: 'data_export_ready',
      recipientId: job.user_id,
      payload: { exportId },
    });
    if (
      job.user.email &&
      job.user.email_verified_at &&
      job.user.status === 'active' &&
      // Admin «Вход и письма по почте» off: the link is in the app only.
      (await emailFlowsOn(this.flags))
    ) {
      try {
        const url = await this.storage.signedGetUrl(
          bucket,
          key,
          DATA_EXPORT_LINK_TTL_SEC,
        );
        // Counts against the email budget (security audit 2026-10-01).
        await this.costGuard?.consume('email');
        await this.email.sendEmail(
          buildDataExportEmail({
            email: job.user.email,
            url,
            expiresAt,
            appLinkBaseUrl: this.config.get<string>('APP_LINK_BASE_URL'),
            locale: job.user.ui_language,
          }),
        );
      } catch (error) {
        // The in-app notification and GET /users/me/data-export/:id still
        // hand out the link; the email is best effort.
        this.logger.warn(
          { exportId, err: error instanceof Error ? error.message : error },
          'data export email failed',
        );
      }
    }
    return { bytes };
  }
}
