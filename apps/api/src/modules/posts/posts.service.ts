import { onlyDeleted } from '../../prisma/soft-delete.extension';
import { PromotionDeliveryService } from '../promotions/promotion-delivery.service';

import { DomainEvents } from '../events/domain-events.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
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
import type { ContentStatus, File, Post, Prisma } from '@prisma/client';
import { classifyPost, isPostContentClass } from './content-filter.service';
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
import { assertUploadCount, type UploadPlace } from '../files/upload-limits';
import {
  CONTENT_MODERATION_HOOK,
  type ContentModerationHook,
} from '../moderation/content-moderation.hook';
import {
  POSTS_PAGE_DEFAULT,
  type CreatePostDto,
  type UpdatePostDto,
  type PostCountersDto,
  type PostDto,
  type PostPage,
  type PostMediaFilter,
} from './dto/posts.dto';
import { SubscriptionAlertsService } from '../notifications/subscription-alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VideosService } from '../videos/videos.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import {
  hiddenTagsFor,
  legacyTopicTags,
  postPracticeWhere,
} from './hidden-tags';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { cachedBlockSet } from '../blocks/block-set.cache';
import { extractHashtags } from './hashtags';
import { PostAttachmentsPolicy } from './post-attachments.policy';
import {
  BRIEF_POST_WHERE,
  PostPresenter,
  VISIBLE_POST_WHERE,
} from './post-presenter.service';
import { userDirectory } from '../../sharding/user-directory';

/** A display/download name without path parts or control characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'document').slice(0, 120);
}

/** Owner 2026-10-06: the whole News system, off by default. */
export const NEWS_FLAG = 'news_posts';

/** Owner 2026-10-18 (profile tabs Посты | Рилсы | Брифы): which posts a
 * media filter keeps — the same split as the app's PostCard.isThreadsStyle. */
