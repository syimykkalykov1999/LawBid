import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { VideoAsset, VideoAssetStatus } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
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

/** Bunny's video status → ours. */
export function mapBunnyStatus(
  v: Pick<BunnyVideo, 'status'>,
): 'awaiting_upload' | 'processing' | 'ready' | 'failed' {
  switch (v.status) {
    case 0:
      return 'awaiting_upload';
    case 4:
      return 'ready';
    case 5:
    case 6:
      return 'failed';
    default:
      return 'processing';
  }
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly bunny: BunnyStreamClient,
    private readonly flags: FeatureFlagsService,
    private readonly settings: AppSettingsService,
    private readonly limits: UsageLimitsService,
    private readonly costGuard: CostGuardService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

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
  ): Promise<VideoUploadDto> {
    await this.assertAvailable();
    // Owner 2026-10-05 (plan builder): video posts are a plan term.
    if (
      this.entitlements &&
      !(await this.entitlements.has(userId, 'video_posts'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include video posts.',
      });
    }
    const maxSec = await this.settings.number('video.max_duration_sec');
    const maxMb = await this.settings.number('video.max_size_mb');
    const sourceSec = await this.sourceLimitSec(maxSec);
    const trim = reelTrim(dto, maxSec);
    if (
      dto.durationSec > sourceSec ||
      dto.sizeBytes > maxMb * 1024 * 1024 ||
      trim === 'too_long'
    ) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VIDEO_TOO_LONG,
        message: `Reels are up to ${maxSec} s (cut from a video up to ${sourceSec} s) and ${maxMb} MB.`,
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
    const pending = await this.prisma.videoAsset.count({
      where: {
        owner_user_id: userId,
        status: { in: ['awaiting_upload', 'processing'] },
        post: null,
      },
    });
    if (pending >= (await this.settings.number('video.max_pending_per_user'))) {
      throw new ConflictException({
        code: ErrorCode.VIDEO_NOT_READY,
        message: 'Finish or cancel your other video uploads first.',
      });
    }
    await this.limits.consume('video_upload', userId);
    await this.costGuard.consume('video');
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
        cover_time_ms: coverMs,
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
      return this.prisma.videoAsset.update({
        where: { id: a.id },
        data: { status: 'failed', failure_reason: 'missing_at_provider' },
      });
    }
    const next = mapBunnyStatus(v);
    if (next === a.status) return a;
    if (next === 'ready') {
      const maxSec = await this.settings.number('video.max_duration_sec');
      // The phone said how long it was; Bunny is the truth. A trimmed reel
      // plays ≤ maxSec of a longer source; an untrimmed one is the whole.
      const limit =
        a.trim_end_ms != null ? await this.sourceLimitSec(maxSec) : maxSec;
      if (v.length > limit + 2) {
        return this.prisma.videoAsset.update({
          where: { id: a.id },
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
        return this.prisma.videoAsset.update({
          where: { id: a.id },
          data: {
            status: 'rejected',
            failure_reason: 'too_large',
            storage_bytes: BigInt(Math.round(v.storageSize)),
          },
        });
      }
      return this.prisma.videoAsset.update({
        where: { id: a.id },
        data: {
          status: 'ready',
          duration_sec: Math.round(v.length),
          width: v.width || null,
          height: v.height || null,
          storage_bytes: BigInt(Math.round(v.storageSize || 0)),
          ready_at: new Date(),
        },
      });
    }
    return this.prisma.videoAsset.update({
      where: { id: a.id },
      data: {
        status: next,
        ...(next === 'failed' ? { failure_reason: 'encoding_failed' } : {}),
      },
    });
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
