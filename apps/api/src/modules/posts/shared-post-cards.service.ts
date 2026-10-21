import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { activeClientBadgeIds } from '../client-badge/client-badge.util';
import { FilesService } from '../files/files.service';
import { VideosService } from '../videos/videos.service';
import { VISIBLE_POST_WHERE } from './post-presenter.service';

/** Owner 2026-10-21 (Instagram «Поделиться»): who wrote a shared post. */
export class SharedPostAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['attorney', 'client'] })
  role!: 'attorney' | 'client';

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  /** Attorney: verified licence; client: the paid gold check. */
  @ApiProperty()
  verifiedBadge!: boolean;
}

/** Owner 2026-10-21 (Instagram): a post sent into a chat — the card the
 * app draws (tap opens /post/:id). A post deleted, hidden or archived
 * since keeps the row with `available: false` and nothing else. */
export class SharedPostCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: () => SharedPostAuthorDto, nullable: true })
  author!: SharedPostAuthorDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The start of the text (≤200 chars).',
  })
  excerpt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The first photo, or the video cover.',
  })
  thumbnailUrl!: string | null;

  @ApiProperty({ description: 'A video post / reel (the card shows ▶).' })
  isVideo!: boolean;

  @ApiProperty({ description: 'False once the post is gone or hidden.' })
  available!: boolean;
}

const EXCERPT_CHARS = 200;

/**
 * Owner 2026-10-21 (Instagram «Поделиться» → chat): the post cards of a
 * page of chat messages in a fixed number of queries, and the check that a
 * person may share a post at all.
 */
@Injectable()
export class SharedPostCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly videos: VideosService,
  ) {}

  /** True when [viewerId] can see post [postId] (published, not deleted
   * or archived, author active) — their own post always. Blocks are the
   * caller's check. Returns the author id, or null. */
  async sharableAuthor(
    viewerId: string,
    postId: string,
  ): Promise<string | null> {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        OR: [
          VISIBLE_POST_WHERE,
          { author_id: viewerId, deleted_at: null, archived_at: null },
        ],
      },
      select: { author_id: true },
    });
    return post?.author_id ?? null;
  }

  /** postId → card; ids that are not posts any more come back unavailable. */
  async cards(ids: readonly string[]): Promise<Map<string, SharedPostCardDto>> {
    const out = new Map<string, SharedPostCardDto>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return out;
    const posts = await this.prisma.post.findMany({
      where: { ...VISIBLE_POST_WHERE, id: { in: unique } },
      select: {
        id: true,
        title: true,
        body: true,
        video_asset_id: true,
        author: {
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            client_profile: { select: { username: true } },
            attorney_profile: { select: { username: true, trust_badge: true } },
          },
        },
      },
    });
    const postIds = posts.map((p) => p.id);
    const assetIds = posts.flatMap((p) =>
      p.video_asset_id ? [p.video_asset_id] : [],
    );
    const [media, assets, gold] = await Promise.all([
      postIds.length
        ? this.prisma.postMedia.findMany({
            where: { post_id: { in: postIds }, media_type: 'image' },
            orderBy: { position: 'asc' },
            select: { post_id: true, file_id: true },
          })
        : Promise.resolve([]),
      assetIds.length
        ? this.prisma.videoAsset.findMany({ where: { id: { in: assetIds } } })
        : Promise.resolve([]),
      activeClientBadgeIds(
        this.prisma,
        posts.filter((p) => p.author.role === 'client').map((p) => p.author.id),
      ),
    ]);
    const firstImage = new Map<string, string>();
    for (const m of media) {
      if (!firstImage.has(m.post_id)) firstImage.set(m.post_id, m.file_id);
    }
    const coverIds = assets.flatMap((a) =>
      a.cover_file_id ? [a.cover_file_id] : [],
    );
    const [images, avatars, videos] = await Promise.all([
      this.files.postImageUrls([...firstImage.values(), ...coverIds]),
      this.files.avatarUrlsMany(posts.map((p) => p.author.avatar_file_id)),
      this.videos.present(assets),
    ]);
    const assetById = new Map(assets.map((a) => [a.id, a]));
    for (const p of posts) {
      const a = p.author;
      const client = a.role === 'client';
      const asset = p.video_asset_id
        ? assetById.get(p.video_asset_id)
        : undefined;
      const imageId = firstImage.get(p.id);
      const thumb = asset
        ? ((asset.cover_file_id
            ? images.get(asset.cover_file_id)?.mediumUrl
            : undefined) ??
          videos.get(asset.id)?.thumbnailUrl ??
          null)
        : imageId
          ? (images.get(imageId)?.mediumUrl ?? null)
          : null;
      const text = p.body.trim();
      out.set(p.id, {
        id: p.id,
        author: {
          id: a.id,
          role: client ? 'client' : 'attorney',
          username: client
            ? (a.client_profile?.username ?? '')
            : (a.attorney_profile?.username ?? ''),
          firstName: a.first_name,
          lastName: a.last_name,
          avatarUrl: a.avatar_file_id
            ? (avatars.get(a.avatar_file_id)?.url256 ?? null)
            : null,
          verifiedBadge: client
            ? gold.has(a.id)
            : (a.attorney_profile?.trust_badge ?? false),
        },
        title: p.title?.trim() || null,
        excerpt: text ? [...text].slice(0, EXCERPT_CHARS).join('') : null,
        thumbnailUrl: thumb,
        isVideo: asset !== undefined,
        available: true,
      });
    }
    for (const id of unique) {
      if (!out.has(id)) {
        out.set(id, {
          id,
          author: null,
          title: null,
          excerpt: null,
          thumbnailUrl: null,
          isVideo: false,
          available: false,
        });
      }
    }
    return out;
  }
}
