import { Injectable, Logger } from '@nestjs/common';
import type { VideoAsset } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VideosService } from '../videos/videos.service';
import { PostsService } from './posts.service';

const BATCH = 100;
/** No webhook for this long → ask Bunny ourselves. */
const POLL_AFTER_MS = 60_000;
/** Still encoding after this long → give up. */
const GIVE_UP_MS = 3 * 3600_000;
/** An upload nobody attached to a post. */
const ORPHAN_MS = 24 * 3600_000;

/**
 * Owner 2026-10-01 — glue between video assets and posts: a `processing`
 * post goes `published` once its video is ready (side effects exactly
 * once), and the sweep cleans what the webhook missed.
 */
@Injectable()
export class PostVideosService {
  private readonly logger = new Logger(PostVideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly posts: PostsService,
  ) {
    // Prod 2026-11-09: whoever asks Bunny (webhook, sweep, the phone's
    // GET /videos/:id or GET /posts/:id), a stored change reaches the post.
    this.videos.onStatusChange((a) => this.onAssetChanged(a.id));
  }

  /** The Bunny webhook: never trust the payload — ask Bunny. The change
   * reaches the post through [VideosService.onStatusChange]. */
  async onWebhook(guid: string): Promise<void> {
    const asset = await this.videos.findByExternalId(guid);
    if (!asset) return;
    await this.videos.refresh(asset);
  }

  /** Publishes / flags the post that waits for this asset. */
  async onAssetChanged(assetId: string): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) return;
    const post = await this.prisma.post.findFirst({
      where: { video_asset_id: assetId, deleted_at: null },
    });
    if (!post) return;
    if (asset.status === 'ready' && post.status === 'processing') {
      // Conditional: two webhooks in parallel publish once.
      const { count } = await this.prisma.post.updateMany({
        where: { id: post.id, status: 'processing' },
        data: { status: 'published', created_at: new Date() },
      });
      if (count === 1) await this.posts.afterPublish(post.id);
      return;
    }
    if (asset.status === 'failed' || asset.status === 'rejected') {
      // Prod 2026-11-09: said in the log, so a post that never goes live
      // shows why (too_long, too_large, encoding_failed, upload_expired…).
      this.logger.warn(
        `video post ${post.id} not published: video ${asset.id} ${asset.status} (${asset.failure_reason ?? 'no reason'})`,
      );
      await this.posts.notifyVideoFailed(post, asset.failure_reason);
    }
  }

  /** Cron `videos.sweep` (every minute). */
  async sweep(): Promise<Record<string, number>> {
    const now = Date.now();
    const stats = { expired: 0, polled: 0, purged: 0, orphans: 0, healed: 0 };
    // Bunny calls us when a video is ready (polling below is the backup).
    await this.videos.ensureWebhook(now);
    // (a) uploads that never arrived.
    const expired = await this.prisma.videoAsset.findMany({
      where: {
        status: 'awaiting_upload',
        upload_expires_at: { lt: new Date(now) },
      },
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    for (const a of expired) {
      const next = await this.videos
        .refresh(a)
        .catch((e) => this.pollFailed(a, e));
      if (next.status === 'awaiting_upload') {
        const { count } = await this.prisma.videoAsset.updateMany({
          where: { id: a.id, status: 'awaiting_upload' },
          data: { status: 'failed', failure_reason: 'upload_expired' },
        });
        if (count === 1) await this.onAssetChanged(a.id);
      }
      stats.expired++;
    }
    // (b) encoding with no webhook yet. A post already waiting on an
    // `awaiting_upload` asset means the phone finished the upload but no
    // webhook / composer poll moved it on: without this it sat until the
    // upload TTL (an hour) before (a) asked Bunny.
    const stuck = await this.prisma.videoAsset.findMany({
      where: {
        OR: [
          { status: 'processing' },
          { status: 'awaiting_upload', post: { isNot: null } },
        ],
        created_at: { lt: new Date(now - POLL_AFTER_MS) },
      },
      // B-14: oldest first, so a backlog drains instead of the same rows.
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    for (const a of stuck) {
      // A stored change publishes / flags the post (onStatusChange).
      const next = await this.videos
        .refresh(a)
        .catch((e) => this.pollFailed(a, e));
      if (
        next.status === 'processing' &&
        a.created_at.getTime() < now - GIVE_UP_MS
      ) {
        const { count } = await this.prisma.videoAsset.updateMany({
          where: { id: a.id, status: 'processing' },
          data: { status: 'failed', failure_reason: 'encoding_timeout' },
        });
        if (count === 1) await this.onAssetChanged(a.id);
      }
      stats.polled++;
    }
    // (b2) Prod 2026-11-09: a post still `processing` next to a video that
    // is already ready (a crash between the two writes, a post created
    // while the phone's poll marked the video ready) — the polls above
    // never see a ready video again, so publish it here. Two plain
    // queries: posts and videos live in different shard families.
    const waiting = await this.prisma.post.findMany({
      where: {
        status: 'processing',
        deleted_at: null,
        video_asset_id: { not: null },
      },
      select: { video_asset_id: true },
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    const ids = waiting
      .map((p) => p.video_asset_id)
      .filter((id): id is string => id != null);
    if (ids.length > 0) {
      const ready = await this.prisma.videoAsset.findMany({
        where: { id: { in: ids }, status: 'ready' },
        select: { id: true },
      });
      for (const a of ready) {
        await this.onAssetChanged(a.id);
        stats.healed++;
      }
    }
    // (c) uploads nobody attached to a post.
    const orphans = await this.prisma.videoAsset.findMany({
      where: {
        status: { in: ['ready', 'failed', 'rejected'] },
        deleted_at: null,
        post: null,
        // Owner 2026-10-20: a video of a story / channel post is in use.
        story: null,
        channel_post: null,
        created_at: { lt: new Date(now - ORPHAN_MS) },
      },
      select: { id: true },
      take: BATCH,
    });
    await this.videos.markDeleted(orphans.map((o) => o.id));
    stats.orphans = orphans.length;
    // (d) deleted at us, still at Bunny.
    const purge = await this.prisma.videoAsset.findMany({
      where: { status: 'deleted', purged_at: null },
      take: BATCH,
    });
    for (const a of purge) {
      await this.videos.purgeNow(a);
      stats.purged++;
    }
    if (Object.values(stats).some((n) => n > 0)) {
      this.logger.log(`videos.sweep ${JSON.stringify(stats)}`);
    }
    return stats;
  }

  /** A Bunny call that failed is retried next minute — but said once, so
   * a wrong key or an outage is not a silent "processing" forever. */
  private pollFailed(a: VideoAsset, e: unknown): VideoAsset {
    this.logger.warn(
      `videos.sweep: Bunny poll of ${a.id} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return a;
  }
}
