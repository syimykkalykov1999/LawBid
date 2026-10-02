import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VideosService } from '../videos/videos.service';
import { PostsService } from './posts.service';

const BATCH = 100;
/** No webhook for this long → ask Bunny ourselves. */
const POLL_AFTER_MS = 2 * 60_000;
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
  ) {}

  /** The Bunny webhook: never trust the payload — ask Bunny. */
  async onWebhook(guid: string): Promise<void> {
    const asset = await this.videos.findByExternalId(guid);
    if (!asset) return;
    const next = await this.videos.refresh(asset);
    if (next.status !== asset.status) await this.onAssetChanged(next.id);
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
      await this.posts.notifyVideoFailed(post, asset.failure_reason);
    }
  }

  /** Cron `videos.sweep` (every 5 minutes). */
  async sweep(): Promise<Record<string, number>> {
    const now = Date.now();
    const stats = { expired: 0, polled: 0, purged: 0, orphans: 0 };
    // (a) uploads that never arrived.
    const expired = await this.prisma.videoAsset.findMany({
      where: {
        status: 'awaiting_upload',
        upload_expires_at: { lt: new Date(now) },
      },
      take: BATCH,
    });
    for (const a of expired) {
      const next = await this.videos.refresh(a).catch(() => a);
      if (next.status === 'awaiting_upload') {
        await this.prisma.videoAsset.update({
          where: { id: a.id },
          data: { status: 'failed', failure_reason: 'upload_expired' },
        });
      }
      await this.onAssetChanged(a.id);
      stats.expired++;
    }
    // (b) encoding with no webhook yet.
    const stuck = await this.prisma.videoAsset.findMany({
      where: {
        status: 'processing',
        created_at: { lt: new Date(now - POLL_AFTER_MS) },
      },
      take: BATCH,
    });
    for (const a of stuck) {
      let next = await this.videos.refresh(a).catch(() => a);
      if (
        next.status === 'processing' &&
        a.created_at.getTime() < now - GIVE_UP_MS
      ) {
        next = await this.prisma.videoAsset.update({
          where: { id: a.id },
          data: { status: 'failed', failure_reason: 'encoding_timeout' },
        });
      }
      if (next.status !== a.status) await this.onAssetChanged(a.id);
      stats.polled++;
    }
    // (c) uploads nobody attached to a post.
    const orphans = await this.prisma.videoAsset.findMany({
      where: {
        status: { in: ['ready', 'failed', 'rejected'] },
        deleted_at: null,
        post: null,
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
}
