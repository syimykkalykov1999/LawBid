import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { VideoAsset, VideoAssetStatus } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import {
  BUNNY_TUS_ENDPOINT,
  roundedExpiry,
  signedCdnUrl,
  tusSignature,
} from './bunny-signing';
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
    const maxSec = await this.settings.number('video.max_duration_sec');
    const maxMb = await this.settings.number('video.max_size_mb');
    if (dto.durationSec > maxSec || dto.sizeBytes > maxMb * 1024 * 1024) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VIDEO_TOO_LONG,
        message: `Videos are up to ${maxSec} s and ${maxMb} MB.`,
        details: { maxDurationSec: maxSec, maxSizeMb: maxMb },
      });
    }
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
    await this.costGuard.consume('storage');
    const keys = (await this.bunny.keys())!;
    const guid = await this.bunny.createVideo(dto.title?.trim() || 'LawBid');
    const ttlMin = await this.settings.number('video.upload_ttl_min');
    const expire = Math.floor(Date.now() / 1000) + ttlMin * 60;
    const asset = await this.prisma.videoAsset.create({
      data: {
        owner_user_id: userId,
        library_id: keys.libraryId,
        external_id: guid,
        upload_expires_at: new Date(expire * 1000),
      },
    });
    return {
      videoAssetId: asset.id,
      tusEndpoint: BUNNY_TUS_ENDPOINT,
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
      // The phone said how long it was; Bunny is the truth.
      if (v.length > maxSec + 2) {
        return this.prisma.videoAsset.update({
          where: { id: a.id },
          data: {
            status: 'rejected',
            failure_reason: 'too_long',
            duration_sec: Math.round(v.length),
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
            )
          : null;
      out.set(a.id, {
        status: a.status,
        playbackUrl: sign('playlist.m3u8'),
        thumbnailUrl: sign('thumbnail.jpg'),
        durationSec: a.duration_sec,
        width: a.width,
        height: a.height,
      });
    }
    return out;
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
