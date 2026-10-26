import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { readSwitchMode } from '../../common/app-settings/switch-mode';
import type { MediaModerationCheck, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { FileReleaseService, S3StorageService } from '../files/files.public';
import {
  ModerationService,
  type ContentAction,
} from '../moderation/moderation.service';
import { VideosService } from '../videos/videos.service';
import {
  CSAM_HASH_MATCHER,
  CSAM_REPORTER,
  type CsamHashMatcher,
  type CsamReporter,
} from './csam.adapters';
import {
  IMAGE_MODERATION_PROVIDER,
  type ImageModerationProvider,
} from './image-moderation.provider';
import {
  BLOCKING_STATUSES,
  CHECK_MAX_PX,
  QUEUE_STATUSES,
  isModeratedPurpose,
  type ModerationLabel,
} from './media-moderation.constants';
import { MediaModerationQueue } from './media-moderation.queue';

/** Content hidden by a verdict, so an approval restores exactly that. */
export interface HiddenTarget {
  type:
    'post' | 'story' | 'channel_post' | 'review' | 'client_review' | 'avatar';
  id: string;
}

export type CheckStatus =
  | 'pending'
  | 'clean'
  | 'flagged'
  | 'hidden'
  | 'csam_match'
  | 'skipped'
  | 'error';

interface Thresholds {
  enabled: boolean;
  hide: number;
  review: number;
  min: number;
}

const THUMBNAIL_TIMEOUT_MS = 10_000;

/** Final verdict from the labels and the thresholds (pure, unit-tested). */
export function verdictOf(
  labels: ModerationLabel[],
  t: Pick<Thresholds, 'hide' | 'review'>,
): { status: 'clean' | 'flagged' | 'hidden'; max: number; top: string | null } {
  let max = 0;
  let top: string | null = null;
  for (const l of labels) {
    if (l.confidence > max) {
      max = l.confidence;
      top = l.parent ? `${l.parent} / ${l.name}` : l.name;
    }
  }
  const status =
    max >= t.hide ? 'hidden' : max >= t.review ? 'flagged' : 'clean';
  return { status, max, top };
}

/**
 * Owner 2026-10-22 (audit #4 §5, App Store 1.2; Instagram-style pipeline):
 * every public picture — post and story photos, avatars, review photos
 * and reel thumbnails — is checked after upload:
 *  1. the CSAM hash matcher (PhotoDNA adapter): a match hides the content
 *     at once, keeps the evidence and opens an NCMEC report;
 *  2. AWS Rekognition DetectModerationLabels: at
 *     `moderation.image.hide_confidence` the content is hidden and queued,
 *     at `review_confidence` it stays up and is queued (Модерация → Медиа).
 * Cost guard: one `image_moderation` unit per paid call; the same picture
 * again (same SHA-256) reuses the stored verdict for free; with the
 * budget used up the check is `skipped` (budget) and listed for review.
 * A hidden picture can no longer be attached (FilesService).
 */
@Injectable()
export class MediaModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly costGuard: CostGuardService,
    private readonly storage: S3StorageService,
    private readonly moderation: ModerationService,
    private readonly release: FileReleaseService,
    @Inject(IMAGE_MODERATION_PROVIDER)
    private readonly provider: ImageModerationProvider,
    @Inject(CSAM_HASH_MATCHER) private readonly matcher: CsamHashMatcher,
    @Inject(CSAM_REPORTER) private readonly reporter: CsamReporter,
    private readonly queue: MediaModerationQueue,
    private readonly logger: PinoLogger,
    @Optional() private readonly videos?: VideosService,
  ) {
    this.logger.setContext(MediaModerationService.name);
  }

  // --- the worker -----------------------------------------------------------

  /** Checks one uploaded file. Idempotent: a finished check is returned. */
  async checkFile(fileId: string): Promise<CheckStatus> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (
      !file ||
      file.deleted_at ||
      file.scan_status !== 'clean' ||
      !isModeratedPurpose(file.purpose)
    ) {
      return 'skipped';
    }
    const check = await this.prisma.mediaModerationCheck.upsert({
      where: { file_id: fileId },
      create: {
        file_id: fileId,
        owner_user_id: file.owner_user_id,
        purpose: file.purpose,
        content_sha256: file.sha256,
      },
      update: {},
    });
    if (!this.redo(check)) return check.status as CheckStatus;
    return this.run(check, file.sha256, () =>
      this.storage.read(file.s3_bucket, file.s3_key),
    );
  }

  /** Checks a ready video by its thumbnail (Bunny Stream). */
  async checkVideo(videoAssetId: string): Promise<CheckStatus> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: videoAssetId },
    });
    if (!asset || asset.deleted_at || asset.status !== 'ready' || !this.videos)
      return 'skipped';
    const check = await this.prisma.mediaModerationCheck.upsert({
      where: { video_asset_id: videoAssetId },
      create: {
        video_asset_id: videoAssetId,
        owner_user_id: asset.owner_user_id,
        purpose: 'reel',
      },
      update: {},
    });
    if (!this.redo(check)) return check.status as CheckStatus;
    const url = (await this.videos.present([asset])).get(
      asset.id,
    )?.thumbnailUrl;
    if (!url)
      return this.finish(check.id, 'skipped', { skip_reason: 'format' });
    return this.run(check, null, () => fetchBytes(url));
  }

  /** A hidden verdict applied again (content posted after the check). */
  async rehide(checkId: string): Promise<void> {
    const check = await this.prisma.mediaModerationCheck.findUnique({
      where: { id: checkId },
    });
    if (!check || !this.blocking(check)) return;
    await this.hide(check);
  }

  private redo(check: MediaModerationCheck): boolean {
    return check.status === 'pending' || check.status === 'error';
  }

  private blocking(check: MediaModerationCheck): boolean {
    return (
      (BLOCKING_STATUSES as readonly string[]).includes(check.status) &&
      check.decision !== 'approved'
    );
  }

  private async thresholds(): Promise<Thresholds> {
    const [enabled, hide, review, min] = await Promise.all([
      readSwitchMode(this.settings, 'moderation.image.enabled'),
      this.settings.number('moderation.image.hide_confidence'),
      this.settings.number('moderation.image.review_confidence'),
      this.settings.number('moderation.image.min_confidence'),
    ]);
    // auto = on: the daily cost-guard cap (`image_moderation`) is the ceiling.
    return { enabled: enabled !== 'off', hide, review, min };
  }

  private async run(
    check: MediaModerationCheck,
    sha256: string | null,
    load: () => Promise<Buffer>,
  ): Promise<CheckStatus> {
    const t = await this.thresholds();
    if (!t.enabled) {
      return this.finish(check.id, 'skipped', { skip_reason: 'disabled' });
    }
    // Cost guard 1: the same picture was already judged — reuse it.
    if (sha256) {
      const twin = await this.prisma.mediaModerationCheck.findFirst({
        where: {
          content_sha256: sha256,
          id: { not: check.id },
          status: { in: ['clean', 'flagged', 'hidden', 'csam_match'] },
        },
        orderBy: { created_at: 'asc' },
      });
      if (twin) return this.adopt(check, twin);
    }
    const providerOn = await this.provider.configured();
    let jpeg: Buffer;
    try {
      jpeg = await toCheckJpeg(await load());
    } catch (err) {
      this.logger.warn(
        { checkId: check.id, err: String(err) },
        'media check: image unreadable',
      );
      return this.finish(check.id, 'skipped', { skip_reason: 'format' });
    }
    const digest = createHash('sha256').update(jpeg).digest('hex');

    // 1. Known CSAM first: never published, evidence kept, report opened.
    const csam = await this.matcher.match(jpeg);
    if (csam.status === 'match') {
      const row = await this.finish(check.id, 'csam_match', {
        csam_status: 'match',
        provider: this.matcher.name,
        content_sha256: sha256 ?? digest,
      });
      const fresh = await this.prisma.mediaModerationCheck.findUniqueOrThrow({
        where: { id: check.id },
      });
      await this.hide(fresh);
      await this.openCsamReport(fresh, null, { trackingId: csam.trackingId });
      this.logger.error(
        { checkId: check.id, alert: 'csam_match' },
        'Known CSAM matched — content hidden, NCMEC report opened',
      );
      return row;
    }
    if (!providerOn) {
      return this.finish(check.id, 'skipped', {
        skip_reason: 'not_configured',
        csam_status: csam.status,
        content_sha256: sha256 ?? digest,
      });
    }

    // 2. Rekognition, inside the money cap.
    try {
      await this.costGuard.consume('image_moderation');
    } catch (err) {
      if (err instanceof HttpException) {
        return this.finish(check.id, 'skipped', {
          skip_reason: 'budget',
          csam_status: csam.status,
          content_sha256: sha256 ?? digest,
        });
      }
      throw err;
    }
    let labels: ModerationLabel[];
    try {
      labels = (await this.provider.detect(jpeg, t.min)).labels;
    } catch (err) {
      await this.finish(check.id, 'error', {
        error: String(err).slice(0, 500),
        csam_status: csam.status,
      });
      throw err; // BullMQ retries
    }
    const v = verdictOf(labels, t);
    await this.finish(check.id, v.status, {
      provider: this.provider.name,
      labels: labels as unknown as Prisma.InputJsonValue,
      max_confidence: v.max,
      top_label: v.top,
      csam_status: csam.status,
      content_sha256: sha256 ?? digest,
    });
    if (v.status === 'hidden') {
      const fresh = await this.prisma.mediaModerationCheck.findUniqueOrThrow({
        where: { id: check.id },
      });
      await this.hide(fresh);
    }
    return v.status;
  }

  /** Copies a twin's verdict (no paid call) and applies it. */
  private async adopt(
    check: MediaModerationCheck,
    twin: MediaModerationCheck,
  ): Promise<CheckStatus> {
    const status = twin.status as CheckStatus;
    await this.finish(check.id, status, {
      provider: 'reuse',
      labels: twin.labels as Prisma.InputJsonValue,
      max_confidence: twin.max_confidence,
      top_label: twin.top_label,
      csam_status: twin.csam_status,
    });
    const fresh = await this.prisma.mediaModerationCheck.findUniqueOrThrow({
      where: { id: check.id },
    });
    if (this.blocking(fresh)) await this.hide(fresh);
    if (status === 'csam_match') await this.openCsamReport(fresh, null, {});
    return status;
  }

  private async finish(
    id: string,
    status: CheckStatus,
    data: Prisma.MediaModerationCheckUpdateInput = {},
  ): Promise<CheckStatus> {
    await this.prisma.mediaModerationCheck.update({
      where: { id },
      data: { ...data, status, checked_at: new Date() },
    });
    return status;
  }

  // --- hiding and restoring -------------------------------------------------

  /** What shows this picture right now. */
  async targetsOf(check: MediaModerationCheck): Promise<HiddenTarget[]> {
    const out: HiddenTarget[] = [];
    if (check.file_id) {
      const f = check.file_id;
      const [
        media,
        stories,
        channelPosts,
        reels,
        reviews,
        clientReviews,
        users,
      ] = await Promise.all([
        this.prisma.postMedia.findMany({
          where: { file_id: f },
          select: { post_id: true },
        }),
        this.prisma.story.findMany({
          where: { file_id: f },
          select: { id: true },
        }),
        this.prisma.channelPost.findMany({
          where: { media_file_ids: { has: f } },
          select: { id: true },
        }),
        this.prisma.videoAsset.findMany({
          where: { cover_file_id: f },
          select: { post: { select: { id: true } } },
        }),
        this.prisma.review.findMany({
          where: { photo_ids: { has: f } },
          select: { id: true },
        }),
        this.prisma.clientReview.findMany({
          where: { photo_ids: { has: f } },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { avatar_file_id: f },
          select: { id: true },
        }),
      ]);
      for (const m of media) out.push({ type: 'post', id: m.post_id });
      for (const r of reels)
        if (r.post) out.push({ type: 'post', id: r.post.id });
      for (const s of stories) out.push({ type: 'story', id: s.id });
      for (const c of channelPosts)
        out.push({ type: 'channel_post', id: c.id });
      for (const r of reviews) out.push({ type: 'review', id: r.id });
      for (const r of clientReviews)
        out.push({ type: 'client_review', id: r.id });
      for (const u of users) out.push({ type: 'avatar', id: u.id });
    }
    if (check.video_asset_id) {
      const v = check.video_asset_id;
      const [posts, stories, channelPosts] = await Promise.all([
        this.prisma.post.findMany({
          where: { video_asset_id: v },
          select: { id: true },
        }),
        this.prisma.story.findMany({
          where: { video_asset_id: v },
          select: { id: true },
        }),
        this.prisma.channelPost.findMany({
          where: { video_asset_id: v },
          select: { id: true },
        }),
      ]);
      for (const p of posts) out.push({ type: 'post', id: p.id });
      for (const s of stories) out.push({ type: 'story', id: s.id });
      for (const c of channelPosts)
        out.push({ type: 'channel_post', id: c.id });
    }
    const seen = new Set<string>();
    return out.filter((t) => {
      const k = `${t.type}:${t.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Hides everything that shows the picture; remembers what it hid. A
   * picture not posted yet is tried again later (and can no longer be
   * attached meanwhile). */
  async hide(check: MediaModerationCheck): Promise<HiddenTarget[]> {
    const targets = await this.targetsOf(check);
    const hidden = await this.apply(targets, 'hide');
    const before = (check.hidden_targets as unknown as HiddenTarget[]) ?? [];
    const merged = [...before];
    for (const h of hidden) {
      if (!merged.some((m) => m.type === h.type && m.id === h.id))
        merged.push(h);
    }
    await this.prisma.mediaModerationCheck.update({
      where: { id: check.id },
      data: { hidden_targets: merged as unknown as Prisma.InputJsonValue },
    });
    if (targets.length === 0) await this.queue.enqueueRehide(check.id);
    return hidden;
  }

  /** hide / remove / restore on each target; returns those it changed. */
  private async apply(
    targets: HiddenTarget[],
    action: ContentAction,
  ): Promise<HiddenTarget[]> {
    const changed: HiddenTarget[] = [];
    for (const t of targets) {
      if (t.type === 'avatar') {
        if (action === 'restore') continue; // restoreAvatar() handles it
        await this.prisma.user.updateMany({
          where: { id: t.id },
          data: { avatar_file_id: null },
        });
        changed.push(t);
        continue;
      }
      const after: (() => Promise<void>)[] = [];
      const did = await withTxRetry(this.prisma, async (tx) => {
        after.length = 0;
        const target = await this.moderation.resolve(
          t.type as Exclude<HiddenTarget['type'], 'avatar'>,
          t.id,
          tx,
        );
        if (!target) return false;
        return (
          (await this.moderation.setContentStatus(
            tx,
            target,
            action,
            after,
          )) !== null
        );
      });
      for (const f of after) await f();
      if (did) changed.push(t);
    }
    return changed;
  }

  // --- the admin queue ------------------------------------------------------

  async list(query: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: MediaModerationCheck[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const statuses =
      query.status && query.status !== 'all'
        ? [query.status]
        : [...QUEUE_STATUSES, 'skipped'];
    const rows = await this.prisma.mediaModerationCheck.findMany({
      where: {
        status: { in: statuses },
        decision: null,
        ...(query.cursor ? { created_at: { lt: new Date(query.cursor) } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor:
        rows.length > limit
          ? items[items.length - 1].created_at.toISOString()
          : null,
    };
  }

  /** A signed preview for the moderator (null for a CSAM match: the
   * picture is never shown again, not even to staff). */
  async previewUrl(check: MediaModerationCheck): Promise<string | null> {
    if (check.status === 'csam_match' || !check.file_id) return null;
    const file = await this.prisma.file.findUnique({
      where: withDeleted({ id: check.file_id }),
    });
    if (!file || file.purged_at) return null;
    try {
      return await this.storage.signedGetUrl(file.s3_bucket, file.s3_key, 300);
    } catch {
      return null;
    }
  }

  async get(id: string): Promise<MediaModerationCheck> {
    const row = await this.prisma.mediaModerationCheck.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Check not found.',
      });
    }
    return row;
  }

  /**
   * approve: the picture is fine — what the verdict hid comes back.
   * remove: it stays off; the content is removed and (unless it is CSAM
   * evidence) the file is released from storage.
   */
  async decide(
    adminId: string,
    id: string,
    decision: 'approve' | 'remove',
  ): Promise<MediaModerationCheck> {
    const check = await this.get(id);
    if (check.decision) {
      throw new ConflictException({
        code: ErrorCode.MODERATION_ACTION_NOT_APPLICABLE,
        message: 'This check was already decided.',
      });
    }
    if (decision === 'approve' && check.status === 'csam_match') {
      throw new ConflictException({
        code: ErrorCode.MODERATION_ACTION_NOT_APPLICABLE,
        message: 'A CSAM hash match cannot be approved.',
      });
    }
    const hidden = (check.hidden_targets as unknown as HiddenTarget[]) ?? [];
    if (decision === 'approve') {
      await this.apply(hidden, 'restore');
      for (const t of hidden.filter((h) => h.type === 'avatar')) {
        if (check.file_id) {
          await this.prisma.user.updateMany({
            where: { id: t.id, avatar_file_id: null },
            data: { avatar_file_id: check.file_id },
          });
        }
      }
    } else {
      const targets = await this.targetsOf(check);
      await this.apply(targets, 'remove');
      if (check.file_id && check.status !== 'csam_match') {
        await this.release.release([check.file_id], 'released');
      }
      if (
        check.video_asset_id &&
        this.videos &&
        check.status !== 'csam_match'
      ) {
        await this.videos.markDeleted([check.video_asset_id]);
      }
    }
    return this.prisma.mediaModerationCheck.update({
      where: { id },
      data: {
        decision: decision === 'approve' ? 'approved' : 'removed',
        decided_by: adminId,
        decided_at: new Date(),
      },
    });
  }

  /** The admin's «Report to NCMEC» (also called on a hash match). */
  async reportCsam(adminId: string, id: string) {
    const check = await this.get(id);
    if (check.status !== 'csam_match') {
      // A moderator's own finding: hide everything at once, keep evidence.
      await this.prisma.mediaModerationCheck.update({
        where: { id },
        data: { status: 'csam_match' },
      });
      await this.hide({ ...check, status: 'csam_match' });
    }
    return this.openCsamReport(check, adminId, {});
  }

  private async openCsamReport(
    check: MediaModerationCheck,
    adminId: string | null,
    context: Record<string, unknown>,
  ) {
    const existing = await this.prisma.csamReport.findFirst({
      where: { check_id: check.id, status: { not: 'failed' } },
    });
    if (existing) return existing;
    const report = await this.prisma.csamReport.create({
      data: { check_id: check.id, created_by: adminId },
    });
    try {
      const r = await this.reporter.submit({
        reportId: report.id,
        checkId: check.id,
        ownerUserId: check.owner_user_id,
        context: {
          ...context,
          purpose: check.purpose,
          fileId: check.file_id,
          videoAssetId: check.video_asset_id,
        },
      });
      return await this.prisma.csamReport.update({
        where: { id: report.id },
        data: {
          status: r.status,
          external_report_id: r.externalReportId ?? null,
          submitted_at: r.status === 'submitted' ? new Date() : null,
        },
      });
    } catch (err) {
      this.logger.error(
        { reportId: report.id, alert: 'csam_report_failed', err: String(err) },
        'CSAM report could not be submitted — file it by hand',
      );
      return this.prisma.csamReport.update({
        where: { id: report.id },
        data: { status: 'failed', error: String(err).slice(0, 500) },
      });
    }
  }
}

/** Any image → JPEG ≤ CHECK_MAX_PX (Rekognition takes JPEG / PNG ≤ 5 MB;
 * smaller is also cheaper to send). */
export async function toCheckJpeg(data: Buffer): Promise<Buffer> {
  return sharp(data, { failOn: 'error' })
    .rotate()
    .resize(CHECK_MAX_PX, CHECK_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function fetchBytes(url: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), THUMBNAIL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`thumbnail HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