export function postMediaWhere(
  media: PostMediaFilter | undefined,
): Prisma.PostWhereInput {
  switch (media) {
    case 'video':
      return { video_asset_id: { not: null } };
    case 'visual':
      // AND, not OR: the caller's cursor clause is an OR of its own.
      return {
        video_asset_id: null,
        AND: [{ OR: [{ media: { some: {} } }, { attachments: { some: {} } }] }],
      };
    case 'text':
      return {
        video_asset_id: null,
        media: { none: {} },
        attachments: { none: {} },
      };
    default:
      return {};
  }
}

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
    private readonly videos: VideosService,
    private readonly notifications: NotificationsService,
    private readonly attachmentsPolicy: PostAttachmentsPolicy,
    private readonly settings: AppSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly alerts?: SubscriptionAlertsService,
    @Optional() private readonly promoDelivery?: PromotionDeliveryService,
    @Optional() private readonly flags?: FeatureFlagsService,
    // N-2: the domain-event bus.
    @Optional() private readonly events?: DomainEvents,
  ) {}

  /** Owner 2026-10-06: News is switched off for now (flag `news_posts`,
   * default off): the code stays, a News post lands as a regular legal
   * post (older apps and approved assistant requests keep working). */
  async newsEnabled(): Promise<boolean> {
    return (await this.flags?.isEnabled(NEWS_FLAG, false)) ?? false;
  }

  /** The text limit of a post with files, or of a text-only brief. */
  private async maxChars(withFiles: boolean): Promise<number> {
    return this.settings.number(
      withFiles ? 'post.max_chars_media' : 'post.max_chars_brief',
    );
  }

  /** POST /posts (§3.1). */
  async create(user: RequestUser, dto: CreatePostDto): Promise<PostDto> {
    await this.assertCanPost(user);
    // Owner 2026-09-30: News comes from attorneys only.
    let kind = dto.kind ?? 'post';
    if (kind === 'news' && user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.POST_NOT_ALLOWED,
        message: 'Only attorneys publish news.',
      });
    }
    // Owner 2026-10-06: News off → the same text as a legal post.
    const newsOff = kind === 'news' && !(await this.newsEnabled());
    if (newsOff) kind = 'post';
    const practice = dto.practiceCode
      ? await this.practiceByCode(dto.practiceCode)
      : null;
    // Owner 2026-10-15: a post with photos, a video or documents is up to
    // `post.max_chars_media` (2200); a text-only brief up to
    // `post.max_chars_brief` (3000). Both are set in the admin panel.
    const hasFiles =
      (dto.mediaFileIds?.length ?? 0) > 0 ||
      (dto.attachments?.length ?? 0) > 0 ||
      !!dto.videoAssetId;
    const maxChars = await this.maxChars(hasFiles);
    if (dto.body.length > maxChars) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A ${hasFiles ? 'post with files' : 'brief'} is up to ${maxChars} characters.`,
        details: { field: 'body', maxChars },
      });
    }
    // Owner 2026-10-18: the title and the text are optional when photos, a
    // video or files are attached (Instagram / TikTok); an empty post is not.
    assertNotEmptyPost(dto.title, dto.body, hasFiles);
    // Owner 2026-10-13: documents need the right to attach (the admin's
    // setting + plan). Owner 2026-10-16: photos (up to the admin's count,
    // 9) and a reel's video never do.
    if ((dto.attachments?.length ?? 0) > 0) {
      await this.attachmentsPolicy.assertCanAttach(user.sub);
    }
    const video = dto.videoAssetId
      ? await this.attachableVideo(user.sub, dto.videoAssetId)
      : null;
    await this.limits.consume('post_create', user.sub);
    // Owner 2026-10-22 (audit #4 §6): and a burst cap per hour.
    await this.limits.consume('post_create_hourly', user.sub);
    const verdict = await this.moderate(
      `${dto.title}\n${dto.body}`,
      user.sub,
      'post',
    );
    // Owner 2026-10-01: a reel waits for its video; a held one stays hidden.
    const status: ContentStatus =
      video && verdict === 'published' && video.status !== 'ready'
        ? 'processing'
        : verdict;
    const fileIds = dto.mediaFileIds ?? [];
    // Owner 2026-10-07 (bug 17): counts, formats and MB of a post or a
    // reel come from «Загрузки и файлы» in the admin panel.
    const place = video ? 'reel' : 'post';
    const upload = await this.files.uploadLimits();
    assertUploadCount(upload, place, 'photos', fileIds.length);
    assertUploadCount(upload, place, 'files', dto.attachments?.length ?? 0);
    const files: File[] = [];
    for (const id of fileIds) {
      // Own, `post_image`, antivirus-clean (§3.2) — else FILE_NOT_ATTACHABLE.
      const file = await this.files.assertAttachable(user.sub, id, [
        'post_image',
      ]);
      await this.files.assertFitsPlace(place, file);
      files.push(file);
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
    const attachments = await this.attachableDocuments(
      user.sub,
      dto.attachments ?? [],
      place,
      upload[place].totalMb,
    );
    const tags = extractHashtags(dto.body);
    const createPost = (st: ContentStatus) =>
      withTxRetry(this.prisma, async (tx) => {
        const created = await tx.post
          .create({
            data: {
              author_id: user.sub,
              // Owner 2026-10-18: a title typed in the composer is stored
              // as is; '' = the author chose no title (the app then shows
              // the description only). Not sent at all = NULL (older
              // clients: the first line is the title).
              title: dto.title === undefined ? null : dto.title.trim(),
              practice_area_id: practice?.id ?? null,
              kind,
              // Owner 2026-10-05: legal vs general (personal) post.
              content_class: classifyPost({
                hasPractice: !!practice,
                kind,
                // An assistant's approved request arrives unvalidated.
                requested: newsOff
                  ? 'legal'
                  : isPostContentClass(dto.contentClass)
                    ? dto.contentClass
                    : undefined,
              }),
              body: dto.body,
              status: st,
              video_asset_id: video?.id ?? null,
              location_name: dto.location?.name ?? null,
              location_lat: dto.location?.lat ?? null,
              location_lng: dto.location?.lng ?? null,
              comments_enabled: dto.commentsEnabled ?? true,
              hide_likes: dto.hideLikes ?? false,
              hide_views: dto.hideViews ?? false,
            },
          })
          .catch((e: unknown) => {
            if ((e as { code?: string }).code === 'P2002') {
              throw new ConflictException({
                code: ErrorCode.FILE_NOT_ATTACHABLE,
                message: 'This video is already used in another post.',
              });
            }
            throw e;
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
        if (attachments.length > 0) {
          await tx.postAttachment.createMany({
            data: attachments.map((a, i) => ({
              post_id: created.id,
              file_id: a.fileId,
              file_name: a.fileName,
              position: i,
            })),
          });
        }
        await this.writeTags(tx, created.id, [
          ...tags,
          ...hiddenTagsFor(practice?.code),
        ]);
        return created;
      });
    let post;
    let finalStatus = status;
    try {
      post = await createPost(status);
    } catch (e) {
      // A database whose `processing` value is stuck half-added (a damaged
      // restore; never on a database built by the migrations): the reel is
      // published at once and its player shows "processing" until the
      // video is ready.
      if (
        status === 'processing' &&
        /enum value .*processing.* not yet public|not yet public/i.test(
          String((e as Error)?.message),
        )
      ) {
        finalStatus = 'published';
        post = await createPost('published');
      } else {
        throw e;
      }
    }
    if (finalStatus === 'published') await this.afterPublish(post.id);
    return (await this.presenter.present([post], user.sub))[0];
  }

  /** Counters, @mentions and follower alerts — once, when a post goes
   * public (at create, or when its video is ready). */
  async afterPublish(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        body: true,
        author_id: true,
        kind: true,
        video_asset_id: true,
        archived_at: true,
        _count: { select: { media: true, attachments: true } },
      },
    });
    // Owner 2026-10-18: an archived post is not public (it counts and
    // alerts when the author shows it in the profile again).
    if (!post || post.archived_at) return;
    // Shard-ready step 6: the author's role from the user directory.
    const author = await userDirectory(this.prisma).one(post.author_id, {
      role: true,
    });
    await this.counters.bump(
      profileEntity(author?.role === 'client' ? 'client' : 'attorney'),
      post.author_id,
      'posts_count',
      1,
    );
    // OQ-042: tell the people @mentioned in the caption.
    await this.mentions.notify({
      actorId: post.author_id,
      text: post.body,
      postId: post.id,
    });
    // Owner 2026-09-30: followers who turned "Following" alerts on.
    const alerts = this.alerts;
    // Owner 2026-10-12: a text-only post is a "Brief"; the alert says so.
    const brief =
      post.kind === 'post' &&
      !post.video_asset_id &&
      post._count.media === 0 &&
      post._count.attachments === 0;
    alerts?.later(() => alerts.followersOfPost(post.author_id, post.id, brief));
    await this.events?.record(
      'post.published',
      { postId: post.id, authorId: post.author_id },
      { actorId: post.author_id, key: `post.published:${post.id}` },
    );
  }

  /** Owner 2026-10-01: the reel's video could not be used. */
  async notifyVideoFailed(
    post: { id: string; author_id: string },
    reason: string | null,
  ): Promise<void> {
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: post.author_id,
      payload: { reason: `video_${reason ?? 'failed'}`, postId: post.id },
    });
  }

  /**
   * Owner 2026-10-05: documents of a post — own, `post_attachment`,
   * antivirus-clean, not in another post, of a format and size [place]
   * allows, together under [maxMb] (admin «Загрузки и файлы», bug 17).
   */
  private async attachableDocuments(
    userId: string,
    input: { fileId: string; fileName: string }[],
    place: UploadPlace,
    maxMb: number,
  ): Promise<{ fileId: string; fileName: string }[]> {
    if (input.length === 0) return [];
    const ids = input.map((a) => a.fileId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The same document is attached twice.',
        details: { field: 'attachments' },
      });
    }
    let total = 0;
    for (const id of ids) {
      const f = await this.files.assertAttachable(userId, id, [
        'post_attachment',
      ]);
      await this.files.assertFitsPlace(place, f);
      total += Number(f.size_bytes);
    }
    if (total > maxMb * 1024 * 1024) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TOO_LARGE,
        message: `Documents of one post are up to ${maxMb} MB together.`,
        details: { maxTotalMb: maxMb },
      });
    }
    const used = await this.prisma.postAttachment.findFirst({
      where: { file_id: { in: ids } },
      select: { file_id: true },
    });
    if (used) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This document is already used in another post.',
        details: { fileId: used.file_id },
      });
    }
    return input.map((a) => ({
      fileId: a.fileId,
      fileName: safeFileName(a.fileName),
    }));
  }

  /** Own, unused, still usable — else a clear error. */
  private async attachableVideo(userId: string, assetId: string) {
    await this.videos.assertAvailable();
    const asset = await this.prisma.videoAsset.findFirst({
      where: { id: assetId, owner_user_id: userId, deleted_at: null },
    });
    if (!asset) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'Upload the video first.',
      });
    }
    if (!VideosService.attachable(asset.status)) {
      throw new ConflictException({
        code: ErrorCode.VIDEO_NOT_READY,
        message: 'This video could not be processed.',
        details: { status: asset.status },
      });
    }
    return asset;
  }

  /** PATCH /posts/:id — title, text and qualification; hashtags
   * recomputed, "Изменено". */
  /** Owner 2026-10-15: the author hides / shows the like and view counters. */
  async setCounters(
    user: RequestUser,
    id: string,
    dto: PostCountersDto,
  ): Promise<PostDto> {
    const current = await this.prisma.post.findFirst({
      where: { id, author_id: user.sub, deleted_at: null },
      select: { id: true },
    });
    if (!current) throw postNotFound();
    await this.prisma.post.update({
      where: { id },
      data: {
        ...(dto.hideLikes === undefined ? {} : { hide_likes: dto.hideLikes }),
        ...(dto.hideViews === undefined ? {} : { hide_views: dto.hideViews }),
      },
    });
    return this.get(user, id);
  }

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
    // Older posts longer than today's limit are never cut: only an edit
    // that makes the text longer than both the limit and the old text is
    // refused.
    const files =
      (await this.prisma.postMedia.count({ where: { post_id: id } })) +
      (await this.prisma.postAttachment.count({ where: { post_id: id } })) +
      (current.video_asset_id ? 1 : 0);
    const maxChars = await this.maxChars(files > 0);
    if (body.length > maxChars && body.length > current.body.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A ${files > 0 ? 'post with files' : 'brief'} is up to ${maxChars} characters.`,
        details: { field: 'body', maxChars },
      });
    }
    // Owner 2026-10-18: '' clears the title ('' = no title, see create).
    const title = dto.title === undefined ? current.title : dto.title.trim();
    // Owner 2026-10-18: an edit may clear the title and the text only while
    // the post keeps photos, a video or files.
    assertNotEmptyPost(title, body, files > 0);
    const practice = dto.practiceCode
      ? await this.practiceByCode(dto.practiceCode)
      : null;
    // The hidden tags follow the qualification the post ends up with.
    const practiceCode =
      practice?.code ??
      (current.practice_area_id
        ? (
            await this.prisma.practiceArea.findUnique({
              where: { id: current.practice_area_id },
              select: { code: true },
            })
          )?.code
        : undefined);
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
          // A moderator's classification stays; otherwise the topic (or
          // the author's choice) decides again.
          ...(current.content_class_locked
            ? {}
            : {
                content_class: classifyPost({
                  hasPractice: !!(practice ?? current.practice_area_id),
                  kind: current.kind,
                  requested:
                    dto.contentClass ??
                    (isPostContentClass(current.content_class)
                      ? current.content_class
                      : undefined),
                }),
              }),
          ...(dto.commentsEnabled === undefined
            ? {}
            : { comments_enabled: dto.commentsEnabled }),
          edited_at: new Date(),
          // A held edit hides the post; moderation never re-publishes here.
          ...(verdict === 'hidden' ? { status: 'hidden' as const } : {}),
        },
      });
      await tx.postTag.deleteMany({ where: { post_id: id } });
      await this.writeTags(tx, id, [
        ...extractHashtags(body),
        ...hiddenTagsFor(practiceCode),
      ]);
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
    if (
      current.status === 'published' &&
      post.status !== 'published' &&
      !current.archived_at
    ) {
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
      data: { deleted_at: new Date(), pin_slot: null, pin_group: null },
    });
    if (count !== 1) throw postNotFound();
    // Owner 2026-10-26 (ROOT CAUSE): the row is soft-deleted now, and every
    // read hides soft-deleted rows, so this lookup came back empty: the
    // profile counter never dropped (and the reel's video was never
    // purged). Read it with onlyDeleted().
    const post = await this.prisma.post.findFirst({
      where: onlyDeleted({ id }),
      select: { status: true, video_asset_id: true, archived_at: true },
    });
    // The counter drops BEFORE the video purge (a purge error must not
    // leave it stale). An archived post is already out of the count.
    if (post?.status === 'published' && !post.archived_at) {
      await this.counters.bump(
        profileEntity(user.role),
        user.sub,
        'posts_count',
        -1,
      );
    }
    // Owner 2026-10-01: the reel's video goes with the post.
    if (post?.video_asset_id) {
      await this.videos.markDeleted([post.video_asset_id]);
      const asset = await this.prisma.videoAsset.findUnique({
        where: { id: post.video_asset_id },
      });
      if (asset) await this.videos.purgeNow(asset);
    }
    return { deleted: true };
  }

  /** Owner 2026-10-12: pins an own post to slot 1..3 of its list (posts
   * with files, or text-only briefs). A taken slot is not refused: the post
   * that held it takes the pinned post's old slot, or loses its pin. */
  async pin(user: RequestUser, id: string, slot: number): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        author_id: user.sub,
        deleted_at: null,
        archived_at: null,
        status: 'published',
        kind: 'post',
      },
    });
    if (!post) throw postNotFound();
    const brief =
      (await this.prisma.post.count({
        where: { id, ...BRIEF_POST_WHERE },
      })) > 0;
    const group = brief ? 'brief' : 'grid';
    const oldSlot = post.pin_group === group ? post.pin_slot : null;
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const occupant = await tx.post.findFirst({
        where: {
          author_id: user.sub,
          pin_group: group,
          pin_slot: slot,
          id: { not: id },
        },
        select: { id: true },
      });
      const ids = occupant ? [id, occupant.id] : [id];
      await tx.post.updateMany({
        where: { id: { in: ids } },
        data: { pin_slot: null, pin_group: null },
      });
      const mine = await tx.post.update({
        where: { id },
        data: { pin_slot: slot, pin_group: group },
      });
      if (occupant && oldSlot) {
        await tx.post.update({
          where: { id: occupant.id },
          data: { pin_slot: oldSlot, pin_group: group },
        });
      }
      return mine;
    });
    return (await this.presenter.present([updated], user.sub))[0];
  }

  /** Owner 2026-10-12: takes an own post off the top of the list. */
  async unpin(user: RequestUser, id: string): Promise<PostDto> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, author_id: user.sub, deleted_at: null },
      data: { pin_slot: null, pin_group: null },
    });
    if (count !== 1) throw postNotFound();
    const post = await this.prisma.post.findFirstOrThrow({ where: { id } });
    return (await this.presenter.present([post], user.sub))[0];
  }

  /** Owner 2026-10-18: the author turns comments on / off (⋯ menu, like
   * Instagram). While off nobody adds a comment or a reply and the existing
   * ones are hidden (kept, they come back when comments are on again). */
  async setCommentsEnabled(
    user: RequestUser,
    id: string,
    enabled: boolean,
  ): Promise<PostDto> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, author_id: user.sub, deleted_at: null },
      data: { comments_enabled: enabled },
    });
    if (count !== 1) throw postNotFound();
    return this.get(user, id);
  }

  /** Owner 2026-10-18: «Архивировать» — the post leaves every list for
   * everyone (its author still opens it from Settings → «Архив»); likes,
   * comments and saves are kept. Idempotent; a pin is dropped. */
  async archive(user: RequestUser, id: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id, author_id: user.sub, deleted_at: null },
      select: { id: true, status: true, archived_at: true },
    });
    if (!post) throw postNotFound();
    if (post.status === 'processing') {
      throw new ConflictException({
        code: ErrorCode.VIDEO_NOT_READY,
        message: 'The video is still processing; archive the post later.',
      });
    }
    if (!post.archived_at) {
      const { count } = await this.prisma.post.updateMany({
        where: { id, archived_at: null },
        data: { archived_at: new Date(), pin_slot: null, pin_group: null },
      });
      if (count === 1 && post.status === 'published') {
        await this.counters.bump(
          profileEntity(user.role),
          user.sub,
          'posts_count',
          -1,
        );
      }
    }
    return this.get(user, id);
  }

  /** Owner 2026-10-18: «Показать в профиле» — back to its original place
   * (created_at is never changed). Idempotent. */
  async unarchive(user: RequestUser, id: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id, author_id: user.sub, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!post) throw postNotFound();
    const { count } = await this.prisma.post.updateMany({
      where: { id, archived_at: { not: null } },
      data: { archived_at: null },
    });
    if (count === 1 && post.status === 'published') {
      await this.counters.bump(
        profileEntity(user.role),
        user.sub,
        'posts_count',
        1,
      );
    }
    return this.get(user, id);
  }

  /** Owner 2026-10-18: GET /me/archived-posts — the author's archive,
   * newest archived first. */
  async listArchived(
    user: RequestUser,
    query: { cursor?: string; limit?: number },
  ): Promise<PostPage> {
    const limit = query.limit ?? POSTS_PAGE_DEFAULT;
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.post.findMany({
      where: {
        author_id: user.sub,
        deleted_at: null,
        archived_at: { not: null },
        ...(c
          ? {
              OR: [
                { archived_at: { lt: c.createdAt } },
                { archived_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ archived_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presenter.present(page, user.sub),
      nextCursor:
        rows.length > limit && last?.archived_at
          ? encodeCursor({ createdAt: last.archived_at, id: last.id })
          : null,
    };
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
    const settled = await this.settleOwnVideo(user.sub, post);
    return (await this.presenter.present([settled], user.sub))[0];
  }

  /** The author's phone polls its new video post: ask Bunny right now
   * instead of waiting for the webhook or the once-a-minute sweep (which
   * only looks at uploads a minute old). Owner 2026-10-21: a 5 s video took
   * minutes to appear. Publishes exactly once, like the webhook does. */
  private async settleOwnVideo(userId: string, post: Post): Promise<Post> {
    if (
      post.status !== 'processing' ||
      !post.video_asset_id ||
      post.author_id !== userId
    ) {
      return post;
    }
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: post.video_asset_id },
    });
    if (
      !asset ||
      (asset.status !== 'awaiting_upload' && asset.status !== 'processing')
    ) {
      return post;
    }
    const next = await this.videos.refresh(asset).catch(() => asset);
    if (next.status === 'ready') {
      const { count } = await this.prisma.post.updateMany({
        where: { id: post.id, status: 'processing' },
        data: { status: 'published', created_at: new Date() },
      });
      if (count === 1) await this.afterPublish(post.id);
      return (
        (await this.prisma.post.findUnique({ where: { id: post.id } })) ?? post
      );
    }
    if (next.status === 'failed' || next.status === 'rejected') {
      await this.notifyVideoFailed(post, next.failure_reason);
    }
    return post;
  }

  /** GET /attorneys/:id/posts — newest first (§2.4 profile grid). */
  async listByAttorney(
    user: RequestUser,
    attorneyId: string,
    query: {
      cursor?: string;
      limit?: number;
      kind?: 'post' | 'news';
      media?: PostMediaFilter;
    },
  ): Promise<PostPage> {
    const limit = query.limit ?? POSTS_PAGE_DEFAULT;
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    const own = attorneyId === user.sub;
    const media = postMediaWhere(query.media);
    const rows = await this.prisma.post.findMany({
      where: {
        author_id: attorneyId,
        // Owner 2026-09-30: the profile's News tab.
        ...(query.kind ? { kind: query.kind } : {}),
        ...(own ? { deleted_at: null, archived_at: null } : VISIBLE_POST_WHERE),
        ...media,
        // Owner 2026-10-12: pinned posts lead the first page, once.
        ...(query.kind === 'news' ? {} : { pin_slot: null }),
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
    // Owner 2026-10-18: reposts have their own profile tab
    // (GET /users/:id/reposts); this list is the person's own posts only.
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const pinned =
      !c && query.kind !== 'news'
        ? await this.prisma.post.findMany({
            where: {
              author_id: attorneyId,
              kind: 'post',
              pin_slot: { not: null },
              ...(own
                ? { deleted_at: null, archived_at: null }
                : VISIBLE_POST_WHERE),
              ...media,
            },
            orderBy: [{ pin_group: 'asc' }, { pin_slot: 'asc' }],
          })
        : [];
    return {
      items: await this.presenter.present([...pinned, ...page], user.sub),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Owner 2026-10-01: GET /reels — ready video posts, newest first,
   * nobody blocked either way. */
  async listReels(
    user: RequestUser,
    query: { cursor?: string; limit?: number; practice?: string },
  ): Promise<PostPage> {
    // Owner 2026-10-15: 20 a page, so a page holds at least one ad slot.
    const limit = Math.min(query.limit ?? 20, 20);
    const practice = query.practice?.trim().toLowerCase();
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    // Owner 2026-10-18 (speed): the cached block set (block-set.cache.ts).
    const hidden = await cachedBlockSet(this.prisma, this.redis, user.sub);
    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          VISIBLE_POST_WHERE,
          // Load audit 6: the explicit IS NOT NULL lets Postgres use the
          // partial index posts_reels_created_idx (the relation filter alone
          // is a LEFT JOIN it cannot see through): reels page 25 ms -> <1 ms.
          { video_asset_id: { not: null } },
          { video_asset: { status: 'ready', deleted_at: null } },
          // One tag algorithm: the qualification and everything under it.
          practice
            ? postPracticeWhere([practice], legacyTopicTags(practice))
            : {},
          hidden.length ? { author_id: { notIn: hidden } } : {},
          c
            ? {
                OR: [
                  { created_at: { lt: c.createdAt } },
                  { created_at: c.createdAt, id: { lt: c.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const items = await this.presenter.present(page, user.sub);
    return {
      items: await this.withPromotedReels(user, items, hidden),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Owner 2026-10-15: a boosted reel after every N-th reel (own counter,
   * 10–15 in admin). Best effort — never breaks the reels. */
  private async withPromotedReels(
    user: RequestUser,
    items: PostDto[],
    hidden: string[],
  ): Promise<PostDto[]> {
    const delivery = this.promoDelivery;
    // Guests see no paid slots (frequency caps are per person).
    if (!delivery || items.length === 0 || user.guest) return items;
    try {
      const s = await delivery.settings();
      if (!s.postsEnabled || !s.reelsEnabled) return items;
      const every = s.reelEveryN;
      const slots = Math.floor(items.length / (every - 1));
      if (slots < 1) return items;
      const candidates = await delivery.eligible('post', user.sub, {
        excludeUserIds: hidden,
      });
      const onPage = new Set(items.map((p) => p.id));
      const wanted = candidates
        .filter((c) => c.postId && !onPage.has(c.postId))
        .slice(0, slots * 2);
      if (wanted.length === 0) return items;
      const rows = await this.prisma.post.findMany({
        where: {
          AND: [
            VISIBLE_POST_WHERE,
            { video_asset: { status: 'ready', deleted_at: null } },
            { id: { in: wanted.map((c) => c.postId!) } },
          ],
        },
      });
      const byId = new Map(rows.map((p) => [p.id, p]));
      const picked = wanted.filter((c) => byId.has(c.postId!)).slice(0, slots);
      if (picked.length === 0) return items;
      const presented = await this.presenter.present(
        picked.map((c) => byId.get(c.postId!)!),
        user.sub,
      );
      const out = [...items];
      presented.forEach((dto, i) => {
        const c = picked[i];
        out.splice(Math.min(out.length, (i + 1) * every - 1), 0, {
          ...dto,
          promotionId: c.id,
          promotionCta: c.ctaType
            ? { type: c.ctaType, value: c.ctaValue }
            : null,
        });
      });
      delivery.recordImpressions(
        user.sub,
        picked.map((c) => c.id),
      );
      return out;
    } catch {
      return items;
    }
  }

  /** Owner 2026-10-01: the same gate as POST /posts (reel uploads). */
  async assertCanPublish(user: RequestUser): Promise<void> {
    await this.assertCanPost(user);
  }

  /** An active practice category or subcategory (owner 2026-09-30). */
  private async practiceByCode(
    code: string,
  ): Promise<{ id: string; code: string }> {
    const area = await this.prisma.practiceArea.findFirst({
      where: { code, is_active: true },
      select: { id: true, code: true },
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

/** Owner 2026-10-18: a post carries a title, a text, photos, a video or
 * files — one of them at least. */
function assertNotEmptyPost(
  title: string | null | undefined,
  body: string | null | undefined,
  hasFiles: boolean,
): void {
  if (hasFiles || (title ?? '').trim() || (body ?? '').trim()) return;
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Add a title, a text, photos, a video or files.',
    details: { field: 'body' },
  });
}
