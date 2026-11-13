import { MediaModerationQueue } from '../media-moderation/media-moderation.queue';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { UsageHardStopService } from '../../common/ops/usage/usage-hard-stop.service';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Prisma,
  VideoAsset,
  VideoAssetStatus,
} from '../../generated/prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { roundedExpiry, signedCdnUrl, tusSignature } from './bunny-signing';
import { BunnyStreamClient, type BunnyVideo } from './bunny-stream.client';
import type {
  CreateVideoUploadDto,
  PostVideoDto,
  VideoAssetDto,
  VideoUploadDto,
} from './videos.dto';

export const VIDEO_FLAG = 'video_posts';

const STILL_WAITING_MS = 10 * 60_000;
const WEBHOOK_CHECK_MS = 3600_000;

/**
 * Bunny's video status → ours. Prod 2026-11-09: a post waited for 4
 * (every rendition encoded), which for a long HD phone video is many
 * minutes. Bunny's own rule (stream webhook docs, «Resolution finished»:
 * the first finished resolution means the video is playable): once
 * `availableResolutions` lists one rendition, the HLS playlist plays.
 */
export function mapBunnyStatus(
  v: Pick<BunnyVideo, 'status'> & { availableResolutions?: string | null },
): 'awaiting_upload' | 'processing' | 'ready' | 'failed' {
  switch (v.status) {
    case 0:
      return 'awaiting_upload';
    case 4:
      return 'ready';
    case 5:
    case 6:
      return 'failed';
    case 3:
    case 8:
      return playableRenditions(v.availableResolutions) > 0
        ? 'ready'
        : 'processing';
    default:
      return 'processing';
  }
}

/** "360p,720p" → 2; null / "" → 0. */
function playableRenditions(list: string | null | undefined): number {
  return (list ?? '').split(',').filter((r) => r.trim().length > 0).length;
}

/** Called once per stored status change of a video asset. */
export type VideoAssetListener = (asset: VideoAsset) => Promise<void>;

/**
 * Owner 2026-10-05 — the part of the source a reel plays. null = the
 * whole video; 'invalid' = outside the video or empty; 'too_long' =
 * longer than the reel limit.
 */
export function reelTrim(
  dto: { durationSec: number; trimStartMs?: number; trimEndMs?: number },
  maxSec: number,
): { startMs: number; endMs: number } | null | 'invalid' | 'too_long' {
  if (dto.trimStartMs == null && dto.trimEndMs == null) {
    return dto.durationSec > maxSec ? 'too_long' : null;
  }
  const totalMs = dto.durationSec * 1000;
  const startMs = dto.trimStartMs ?? 0;
  const endMs = Math.min(dto.trimEndMs ?? totalMs, totalMs);
  if (startMs >= endMs || endMs - startMs < 1000) return 'invalid';
  // 1 s of slack: the phone rounds the source length up.
  if (endMs - startMs > maxSec * 1000 + 1000) return 'too_long';
  return { startMs, endMs };
}

/** Seconds the viewer sees: the trimmed part, else the whole video. */
export function playedSec(
  a: Pick<VideoAsset, 'duration_sec' | 'trim_start_ms' | 'trim_end_ms'>,
): number | null {
  if (a.trim_end_ms == null) return a.duration_sec;
  const end =
    a.duration_sec != null
      ? Math.min(a.trim_end_ms, a.duration_sec * 1000)
      : a.trim_end_ms;
  return Math.max(1, Math.round((end - (a.trim_start_ms ?? 0)) / 1000));
}

/**
 * Owner 2026-10-01 — video reels on Bunny Stream. Hidden everywhere until
 * the owner turns `video_posts` on AND adds the Bunny keys in Admin →
 * Integrations. The phone uploads straight to Bunny (TUS); Bunny encodes;
 * the webhook / sweep marks the asset ready; playback URLs are signed.
 */
