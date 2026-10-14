import { activeClientBadgeIds } from '../client-badge/client-badge.util';
import { isHiddenTag } from './hidden-tags';
import { Injectable, Optional } from '@nestjs/common';
import { PostAttachmentsPolicy } from './post-attachments.policy';
import type { Post, Prisma } from '@prisma/client';
import { MentionsService } from '../mentions/mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import { VideosService } from '../videos/videos.service';
import type { PostDto, PostReposterDto } from './dto/posts.dto';

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

/** A post without photo, video or documents (a "Brief"). */
export const BRIEF_POST_WHERE: Prisma.PostWhereInput = {
  kind: 'post',
  video_asset_id: null,
  media: { none: {} },
  attachments: { none: {} },
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
    @Optional() private readonly attachmentsPolicy?: PostAttachmentsPolicy,
  ) {}

  /** userId → {id, username} for the "reposted by" line. */
  async reposterNames(
    userIds: string[],
  ): Promise<Map<string, PostReposterDto>> {
    const out = new Map<string, PostReposterDto>();
    if (userIds.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: {
        id: true,
        role: true,
        client_profile: { select: { username: true } },
        attorney_profile: { select: { username: true } },
      },
    });
    for (const u of users) {
      out.set(u.id, {
        id: u.id,
        username:
          (u.role === 'client'
            ? u.client_profile?.username
            : u.attorney_profile?.username) ?? '',
        role: u.role === 'client' ? 'client' : 'attorney',
      });
    }
    return out;
  }

  /** [reposters]: postId → who put it into this list (feed / profile). */
  async present(
    posts: Post[],
    viewerId: string,
    reposters?: Map<string, PostReposterDto>,
  ): Promise<PostDto[]> {
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
      pView,
      follows,
      docs,
      reposts,
      myReposts,
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
          client_profile: { select: { username: true, state_code: true } },
          attorney_profile: {
            select: {
              username: true,
              verification_status: true,
              name_mismatch: true,
              trust_badge: true,
              trust_level: true,
              practice_areas: {
                select: { practice_area: { select: { i18n_key: true } } },
                orderBy: { practice_area: { sort: 'asc' } },
                take: 3,
              },
              licenses: {
                where: { license_status: 'verified' },
                select: { id: true, state_code: true },
                orderBy: { state_code: 'asc' },
                take: 2,
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
      this.counters.pending('post', 'view_count', ids),
      // Owner 2026-09-30: the card's Follow button needs the state.
      this.prisma.follow.findMany({
        where: { follower_id: viewerId, followee_id: { in: authorIds } },
        select: { followee_id: true },
      }),
      // Owner 2026-10-05: documents of the post / reel inner page.
      this.prisma.postAttachment.findMany({
        where: { post_id: { in: ids } },
        orderBy: { position: 'asc' },
      }),
      // Owner 2026-10-07: Threads-style reposts.
      this.prisma.postRepost.groupBy({
        by: ['post_id'],
        where: { post_id: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.postRepost.findMany({
        where: { post_id: { in: ids }, user_id: viewerId },
        select: { post_id: true },
      }),
    ]);
    const repostCounts = new Map(
      reposts.map((r) => [r.post_id, r._count._all]),
    );
    const reposted = new Set(myReposts.map((r) => r.post_id));
    // Owner 2026-10-13: files stay after the author's subscription ends
    // unless the admin switched «keep attachments» off.
    const docAuthors = new Map(posts.map((p) => [p.id, p.author_id]));
    const shownAuthors = this.attachmentsPolicy
      ? await this.attachmentsPolicy.visibleFor(
          docs.map((d) => docAuthors.get(d.post_id) ?? ''),
        )
      : null;
    const visibleDocs = shownAuthors
      ? docs.filter((d) => shownAuthors.has(docAuthors.get(d.post_id) ?? ''))
      : docs;
    const docUrls = await this.files.postAttachmentUrls(
      visibleDocs.map((d) => ({ fileId: d.file_id, fileName: d.file_name })),
    );
    const docsByPost = new Map<string, typeof docs>();
    for (const d of visibleDocs) {
      const list = docsByPost.get(d.post_id) ?? [];
      list.push(d);
      docsByPost.set(d.post_id, list);
    }
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
      if (!isHiddenTag(t.tag.tag_lower)) list.push(t.tag.tag_lower);
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
            : (prof?.trust_badge ?? false),
          isFollowing: followed.has(p.author_id),
          // Owner 2026-10-13: the Identity circle on the avatar and the
          // practices under the name (attorneys only).
          trustLevel: isClient ? 0 : (prof?.trust_level ?? 0),
          practiceI18nKeys: isClient
            ? []
            : (prof?.practice_areas ?? []).map((x) => x.practice_area.i18n_key),
          // Owner 2026-10-13: "role · place" in the inner card's header —
          // an attorney's licensed states (up to two), a client's state.
          location: isClient
            ? (a?.client_profile?.state_code ?? null)
            : (prof?.licenses ?? []).map((l) => l.state_code).join(', ') ||
              null,
        },
        title: p.title ?? null,
        kind: p.kind,
        contentClass: p.content_class === 'legal' ? 'legal' : 'general',
        practice: area
          ? {
              code: area.code,
              categoryCode: area.code.split('.')[0],
              nameEn: area.name_en,
              i18nKey: area.i18n_key,
            }
          : null,
        body: p.body,
        location: p.location_name
          ? {
              name: p.location_name,
              lat: p.location_lat,
              lng: p.location_lng,
            }
          : null,
        commentsEnabled: p.comments_enabled,
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
        attachments: (docsByPost.get(p.id) ?? []).flatMap((d) => {
          const u = docUrls.get(d.file_id);
          return u
            ? [
                {
                  fileId: d.file_id,
                  position: d.position,
                  fileName: d.file_name,
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
        viewCount: clamp(p.view_count + (pView.get(p.id) ?? 0)),
        repostCount: repostCounts.get(p.id) ?? 0,
        likedByMe: liked.has(p.id),
        repostedByMe: reposted.has(p.id),
        repostedBy: reposters?.get(p.id) ?? null,
        savedByMe: saved.has(p.id),
        isMine: p.author_id === viewerId,
        createdAt: p.created_at.toISOString(),
        editedAt: p.edited_at?.toISOString() ?? null,
        pinSlot: p.pin_slot ?? null,
      };
    });
  }
}
