import { activeClientBadgeIds } from '../client-badge/client-badge.util';
import { Injectable } from '@nestjs/common';
import type { Post, Prisma } from '@prisma/client';
import { MentionsService } from '../mentions/mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import { VideosService } from '../videos/videos.service';
import type { PostDto } from './dto/posts.dto';

/** Where a viewer may see a post: published, not deleted, author active
 * and not suspended (docs/05 §2.2.4, §12.3). */
export const VISIBLE_POST_WHERE: Prisma.PostWhereInput = {
  status: 'published',
  deleted_at: null,
  author: {
    status: 'active',
    // OQ-038: clients post too; suspended attorneys never show.
    OR: [
      { role: 'client' },
      { attorney_profile: { verification_status: { not: 'suspended' } } },
    ],
  },
};

/**
 * Turns post rows into PostDto for one viewer in a fixed number of
 * queries per page (authors, media, likes/saves by the viewer, tags,
 * pending counter deltas) — shared by the feed, profiles, tags, search
 * and saved lists.
 */
@Injectable()
export class PostPresenter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly counters: CounterAggregator,
    private readonly mentions: MentionsService,
    private readonly videos: VideosService,
  ) {}

  async present(posts: Post[], viewerId: string): Promise<PostDto[]> {
    if (posts.length === 0) return [];
    const ids = posts.map((p) => p.id);
    const authorIds = [...new Set(posts.map((p) => p.author_id))];
    const [
      authors,
      media,
      likes,
      saves,
      tags,
      pLike,
      pComment,
      pSave,
      pShare,
      follows,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          role: true,
          first_name: true,
          last_name: true,
          avatar_file_id: true,
          phone_verified_at: true,
          client_profile: { select: { username: true } },
          attorney_profile: {
            select: {
              username: true,
              verification_status: true,
              name_mismatch: true,
              licenses: {
                where: { license_status: 'verified' },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.postMedia.findMany({
        where: { post_id: { in: ids }, media_type: 'image' },
        orderBy: { position: 'asc' },
      }),
      this.prisma.postLike.findMany({
        where: { post_id: { in: ids }, user_id: viewerId },
        select: { post_id: true },
      }),
      this.prisma.savedItem.findMany({
        where: { user_id: viewerId, item_type: 'post', item_id: { in: ids } },
        select: { item_id: true },
      }),
      this.prisma.postTag.findMany({
        where: { post_id: { in: ids } },
        select: { post_id: true, tag: { select: { tag_lower: true } } },
      }),
      this.counters.pending('post', 'like_count', ids),
      this.counters.pending('post', 'comment_count', ids),
      this.counters.pending('post', 'save_count', ids),
      this.counters.pending('post', 'share_count', ids),
      // Owner 2026-09-30: the card's Follow button needs the state.
      this.prisma.follow.findMany({
        where: { follower_id: viewerId, followee_id: { in: authorIds } },
        select: { followee_id: true },
      }),
    ]);
    const followed = new Set(follows.map((f) => f.followee_id));
    const urls = await this.files.postImageUrls(media.map((m) => m.file_id));
    const files = await this.files.avatarUrlsMany(
      authors.map((a) => a.avatar_file_id),
    );
    const avatars = new Map<string, string | null>(
      authors.map((a) => [
        a.id,
        a.avatar_file_id ? (files.get(a.avatar_file_id)?.url256 ?? null) : null,
      ]),
    );
    const authorById = new Map(authors.map((a) => [a.id, a]));
    const liked = new Set(likes.map((l) => l.post_id));
    const saved = new Set(saves.map((s) => s.item_id));
    const tagsByPost = new Map<string, string[]>();
    for (const t of tags) {
      const list = tagsByPost.get(t.post_id) ?? [];
      list.push(t.tag.tag_lower);
      tagsByPost.set(t.post_id, list);
    }
    const mediaByPost = new Map<string, typeof media>();
    for (const m of media) {
      const list = mediaByPost.get(m.post_id) ?? [];
      list.push(m);
      mediaByPost.set(m.post_id, list);
    }
    const clamp = (n: number) => Math.max(0, n);
    const mentioned = await this.mentions.resolve(posts.map((p) => p.body));
    // Owner 2026-10-01: reels — signed playback for ready videos.
    const assetIds = posts
      .map((p) => p.video_asset_id)
      .filter((x): x is string => !!x);
    const videos = await this.videos.present(
      assetIds.length
        ? await this.prisma.videoAsset.findMany({
            where: { id: { in: assetIds } },
          })
        : [],
    );
    // Owner 2026-09-30: each post's qualification.
    const practiceIds = [
      ...new Set(
        posts.map((p) => p.practice_area_id).filter((x): x is string => !!x),
      ),
    ];
    const practices = new Map(
      (practiceIds.length
        ? await this.prisma.practiceArea.findMany({
            where: { id: { in: practiceIds } },
            select: { id: true, code: true, name_en: true, i18n_key: true },
          })
        : []
      ).map((a) => [a.id, a]),
    );
    // Owner 2026-10-02: a client's badge is the paid gold one.
    const goldClients = await activeClientBadgeIds(
      this.prisma,
      posts
        .filter((p) => authorById.get(p.author_id)?.role === 'client')
        .map((p) => p.author_id),
    );
    return posts.map((p) => {
      const area = p.practice_area_id
        ? practices.get(p.practice_area_id)
        : undefined;
      const a = authorById.get(p.author_id);
      const prof = a?.attorney_profile;
      const isClient = a?.role === 'client';
      return {
        id: p.id,
        author: {
          id: p.author_id,
          role: isClient ? ('client' as const) : ('attorney' as const),
          username: isClient
            ? (a?.client_profile?.username ?? '')
            : (prof?.username ?? ''),
          firstName: a?.first_name ?? null,
          lastName: a?.last_name ?? null,
          avatarUrl: avatars.get(p.author_id) ?? null,
          // Attorneys: verified licence. Clients (owner 2026-10-02): the
          // paid gold badge only.
          verifiedBadge: isClient
            ? goldClients.has(p.author_id)
            : prof?.verification_status === 'verified' &&
              (prof.licenses.length ?? 0) > 0,
          isFollowing: followed.has(p.author_id),
        },
        title: p.title ?? null,
        kind: p.kind,
        practice: area
          ? {
              code: area.code,
              categoryCode: area.code.split('.')[0],
              nameEn: area.name_en,
              i18nKey: area.i18n_key,
            }
          : null,
        body: p.body,
        media: (mediaByPost.get(p.id) ?? []).flatMap((m) => {
          const u = urls.get(m.file_id);
          return u
            ? [
                {
                  fileId: m.file_id,
                  position: m.position,
                  width: m.width,
                  height: m.height,
                  ...u,
                },
              ]
            : [];
        }),
        video: p.video_asset_id ? (videos.get(p.video_asset_id) ?? null) : null,
        tags: tagsByPost.get(p.id) ?? [],
        mentions: this.mentions.pick(p.body, mentioned),
        status: p.status,
        likeCount: clamp(p.like_count + (pLike.get(p.id) ?? 0)),
        commentCount: clamp(p.comment_count + (pComment.get(p.id) ?? 0)),
        saveCount: clamp(p.save_count + (pSave.get(p.id) ?? 0)),
        shareCount: clamp(p.share_count + (pShare.get(p.id) ?? 0)),
        likedByMe: liked.has(p.id),
        savedByMe: saved.has(p.id),
        isMine: p.author_id === viewerId,
        createdAt: p.created_at.toISOString(),
        editedAt: p.edited_at?.toISOString() ?? null,
      };
    });
  }
}