@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);
  private readonly listeners: VideoAssetListener[] = [];
  private readonly waitingSaid = new Map<string, number>();
  private webhookCheckedAt = 0;
  private webhookWarned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bunny: BunnyStreamClient,
    private readonly flags: FeatureFlagsService,
    private readonly settings: AppSettingsService,
    private readonly limits: UsageLimitsService,
    private readonly costGuard: CostGuardService,
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() private readonly ops?: OpsStateService,
    // Owner 2026-10-22 (audit #4 §5): ready videos get a thumbnail check.
    @Optional() private readonly moderation?: MediaModerationQueue,
    // Cost registry V7: pause new uploads at Bunny's urgent traffic level.
    @Optional() private readonly hardStop?: UsageHardStopService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Prod 2026-11-09: every status change [refresh] stores reaches the
   * post that waits for the video, whoever asked Bunny (webhook, sweep,
   * the composer's GET /videos/:id, GET /posts/:id). Before, only the
   * webhook and the sweep published the post; a ready asset from the
   * other paths left it `processing` for good.
   */
  onStatusChange(fn: VideoAssetListener): void {
    this.listeners.push(fn);
  }

  private async changed(a: VideoAsset): Promise<VideoAsset> {
    for (const fn of this.listeners) {
      await fn(a).catch((e: unknown) =>
        this.logger.warn(`video ${a.id} status listener failed: ${String(e)}`),
      );
    }
    return a;
  }

  /**
   * Prod 2026-11-09: the library's webhook points at us (checked at most
   * once an hour per process; the sweep calls it). Never throws.
   */
  async ensureWebhook(now = Date.now()): Promise<void> {
    if (now - this.webhookCheckedAt < WEBHOOK_CHECK_MS) return;
    this.webhookCheckedAt = now;
    try {
      const keys = await this.bunny.keys();
      const url = keys ? this.bunny.ownWebhookUrl(keys.webhookToken) : null;
      if (!url) return;
      const r = await this.bunny.ensureWebhook(url);
      if (r === 'set')
        this.logger.log('Bunny library webhook URL set to this API');
      if (r === 'no_account_key' && !this.webhookWarned) {
        this.webhookWarned = true;
        this.logger.warn(
          'Bunny webhook URL is not set automatically: save the Account API key (Admin → Integrations → Bunny) or paste the webhook URL in Bunny → Stream → library → API → Webhook URL.',
        );
      }
    } catch (e) {
      this.logger.warn(`Bunny webhook check failed: ${String(e)}`);
    }
  }

  /** The flag is on and every Bunny key is set. */
  async isAvailable(): Promise<boolean> {
    if (!(await this.flags.isEnabled(VIDEO_FLAG, false))) return false;
    return (await this.bunny.keys()) != null;
  }

  async assertAvailable(): Promise<void> {
    if (!(await this.flags.isEnabled(VIDEO_FLAG, false))) {
      throw new ForbiddenException({
        code: ErrorCode.VIDEO_UNAVAILABLE,
        message: 'Video posts are not available yet.',
      });
    }
    if ((await this.bunny.keys()) == null) {
      throw new ServiceUnavailableException({
        code: ErrorCode.VIDEO_UNAVAILABLE,
        message: 'Video is not configured.',
      });
    }
  }

  /** POST /videos/uploads: a Bunny video + TUS credentials. */
  async createUpload(
    userId: string,
    dto: CreateVideoUploadDto,
    opts: { skipEntitlement?: boolean } = {},
  ): Promise<VideoUploadDto> {
    await this.assertAvailable();
    // Owner 2026-10-16 (economy guard): new uploads wait while third-party
    // spend is above the rule; playback of existing videos is untouched.
    if (await this.ops?.isEconomyLimited()) {
      throw new ServiceUnavailableException({
        code: ErrorCode.VIDEO_UNAVAILABLE,
        message:
          'Video uploads are paused for a short while. Please try again later.',
      });
    }
    // Cost registry V7 (owner 2026-10-25, switch scale.bunny_hardstop.mode):
    // Bunny traffic / storage reached the urgent level this month.
    if (await this.hardStop?.stopped('bunny')) {
      throw new ServiceUnavailableException({
        code: ErrorCode.VIDEO_UNAVAILABLE,
        message:
          'Video uploads are paused for a short while. Please try again later.',
      });
    }
    // Owner 2026-10-05 (plan builder): video posts are a plan term.
    // Owner 2026-10-20: stories and channel posts take video from anyone.
    if (
      !opts.skipEntitlement &&
      this.entitlements &&
      !(await this.entitlements.has(userId, 'video_posts'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include video posts.',
      });
    }
    const isPost = dto.kind === 'post';
    const reelSec = await this.reelMaxSec();
    // A video post plays as it is (no cut): its own, longer limit.
    const maxSec = isPost ? await this.postMaxSec(reelSec) : reelSec;
    const maxMb = await this.settings.number('video.max_size_mb');
    const sourceSec = isPost ? maxSec : await this.sourceLimitSec(maxSec);
    const trim = reelTrim(dto, maxSec);
    if (
      dto.durationSec > sourceSec ||
      dto.sizeBytes > maxMb * 1024 * 1024 ||
      trim === 'too_long'
    ) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VIDEO_TOO_LONG,
        message: `${isPost ? 'Video posts' : 'Reels'} are up to ${maxSec} s (cut from a video up to ${sourceSec} s) and ${maxMb} MB.`,
        details: {
          maxDurationSec: maxSec,
          maxSourceDurationSec: sourceSec,
          maxSizeMb: maxMb,
        },
      });
    }
    if (trim === 'invalid') {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The trimmed part is outside the video.',
        details: { field: 'trimStartMs' },
      });
    }
    const coverMs =
      dto.coverTimeMs != null && dto.coverTimeMs <= dto.durationSec * 1000
        ? dto.coverTimeMs
        : (trim?.startMs ?? null);
    // Owner 2026-10-15: a cover from the gallery — the owner's own clean
    // post image; anything else is ignored (the frame is used).
    let coverFileId: string | null = null;
    if (dto.coverFileId) {
      const f = await this.prisma.file.findUnique({
        where: { id: dto.coverFileId },
        select: { owner_user_id: true, purpose: true, scan_status: true },
      });
      if (
        !f ||
        f.owner_user_id !== userId ||
        f.purpose !== 'post_image' ||
        f.scan_status !== 'clean'
      ) {
        throw new UnprocessableEntityException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The cover image cannot be used.',
          details: { field: 'coverFileId' },
        });
      }
      coverFileId = dto.coverFileId;
    }
    // B-13: count -> create is not atomic; a short per-person lock stops
    // parallel requests from slipping past video.max_pending_per_user.
    const unlock = await this.lockUploadStart(userId);
    try {
      const pending = await this.prisma.videoAsset.count({
        where: {
          owner_user_id: userId,
          status: { in: ['awaiting_upload', 'processing'] },
          post: null,
        },
      });
      if (
        pending >= (await this.settings.number('video.max_pending_per_user'))
      ) {
        throw new ConflictException({
          code: ErrorCode.VIDEO_NOT_READY,
          message: 'Finish or cancel your other video uploads first.',
        });
      }
      await this.limits.consume('video_upload', userId);
      // Owner 2026-10-22 (audit #4 §6): priced per minute of video.
      await this.costGuard.consume('video', 1, {
        userId,
        seconds: dto.durationSec,
      });
      const keys = (await this.bunny.keys())!;
      const guid = await this.bunny.createVideo(
        dto.title?.trim() || 'LawBid',
        coverMs,
      );
      const ttlMin = await this.settings.number('video.upload_ttl_min');
      const expire = Math.floor(Date.now() / 1000) + ttlMin * 60;
      const asset = await this.prisma.videoAsset.create({
        data: {
          owner_user_id: userId,
          library_id: keys.libraryId,
          external_id: guid,
          upload_expires_at: new Date(expire * 1000),
          trim_start_ms: trim?.startMs ?? null,
          trim_end_ms: trim?.endMs ?? null,
          // The declared length: the check against Bunny's real length
          // (refresh) picks the reel or the post limit by it.
          duration_sec: dto.durationSec,
          cover_time_ms: coverMs,
          cover_file_id: coverFileId,
        },
      });
      return {
        videoAssetId: asset.id,
        tusEndpoint: this.bunny.tusEndpoint(),
        libraryId: keys.libraryId,
        videoId: guid,
        authorizationSignature: tusSignature(
          keys.libraryId,
          keys.apiKey,
          expire,
          guid,
        ),
        authorizationExpire: expire,
        maxDurationSec: maxSec,
      };
    } finally {
      await unlock();
    }
  }

  /** Per-person lock around "count pending -> create asset" (fails open
   * without Redis; auto-expires in 20 s). */
  private async lockUploadStart(userId: string): Promise<() => Promise<void>> {
    const redis = this.redis;
    if (!redis) return () => Promise.resolve();
    const key = `video:init:${userId}`;
    let got: string | null;
    try {
      got = await redis.set(key, '1', 'EX', 20, 'NX');
    } catch {
      return () => Promise.resolve();
    }
    if (got !== 'OK') {
      throw new ConflictException({
        code: ErrorCode.VIDEO_NOT_READY,
        message: 'Another video upload is being prepared. Try again.',
      });
    }
    return async () => {
      await redis.del(key).catch(() => undefined);
    };
  }

  /**
   * Owner 2026-10-20: my finished upload that no post, story or channel
   * post uses yet (what a story / channel post may attach).
   */
  async takeReady(userId: string, id: string): Promise<VideoAsset> {
    const a = await this.prisma.videoAsset.findFirst({
      where: { id, owner_user_id: userId, deleted_at: null },
      include: {
        post: { select: { id: true } },
        story: { select: { id: true } },
        channel_post: { select: { id: true } },
      },
    });
    if (!a) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Video not found.',
      });
    }
    if (a.post || a.story || a.channel_post) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This video is already used.',
      });
    }
    if (a.status !== 'ready') {
      throw new ConflictException({
        code: ErrorCode.VIDEO_NOT_READY,
        message: 'The video is still being processed.',
      });
    }
    return a;
  }

  /** GET /videos/:id — the composer polls its own upload. */
  async getOwn(userId: string, id: string): Promise<VideoAssetDto> {
    const a = await this.own(userId, id);
    if (a.status === 'awaiting_upload' || a.status === 'processing') {
      const next = await this.refresh(a).catch(() => null);
      if (next) return this.toAssetDto(next);
    }
    return this.toAssetDto(a);
  }

  /** DELETE /videos/:id — only while no post uses it. */
  async cancel(userId: string, id: string): Promise<void> {
    const a = await this.own(userId, id);
    const used = await this.prisma.post.findFirst({
      where: { video_asset_id: id },
      select: { id: true },
    });
    if (used) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This video belongs to a post; delete the post instead.',
      });
    }
    await this.markDeleted([a.id]);
    await this.purgeNow(a);
  }

  /** Asks Bunny and stores the transition. Returns the updated row. */
  async refresh(a: VideoAsset): Promise<VideoAsset> {
    if (['ready', 'failed', 'rejected', 'deleted'].includes(a.status)) {
      return a;
    }
    const v = await this.bunny.getVideo(a.external_id);
    if (!v) {
      return this.store(a, {
        data: { status: 'failed', failure_reason: 'missing_at_provider' },
      });
    }
    const next = mapBunnyStatus(v);
    if (next === a.status) {
      this.sayStillWaiting(a, v);
      return a;
    }
    if (next === 'ready') {
      const maxSec = await this.reelMaxSec();
      // The phone said how long it was; Bunny is the truth. A trimmed reel
      // plays ≤ maxSec of a longer source; an untrimmed one is the whole;
      // a video post (declared longer than a reel) has its own limit.
      const limit =
        a.trim_end_ms != null
          ? await this.sourceLimitSec(maxSec)
          : (a.duration_sec ?? 0) > maxSec
            ? await this.postMaxSec(maxSec)
            : maxSec;
      if (v.length > limit + 2) {
        return this.store(a, {
          data: {
            status: 'rejected',
            failure_reason: 'too_long',
            duration_sec: Math.round(v.length),
          },
        });
      }
      // The phone also declared the size; a TUS upload can be far bigger.
      // 3× leaves room for the encoded renditions Bunny stores alongside.
      const maxMb = await this.settings.number('video.max_size_mb');
      if ((v.storageSize || 0) > 3 * maxMb * 1024 * 1024) {
        return this.store(a, {
          data: {
            status: 'rejected',
            failure_reason: 'too_large',
            storage_bytes: BigInt(Math.round(v.storageSize)),
          },
        });
      }
      const ready = await this.store(a, {
        data: {
          status: 'ready',
          duration_sec: Math.round(v.length),
          width: v.width || null,
          height: v.height || null,
          storage_bytes: BigInt(Math.round(v.storageSize || 0)),
          ready_at: new Date(),
        },
      });
      // Owner 2026-10-22 (audit #4 §5): its thumbnail is checked.
      if (ready.status === 'ready')
        await this.moderation?.enqueueVideo(ready.id);
      return ready;
    }
    return this.store(a, {
      data: {
        status: next,
        ...(next === 'failed' ? { failure_reason: 'encoding_failed' } : {}),
      },
    });
  }

  /**
   * Prod 2026-11-09: a video still not playable after 10 min says what
   * Bunny answers (status, renditions, progress), at most every 10 min.
   */
  private sayStillWaiting(a: VideoAsset, v: BunnyVideo): void {
    const age =
      a.created_at instanceof Date ? Date.now() - a.created_at.getTime() : 0;
    if (age < STILL_WAITING_MS) return;
    const last = this.waitingSaid.get(a.id) ?? 0;
    if (Date.now() - last < STILL_WAITING_MS) return;
    if (this.waitingSaid.size > 1000) this.waitingSaid.clear();
    this.waitingSaid.set(a.id, Date.now());
    this.logger.warn(
      `video ${a.id} not playable after ${Math.round(age / 60_000)} min: Bunny status ${v.status}, renditions "${v.availableResolutions ?? ''}", progress ${v.encodeProgress ?? '?'}%`,
    );
  }

  /**
   * Stores a transition only from the status [a] was read with, so two
   * callers asking Bunny at once (webhook + sweep + the phone) store it
   * and tell the listeners exactly once; the loser gets the fresh row.
   */
  private async store(
    a: VideoAsset,
    args: { data: Prisma.VideoAssetUpdateManyMutationInput },
  ): Promise<VideoAsset> {
    const { count } = await this.prisma.videoAsset.updateMany({
      where: { id: a.id, status: a.status },
      data: args.data,
    });
    const row =
      (await this.prisma.videoAsset.findUnique({ where: { id: a.id } })) ?? a;
    return count === 1 ? this.changed(row) : row;
  }

  async findByExternalId(guid: string): Promise<VideoAsset | null> {
    return this.prisma.videoAsset.findUnique({ where: { external_id: guid } });
  }

  /** Marks assets deleted; the sweep purges them at Bunny. */
  async markDeleted(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.videoAsset.updateMany({
      where: { id: { in: ids }, deleted_at: null },
      data: { status: 'deleted', deleted_at: new Date() },
    });
  }

  /** Best effort: delete at Bunny now; the sweep retries on failure. */
  async purgeNow(a: Pick<VideoAsset, 'id' | 'external_id'>): Promise<void> {
    try {
      await this.bunny.deleteVideo(a.external_id);
      await this.prisma.videoAsset.update({
        where: { id: a.id },
        data: { purged_at: new Date() },
      });
    } catch (e) {
      this.logger.warn(`Bunny delete deferred for ${a.id}: ${String(e)}`);
    }
  }

  /** PostVideoDto per asset id; URLs only when ready and available. */
  async present(assets: VideoAsset[]): Promise<Map<string, PostVideoDto>> {
    const out = new Map<string, PostVideoDto>();
    if (assets.length === 0) return out;
    const keys = (await this.isAvailable()) ? await this.bunny.keys() : null;
    const ttl = await this.settings.number('video.playback_ttl_sec');
    const expires = roundedExpiry(Date.now(), ttl);
    for (const a of assets) {
      const sign = (file: string) =>
        keys && a.status === 'ready'
          ? signedCdnUrl(
              keys.cdnHostname,
              keys.tokenAuthKey,
              a.external_id,
              file,
              expires,
              this.bunny.cdnScheme(),
            )
          : null;
      out.set(a.id, {
        status: a.status,
        playbackUrl: sign('playlist.m3u8'),
        fallbackUrl: sign('play_720p.mp4'),
        thumbnailUrl: sign('thumbnail.jpg'),
        durationSec: playedSec(a),
        width: a.width,
        height: a.height,
        trimStartMs: a.trim_start_ms,
        trimEndMs: a.trim_end_ms,
      });
    }
    return out;
  }

  /**
   * `video.reel_max_duration_sec`; an admin who saved only the old single
   * `video.max_duration_sec` keeps it as the reel limit. Feature reality
   * audit 2026-11-08: with both saved, the one changed last wins (the admin
   * page still shows the old key; before, editing it did nothing once the
   * new key existed).
   */
  async reelMaxSec(): Promise<number> {
    const reel = await this.settings.storedNumber(
      'video.reel_max_duration_sec',
    );
    const legacy = await this.settings.storedNumber('video.max_duration_sec');
    if (reel !== null && legacy !== null && reel !== legacy) {
      const rows = await this.prisma.appConfig
        .findMany({
          where: {
            key: {
              in: ['video.reel_max_duration_sec', 'video.max_duration_sec'],
            },
          },
          select: { key: true, updated_at: true },
        })
        .catch(() => []);
      const at = (k: string) =>
        rows.find((r) => r.key === k)?.updated_at.getTime() ?? 0;
      return at('video.max_duration_sec') > at('video.reel_max_duration_sec')
        ? legacy
        : reel;
    }
    return (
      reel ??
      legacy ??
      (await this.settings.number('video.reel_max_duration_sec'))
    );
  }

  /** `video.post_max_duration_sec`, never below the reel limit. */
  async postMaxSec(reelSec: number): Promise<number> {
    return Math.max(
      reelSec,
      await this.settings.number('video.post_max_duration_sec'),
    );
  }

  /** `video.max_source_duration_sec`, never below the reel limit. */
  private async sourceLimitSec(maxSec: number): Promise<number> {
    return Math.max(
      maxSec,
      await this.settings.number('video.max_source_duration_sec'),
    );
  }

  toAssetDto(a: VideoAsset): VideoAssetDto {
    return {
      id: a.id,
      status: a.status,
      durationSec: a.duration_sec,
      failureReason: a.failure_reason,
    };
  }

  private async own(userId: string, id: string): Promise<VideoAsset> {
    const a = await this.prisma.videoAsset.findFirst({
      where: { id, owner_user_id: userId, deleted_at: null },
    });
    if (!a) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Video not found.',
      });
    }
    return a;
  }

  /** Statuses a post may be created with. */
  static attachable(s: VideoAssetStatus): boolean {
    return s === 'awaiting_upload' || s === 'processing' || s === 'ready';
  }
}
