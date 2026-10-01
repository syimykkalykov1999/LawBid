import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ContentStatus, File, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { MentionsService } from '../mentions/mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  CounterAggregator,
  profileEntity,
} from '../counters/counter-aggregator.service';
import { FilesService } from '../files/files.service';
import {
  CONTENT_MODERATION_HOOK,
  type ContentModerationHook,
} from '../moderation/content-moderation.hook';
import {
  POSTS_PAGE_DEFAULT,
  type CreatePostDto,
  type UpdatePostDto,
  type PostDto,
  type PostPage,
} from './dto/posts.dto';
import { SubscriptionAlertsService } from '../notifications/subscription-alerts.service';
import { extractHashtags } from './hashtags';
import { PostPresenter, VISIBLE_POST_WHERE } from './post-presenter.service';

export function postNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.POST_NOT_FOUND,
    message: 'Post not found.',
  });
}

/**
 * docs/05 §3 (stage 5.2): attorneys' educational posts — text + up to 10
 * photos, hashtags, text-only edits ("Изменено"), soft delete.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly limits: UsageLimitsService,
    private readonly counters: CounterAggregator,
    private readonly presenter: PostPresenter,
    private readonly mentions: MentionsService,
    @Inject(CONTENT_MODERATION_HOOK)
    private readonly moderation: ContentModerationHook,
    @Optional() private readonly alerts?: SubscriptionAlertsService,
  ) {}

  /** POST /posts (§3.1). */
  async create(user: RequestUser, dto: CreatePostDto): Promise<PostDto> {
    await this.assertCanPost(user);
    // Owner 2026-09-30: News comes from attorneys only.
    const kind = dto.kind ?? 'post';
    if (kind === 'news' && user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.POST_NOT_ALLOWED,
        message: 'Only attorneys publish news.',
      });
    }
    const practice = await this.practiceByCode(dto.practiceCode);
    await this.limits.consume('post_create', user.sub);
    const status = await this.moderate(
      `${dto.title}\n${dto.body}`,
      user.sub,
      'post',
    );
    const fileIds = dto.mediaFileIds ?? [];
    const files: File[] = [];
    for (const id of fileIds) {
      // Own, `post_image`, antivirus-clean (§3.2) — else FILE_NOT_ATTACHABLE.
      files.push(
        await this.files.assertAttachable(user.sub, id, ['post_image']),
      );
    }
    if (fileIds.length > 0) {
      const used = await this.prisma.postMedia.findFirst({
        where: { file_id: { in: fileIds } },
        select: { file_id: true },
      });
      if (used) {
        throw new ConflictException({
          code: ErrorCode.FILE_NOT_ATTACHABLE,
          message: 'This photo is already used in another post.',
          details: { fileId: used.file_id },
        });
      }
    }
    const tags = extractHashtags(dto.body);
    const post = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.post.create({
        data: {
          author_id: user.sub,
          title: dto.title,
          practice_area_id: practice.id,
          kind,
          body: dto.body,
          status,
        },
      });
      if (files.length > 0) {
        await tx.postMedia.createMany({
          data: files.map((f, i) => ({
            post_id: created.id,
            file_id: f.id,
            media_type: 'image' as const,
            position: i,
            width: f.width,
            height: f.height,
          })),
        });
      }
      await this.writeTags(tx, created.id, tags);
      return created;
    });
    if (status === 'published') {
      await this.counters.bump(
        profileEntity(user.role),
        user.sub,
        'posts_count',
        1,
      );
      // OQ-042: tell the people @mentioned in the caption.
      await this.mentions.notify({
        actorId: user.sub,
        text: post.body,
        postId: post.id,
      });
      // Owner 2026-09-30: followers who turned "Following" alerts on.
      const alerts = this.alerts;
      alerts?.later(() => alerts.followersOfPost(user.sub, post.id));
    }
    return (await this.presenter.present([post], user.sub))[0];
  }

  /** PATCH /posts/:id — title, text and qualification; hashtags
   * recomputed, "Изменено". */
  async update(
    user: RequestUser,
    id: string,
    dto: UpdatePostDto,
  ): Promise<PostDto> {
    const current = await this.prisma.post.findFirst({
      where: { id, author_id: user.sub, deleted_at: null },
    });
    if (!current) throw postNotFound();
    const body = dto.body;
    const title = dto.title ?? current.title;
    const practice = dto.practiceCode
      ? await this.practiceByCode(dto.practiceCode)
      : null;
    const verdict = await this.moderate(
      title ? `${title}\n${body}` : body,
      user.sub,
      'post',
    );
    const post = await withTxRetry(this.prisma, async (tx) => {
      const updated = await tx.post.update({
        where: { id },
        data: {
          body,
          title,
          ...(practice ? { practice_area_id: practice.id } : {}),
          edited_at: new Date(),
          // A held edit hides the post; moderation never re-publishes here.
          ...(verdict === 'hidden' ? { status: 'hidden' as const } : {}),
        },
      });
      await tx.postTag.deleteMany({ where: { post_id: id } });
      await this.writeTags(tx, id, extractHashtags(body));
      return updated;
    });
    if (post.status === 'published') {
      // OQ-042: only people newly mentioned by the edit.
      await this.mentions.notify({
        actorId: user.sub,
        text: post.body,
        previousText: current.body,
        postId: id,
      });
    }
    if (current.status === 'published' && post.status !== 'published') {
      await this.counters.bump(
        profileEntity(user.role),
        user.sub,
        'posts_count',
        -1,
      );
    }
    return (await this.presenter.present([post], user.sub))[0];
  }

  /** DELETE /posts/:id — soft delete; gone from every listing (§3.3). */
  async remove(user: RequestUser, id: string): Promise<{ deleted: true }> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, author_id: user.sub, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (count !== 1) throw postNotFound();
    const post = await this.prisma.post.findFirst({
      where: { id },
      select: { status: true },
    });
    if (post?.status === 'published') {
      await this.counters.bump(
        profileEntity(user.role),
        user.sub,
        'posts_count',
        -1,
      );
    }
    return { deleted: true };
  }

  /** GET /posts/:id — the author also sees their own hidden post. */
  async get(user: RequestUser, id: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        deleted_at: null,
        OR: [VISIBLE_POST_WHERE, { author_id: user.sub }],
      },
    });
    if (!post) throw postNotFound();
    return (await this.presenter.present([post], user.sub))[0];
  }

  /** GET /attorneys/:id/posts — newest first (§2.4 profile grid). */
  async listByAttorney(
    user: RequestUser,
    attorneyId: string,
    query: { cursor?: string; limit?: number; kind?: 'post' | 'news' },
  ): Promise<PostPage> {
    const limit = query.limit ?? POSTS_PAGE_DEFAULT;
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    const own = attorneyId === user.sub;
    const rows = await this.prisma.post.findMany({
      where: {
        author_id: attorneyId,
        // Owner 2026-09-30: the profile's News tab.
        ...(query.kind ? { kind: query.kind } : {}),
        ...(own ? { deleted_at: null } : VISIBLE_POST_WHERE),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presenter.present(page, user.sub),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** An active practice category or subcategory (owner 2026-09-30). */
  private async practiceByCode(code: string): Promise<{ id: string }> {
    const area = await this.prisma.practiceArea.findFirst({
      where: { code, is_active: true },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'practiceCode must be an active practice area.',
        details: { field: 'practiceCode' },
      });
    }
    return area;
  }

  private async assertCanPost(user: RequestUser): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        role: true,
        status: true,
        phone_verified_at: true,
        attorney_profile: { select: { verification_status: true } },
        client_profile: { select: { user_id: true } },
      },
    });
    // Verified attorneys; OQ-038: clients with a verified phone too.
    const attorneyOk =
      me?.role === 'attorney' &&
      me.attorney_profile?.verification_status === 'verified';
    const clientOk =
      me?.role === 'client' &&
      me.phone_verified_at != null &&
      me.client_profile != null;
    if (me?.status !== 'active' || !(attorneyOk || clientOk)) {
      throw new ForbiddenException({
        code: ErrorCode.POST_NOT_ALLOWED,
        message: 'Only verified accounts can publish posts.',
      });
    }
  }

  /** §12.2 hook: allow → published, hold → hidden, block → refused. */
  private async moderate(
    text: string,
    authorId: string,
    kind: 'post',
  ): Promise<ContentStatus> {
    const verdict = await this.moderation.check(text, { kind, authorId });
    if (verdict === 'block') {
      throw new UnprocessableEntityException({
        code: ErrorCode.CONTENT_BLOCKED,
        message: 'This content cannot be published.',
      });
    }
    return verdict === 'hold' ? 'hidden' : 'published';
  }

  private async writeTags(
    tx: Prisma.TransactionClient,
    postId: string,
    tags: string[],
  ): Promise<void> {
    if (tags.length === 0) return;
    await tx.tag.createMany({
      data: tags.map((tag_lower) => ({ tag_lower })),
      skipDuplicates: true,
    });
    const rows = await tx.tag.findMany({
      where: { tag_lower: { in: tags } },
      select: { id: true },
    });
    await tx.postTag.createMany({
      data: rows.map((t) => ({ post_id: postId, tag_id: t.id })),
      skipDuplicates: true,
    });
  }
}
