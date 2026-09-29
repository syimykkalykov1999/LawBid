import { Injectable } from '@nestjs/common';
import type { Post, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import type { PostDto } from './dto/posts.dto';

/** Where a viewer may see a post: published, not deleted, author active
 * and not suspended (docs/05 §2.2.4, §12.3). */
export const VISIBLE_POST_WHERE: Prisma.PostWhereInput = {
  status: 'published',
  deleted_at: null,
  author: {
    status: 'active',
    attorney_profile: { verification_status: { not: 'suspended' } },
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
  ) {}

  async present(posts: Post[], viewerId: string): Promise<PostDto[]> {
    if (posts.length === 0) return [];
    const ids = posts.map((p) => p.id);
    const authorIds = [...new Set(posts.map((p) => p.author_id))];
    const [authors, media, likes, saves, tags, pLike, pComment, pSave] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: {
              select: {
                username: true,
                verification_status: true,
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
      ]);
    const urls = await this.files.postImageUrls(media.map((m) => m.file_id));
    const avatars = new Map<string, string | null>();
    await Promise.all(
      authors.map(async (a) =>
        avatars.set(
          a.id,
          (await this.files.avatarUrls(a.avatar_file_id)).url256,
        ),
      ),
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
    return posts.map((p) => {
      const a = authorById.get(p.author_id);
      const prof = a?.attorney_profile;
      return {
        id: p.id,
        author: {
          id: p.author_id,
          username: prof?.username ?? '',
          firstName: a?.first_name ?? null,
          lastName: a?.last_name ?? null,
          avatarUrl: avatars.get(p.author_id) ?? null,
          verifiedBadge:
            prof?.verification_status === 'verified' &&
            (prof.licenses.length ?? 0) > 0,
        },
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
        tags: tagsByPost.get(p.id) ?? [],
        status: p.status,
        likeCount: clamp(p.like_count + (pLike.get(p.id) ?? 0)),
        commentCount: clamp(p.comment_count + (pComment.get(p.id) ?? 0)),
        saveCount: clamp(p.save_count + (pSave.get(p.id) ?? 0)),
        likedByMe: liked.has(p.id),
        savedByMe: saved.has(p.id),
        isMine: p.author_id === viewerId,
        createdAt: p.created_at.toISOString(),
        editedAt: p.edited_at?.toISOString() ?? null,
      };
    });
  }
}
