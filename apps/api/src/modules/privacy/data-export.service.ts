import { Readable } from 'node:stream';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { PinoLogger } from 'nestjs-pino';
import {
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

/** JSON with BigInt/Date friendly to `JSON.stringify`. */
function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

/** Largest personal-data ZIP we build (the user is told to contact support). */
export const DATA_EXPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** A `processing` row older than this is a dead worker; a retry may reclaim it. */
const STALE_PROCESSING_MS = EXPORT_MAX_MS_DEFAULT + 5 * 60 * 1000;

/** Rows per page of a streamed table. */
const PAGE = 1000;

interface PageArgs {
  take: number;
  cursor?: { id: string };
  skip?: number;
}
interface OffsetArgs {
  take: number;
  skip: number;
}

/** Pages of a table keyed by a unique `id`: keyset (cursor) paging. */
async function* byId<T extends { id: string | bigint }>(
  run: (page: PageArgs) => Promise<T[]>,
  map?: (row: T) => unknown,
): AsyncGenerator<unknown[]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await run({
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) return;
    yield map ? rows.map(map) : rows;
    if (rows.length < PAGE) return;
    cursor = String(rows[rows.length - 1].id);
  }
}

/** Keyset paging for the tables whose primary key became (id, shard key)
 * with hash partitioning (#358: messages, chat_group_messages,
 * notifications): the cursor is the compound key of the last row. */
async function* byCompound<T, C>(
  run: (page: { take: number; cursor?: C; skip?: number }) => Promise<T[]>,
  cursorOf: (row: T) => C,
  map?: (row: T) => unknown,
): AsyncGenerator<unknown[]> {
  let cursor: C | undefined;
  for (;;) {
    const rows = await run({
      take: PAGE,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    if (rows.length === 0) return;
    yield map ? rows.map(map) : rows;
    if (rows.length < PAGE) return;
    cursor = cursorOf(rows[rows.length - 1]);
  }
}

/** Pages of a table with a composite key: offset paging (small tables). */
async function* byOffset<T>(
  run: (page: OffsetArgs) => Promise<T[]>,
): AsyncGenerator<unknown[]> {
  for (let skip = 0; ; skip += PAGE) {
    const rows = await run({ take: PAGE, skip });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
  }
}

/** A JSON array, written page by page. */
async function* array(
  pages: AsyncIterable<unknown[]>,
  onRow?: () => void,
): AsyncGenerator<string> {
  yield '[';
  let first = true;
  for await (const page of pages) {
    for (const row of page) {
      yield `${first ? '\n' : ',\n'}${toJson(row)}`;
      first = false;
      onRow?.();
    }
  }
  yield first ? ']\n' : '\n]\n';
}

/** One JSON value (a row, a small object). */
async function* value(v: unknown): AsyncGenerator<string> {
  yield toJson(await v);
}

/** A JSON object whose members are streamed in turn. */
async function* object(
  members: Record<string, () => AsyncGenerator<string>>,
): AsyncGenerator<string> {
  yield '{';
  let first = true;
  for (const [key, make] of Object.entries(members)) {
    yield `${first ? '\n' : ',\n'}${JSON.stringify(key)}: `;
    first = false;
    yield* make();
  }
  yield '\n}\n';
}

/**
 * docs/06 §5.2: collects the user's own data (profile, cases, bids, posts,
 * comments, likes, own messages, consents, devices and — round 13 — group
 * messages, reviews, consultations, payments, notifications, follows, push
 * devices, contact sync, stories, search history, calls, support tickets,
 * journal events and contact disclosures) into JSON files inside
 * one ZIP, streamed page by page, stores it in the private documents bucket, records the `files`
 * row and the `data_export_jobs` result, then notifies (push row + email
 * with a 24-hour link).
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

  /**
   * Every file of the export as a lazy stream of JSON text (S13-8). Nothing
   * is read until the ZIP reaches the entry, and tables are read in pages of
   * {@link PAGE} rows, so a heavy user costs a few pages of memory, not the
   * whole archive.
   */
  sources(
    userId: string,
    // WP-G (#366): streamed exports report their progress (rows written).
    onRow?: () => void,
  ): Record<string, () => AsyncGenerator<string>> {
    const p = this.prisma;
    const rows = (pages: AsyncIterable<unknown[]>) => array(pages, onRow);
    const cipher = this.cipher;
    const mine = { OR: [{ client_id: userId }, { attorney_id: userId }] };
    const fetchById =
      <T extends { id: string }>(
        run: (page: PageArgs) => Promise<T[]>,
        map?: (row: T) => unknown,
      ) =>
      () =>
        byId(run, map);
    const fetchByOffset =
      <T>(run: (page: OffsetArgs) => Promise<T[]>) =>
      () =>
        byOffset(run);
    return {
      'profile.json': () =>
        object({
          user: () =>
            value(
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
            ),
          clientProfile: () =>
            value(p.clientProfile.findUnique({ where: { user_id: userId } })),
          attorneyProfile: () =>
            value(
              p.attorneyProfile.findUnique({
                where: { user_id: userId },
                include: { licenses: true, practice_areas: true },
              }),
            ),
        }),
      'consents.json': () =>
        rows(
          fetchById((a) =>
            p.userConsent.findMany({
              where: { user_id: userId },
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      // Owner 2026-10-22 (CCPA): the audience settings and the current
      // «Do not sell or share» answer (the history is in consents.json).
      'privacy.json': () =>
        value(
          (async () => {
            const [settings, latest] = await Promise.all([
              p.userPrivacySettings.findUnique({ where: { user_id: userId } }),
              p.userConsent.findFirst({
                where: { user_id: userId, consent_type: 'do_not_sell' },
                orderBy: { created_at: 'desc' },
              }),
            ]);
            return { settings, doNotSell: latest?.granted ?? false };
          })(),
        ),
      'devices.json': () =>
        rows(
          fetchById((a) =>
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
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'cases.json': () =>
        rows(
          fetchById(
            (a) =>
              p.case.findMany({
                where: { client_id: userId },
                orderBy: { id: 'asc' },
                ...a,
              }),
            // S3-5: the private details are stored sealed; the owner gets plain text.
            (c) => ({
              ...c,
              private_details:
                c.private_details === null
                  ? null
                  : (cipher?.openField(
                      c.private_details,
                      privateDetailsAad(c.id),
                    ) ?? c.private_details),
            }),
          )(),
        ),
      'bids.json': () =>
        rows(
          fetchById((a) =>
            p.bid.findMany({
              where: { attorney_id: userId },
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'posts.json': () =>
        rows(
          fetchById((a) =>
            p.post.findMany({
              where: { author_id: userId },
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'comments.json': () =>
        object({
          posts: () =>
            rows(
              fetchById((a) =>
                p.comment.findMany({
                  where: { author_id: userId },
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
          // OQ-034: comments under cases.
          cases: () =>
            rows(
              fetchById((a) =>
                p.caseComment.findMany({
                  where: { author_id: userId },
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
        }),
      'likes.json': () =>
        object({
          posts: () =>
            rows(
              fetchByOffset((a) =>
                p.postLike.findMany({
                  where: { user_id: userId },
                  orderBy: [{ created_at: 'asc' }, { post_id: 'asc' }],
                  ...a,
                }),
              )(),
            ),
          comments: () =>
            rows(
              fetchByOffset((a) =>
                p.commentLike.findMany({
                  where: { user_id: userId },
                  orderBy: [{ created_at: 'asc' }, { comment_id: 'asc' }],
                  ...a,
                }),
              )(),
            ),
          caseComments: () =>
            rows(
              fetchByOffset((a) =>
                p.caseCommentLike.findMany({
                  where: { user_id: userId },
                  orderBy: [{ created_at: 'asc' }, { comment_id: 'asc' }],
                  ...a,
                }),
              )(),
            ),
        }),
      'messages.json': () =>
        rows(
          byCompound(
            (a) =>
              p.message.findMany({
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
                orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
                ...a,
              }),
            (m: { id: string; conversation_id: string }) => ({
              id_conversation_id: {
                id: m.id,
                conversation_id: m.conversation_id,
              },
            }),
            (m) => ({
              ...m,
              body_original:
                cipher?.open(m.body_original, m.id) ?? m.body_original,
            }),
          ),
        ),
      // ---- round 13 (S13-8): the product areas that were missing ----
      'group-messages.json': () =>
        rows(
          byCompound(
            (a) =>
              p.chatGroupMessage.findMany({
                where: { sender_id: userId },
                orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
                ...a,
              }),
            (m: { id: string; group_id: string }) => ({
              id_group_id: { id: m.id, group_id: m.group_id },
            }),
          ),
        ),
      'reviews.json': () =>
        object({
          ofAttorneys: () =>
            rows(
              fetchById((a) =>
                p.review.findMany({
                  where: mine,
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
          ofClients: () =>
            rows(
              fetchById((a) =>
                p.clientReview.findMany({
                  where: mine,
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
        }),
      'consultations.json': () =>
        rows(
          fetchById((a) =>
            p.consultation.findMany({
              where: mine,
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'payments.json': () =>
        object({
          subscription: () =>
            value(p.subscription.findUnique({ where: { user_id: userId } })),
          casePayments: () =>
            rows(
              fetchById((a) =>
                p.casePayment.findMany({
                  where: mine,
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
        }),
      'notifications.json': () =>
        rows(
          byCompound(
            (a) =>
              p.notification.findMany({
                where: { user_id: userId },
                orderBy: { id: 'asc' },
                ...a,
              }),
            (n: { id: string; user_id: string }) => ({
              id_user_id: { id: n.id, user_id: n.user_id },
            }),
          ),
        ),
      'follows.json': () =>
        object({
          following: () =>
            rows(
              fetchByOffset((a) =>
                p.follow.findMany({
                  where: { follower_id: userId },
                  orderBy: [{ created_at: 'asc' }, { followee_id: 'asc' }],
                  ...a,
                }),
              )(),
            ),
          followers: () =>
            rows(
              fetchByOffset((a) =>
                p.follow.findMany({
                  where: { followee_id: userId },
                  orderBy: [{ created_at: 'asc' }, { follower_id: 'asc' }],
                  ...a,
                }),
              )(),
            ),
        }),
      'push-tokens.json': () =>
        rows(
          fetchById((a) =>
            p.pushToken.findMany({
              where: { user_id: userId },
              select: {
                id: true,
                platform: true,
                created_at: true,
              },
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'contact-sync.json': () =>
        value(
          (async () => ({
            settings: await p.contactSyncSetting.findUnique({
              where: { user_id: userId },
            }),
            // The uploaded phone book is one-way hashes of other people's
            // numbers: the count is exported, not the hashes.
            storedNumbers: await p.contactBookHash.count({
              where: { owner_id: userId },
            }),
          }))(),
        ),
      'stories.json': () =>
        rows(
          fetchById((a) =>
            p.story.findMany({
              where: { author_id: userId },
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'search-history.json': () =>
        rows(
          byOffset((a) =>
            p.searchQueryLog.findMany({
              where: { user_id: userId },
              select: { q: true, scope: true, lang: true, created_at: true },
              orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
              ...a,
            }),
          ),
        ),
      'calls.json': () =>
        object({
          started: () =>
            rows(
              fetchById((a) =>
                p.call.findMany({
                  where: { caller_id: userId },
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
          joined: () =>
            rows(
              fetchById((a) =>
                p.callParticipant.findMany({
                  where: { user_id: userId },
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
        }),
      'support.json': () =>
        object({
          tickets: () =>
            rows(
              fetchById((a) =>
                p.supportTicket.findMany({
                  where: { user_id: userId },
                  orderBy: { id: 'asc' },
                  ...a,
                }),
              )(),
            ),
          // Admin-only notes are not the person's data to receive.
          messages: () =>
            rows(
              (async function* () {
                const tickets = await p.supportTicket.findMany({
                  where: { user_id: userId },
                  select: { id: true },
                  take: 5000,
                });
                const ids = tickets.map((t) => t.id);
                yield* byId((a) =>
                  p.supportMessage.findMany({
                    where: { internal: false, ticket_id: { in: ids } },
                    orderBy: { id: 'asc' },
                    ...a,
                  }),
                );
              })(),
            ),
        }),
      'journal.json': () =>
        rows(
          fetchById((a) =>
            p.caseJournal.findMany({
              where: mine,
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
      'contact-disclosures.json': () =>
        rows(
          fetchById((a) =>
            p.contactDisclosure.findMany({
              where: mine,
              orderBy: { id: 'asc' },
              ...a,
            }),
          )(),
        ),
    };
  }

  /** All files as plain values (tests and small tools; the worker streams). */
  async collect(userId: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [name, make] of Object.entries(this.sources(userId))) {
      let text = '';
      for await (const chunk of make()) text += chunk;
      out[name] = JSON.parse(text) as unknown;
    }
    return out;
  }

  /** The ZIP as a stream: README first, then every source as its own entry.
   * archiver reads the entries one after the other, so only the page being
   * written is in memory. */
  archive(
    userId: string,
    generatedAt: Date,
    onRow?: () => void,
  ): archiver.Archiver {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const sources = this.sources(userId, onRow);
    archive.append(
      toJson({
        generatedAt: generatedAt.toISOString(),
        files: Object.keys(sources),
        note: 'LawBid data export (docs/06 §5.2).',
      }),
      { name: 'README.json' },
    );
    for (const [name, make] of Object.entries(sources)) {
      archive.append(Readable.from(make(), { objectMode: false }), { name });
    }
    void archive.finalize();
    return archive;
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
      // WP-G (#366): streamed exports report their progress.
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
    // S13-8: streamed — rows are read in pages and the ZIP goes to storage
    // as a multipart upload; nothing holds the whole archive.
    const progress: ExportProgress = { rows: 0, bytes: 0 };
    let lastTick = 0;
    const tick = () => {
      const t = Date.now();
      if (t - lastTick < 2000) return;
      lastTick = t;
      opts.onProgress?.({ ...progress });
    };
    // WP-G (#366): count what goes out, stop past DATA_EXPORT_MAX_BYTES.
    const zip = this.archive(job.user_id, now, () => {
      progress.rows += 1;
      tick();
    });
    async function* counted(): AsyncGenerator<Buffer> {
      for await (const chunk of zip as AsyncIterable<Buffer>) {
        progress.bytes += chunk.length;
        if (progress.bytes > DATA_EXPORT_MAX_BYTES) {
          zip.abort();
          throw new Error('data export is larger than DATA_EXPORT_MAX_BYTES');
        }
        tick();
        yield chunk;
      }
    }
    let stored: { bytes: number; sha256: string };
    try {
      stored = await this.storage.putStream(
        bucket,
        key,
        counted(),
        'application/zip',
      );
      opts.onProgress?.({ rows: progress.rows, bytes: stored.bytes });
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
      // S13-8: streamed upload — size and hash come from the stream.
      size_bytes: BigInt(stored.bytes),
      sha256: stored.sha256,
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
    return { bytes: stored.bytes };
  }
}
