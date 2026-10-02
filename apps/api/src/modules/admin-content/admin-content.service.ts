import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  type ContentAction,
  ModerationService,
} from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminBidRowDto,
  AdminCommentRowDto,
  AdminOverviewDto,
  AdminPostRowDto,
  AdminPracticeAreaDto,
  AdminReviewRowDto,
  BroadcastDto,
  CreateBroadcastDto,
  CreatePracticeAreaDto,
  UpdatePracticeAreaDto,
} from './admin-content.dto';
import {
  effectiveSeats,
  paidSeats,
} from '../subscriptions/contract-grant.util';
import { liveSubscriptionWhere } from '../admin/subscription-metrics';
import { broadcastAudienceWhere } from './broadcast-audience';
import { BroadcastFanoutRunner } from './broadcast-fanout.runner';

const PAGE = 50;
type Page<T> = { items: T[]; nextCursor: string | null };
type Named = { first_name: string | null; last_name: string | null } | null;
const nameOf = (u: Named) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';

/** Keyset paging on (created_at, id) desc, shared by the admin lists. */
function keyset(cursor?: string) {
  const c = cursor ? decodeCursor(cursor) : undefined;
  return c
    ? {
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      }
    : {};
}

function page<T extends { id: string; created_at: Date }, R>(
  rows: T[],
  map: (r: T) => R,
): Page<R> {
  const slice = rows.slice(0, PAGE);
  const last = slice[slice.length - 1];
  return {
    items: slice.map(map),
    nextCursor:
      rows.length > PAGE && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}

const csvCell = (v: unknown): string => {
  let s = '';
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'boolean') s = `${v}`;
  else if (typeof v === 'bigint') s = v.toString();
  else if (v instanceof Date) s = v.toISOString();
  else if (v !== null && v !== undefined) s = JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Owner 2026-09-30 — admin panel sections: posts / news, comments,
 * reviews, bids, qualifications, broadcasts, CSV exports and the extended
 * overview numbers.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
    private readonly fanout: BroadcastFanoutRunner,
  ) {}

  /** Audit 2026-10-01: the admin's content actions go through the
   * moderation status path — posts_count / comment_count / reply_count
   * and the attorney's rating stay in sync (they were left stale). */
  private async setStatus(
    type: 'post' | 'comment' | 'case_comment' | 'review',
    id: string,
    action: ContentAction,
  ): Promise<string> {
    const after: (() => Promise<void>)[] = [];
    const authorId = await withTxRetry(this.prisma, async (tx) => {
      after.length = 0;
      const target = await this.moderation.resolve(type, id, tx);
      if (!target) throw notFound();
      await this.moderation.setContentStatus(tx, target, action, after);
      if (action === 'remove') {
        const data = { deleted_at: new Date() };
        if (type === 'post') await tx.post.update({ where: { id }, data });
        if (type === 'comment') {
          await tx.comment.update({ where: { id }, data });
        }
        if (type === 'case_comment') {
          await tx.caseComment.update({ where: { id }, data });
        }
      }
      return target.authorId ?? '';
    });
    for (const f of after) await f();
    return authorId;
  }

  // --- content ---------------------------------------------------------------

  async posts(
    q?: string,
    kind?: 'post' | 'news',
    cursor?: string,
    onlyVideo = false,
  ): Promise<Page<AdminPostRowDto>> {
    const rows = await this.prisma.post.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(onlyVideo ? { video_asset_id: { not: null } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...keyset(cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        author: { select: { first_name: true, last_name: true } },
        practice_area: { select: { name_en: true } },
      },
    });
    return page(rows, (p) => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body.slice(0, 400),
      authorId: p.author_id,
      authorName: nameOf(p.author),
      practice: p.practice_area?.name_en ?? null,
      status: p.status,
      likes: p.like_count,
      comments: p.comment_count,
      deleted: p.deleted_at !== null,
      hasVideo: p.video_asset_id !== null,
      createdAt: p.created_at.toISOString(),
    }));
  }

  async removePost(id: string, reason: string): Promise<void> {
    const authorId = await this.setStatus('post', id, 'remove');
    if (authorId) await this.tellAuthor(authorId, reason, { postId: id });
  }

  /** The author learns why (the moderation_notice template + reason). */
  private async tellAuthor(
    userId: string,
    reason: string,
    target: Record<string, string>,
  ): Promise<void> {
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: userId,
      payload: { reason, ...target },
    });
  }

  async comments(
    thread: 'post' | 'case',
    q?: string,
    cursor?: string,
  ): Promise<Page<AdminCommentRowDto>> {
    const where = {
      ...(q ? { body: { contains: q, mode: 'insensitive' as const } } : {}),
      ...keyset(cursor),
    };
    if (thread === 'case') {
      const rows = await this.prisma.caseComment.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        include: {
          author: { select: { first_name: true, last_name: true } },
          case: { select: { title: true } },
        },
      });
      return page(rows, (c) => ({
        id: c.id,
        thread: 'case',
        targetId: c.case_id,
        targetTitle: c.case.title,
        body: c.body,
        authorId: c.author_id,
        authorName: nameOf(c.author),
        status: c.status,
        deleted: c.deleted_at !== null,
        createdAt: c.created_at.toISOString(),
      }));
    }
    const rows = await this.prisma.comment.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        author: { select: { first_name: true, last_name: true } },
        post: { select: { title: true } },
      },
    });
    return page(rows, (c) => ({
      id: c.id,
      thread: 'post',
      targetId: c.post_id,
      targetTitle: c.post.title,
      body: c.body,
      authorId: c.author_id,
      authorName: nameOf(c.author),
      status: c.status,
      deleted: c.deleted_at !== null,
      createdAt: c.created_at.toISOString(),
    }));
  }

  async removeComment(
    id: string,
    thread: 'post' | 'case',
    reason: string,
  ): Promise<void> {
    const authorId = await this.setStatus(
      thread === 'case' ? 'case_comment' : 'comment',
      id,
      'remove',
    );
    if (authorId) await this.tellAuthor(authorId, reason, { commentId: id });
  }

  async reviews(cursor?: string, q?: string): Promise<Page<AdminReviewRowDto>> {
    const rows = await this.prisma.review.findMany({
      // Audit 2026-10-02: `q` was accepted but ignored.
      where: { ...reviewSearch(q), ...keyset(cursor) },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        attorney: { select: { first_name: true, last_name: true } },
        client: { select: { first_name: true, last_name: true } },
        case: { select: { title: true } },
      },
    });
    return page(rows, (r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      attorneyName: nameOf(r.attorney),
      clientName: nameOf(r.client),
      // Owner 2026-10-01: open reviews have no case.
      caseTitle: r.case?.title ?? null,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async setReviewStatus(
    id: string,
    status: 'published' | 'hidden',
    reason?: string,
  ): Promise<void> {
    // The rating is recalculated (a hidden review no longer counts).
    const authorId = await this.setStatus(
      'review',
      id,
      status === 'hidden' ? 'hide' : 'restore',
    );
    if (reason && authorId) {
      await this.tellAuthor(authorId, reason, { reviewId: id });
    }
  }

  // --- bids ------------------------------------------------------------------

  async bids(
    status?: string,
    q?: string,
    cursor?: string,
  ): Promise<Page<AdminBidRowDto>> {
    const rows = await this.prisma.bid.findMany({
      where: {
        ...(status
          ? { status: status as Prisma.EnumBidStatusFilter['equals'] }
          : {}),
        ...(q ? { case: { title: { contains: q, mode: 'insensitive' } } } : {}),
        ...keyset(cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        attorney: { select: { first_name: true, last_name: true } },
        case: { select: { title: true } },
      },
    });
    return page(rows, (b) => ({
      id: b.id,
      caseId: b.case_id,
      caseTitle: b.case.title,
      attorneyName: nameOf(b.attorney),
      status: b.status,
      feeType: b.fee_type,
      amountCents: b.amount_cents,
      rounds: b.round_count,
      outsidePractice: b.outside_practice,
      createdAt: b.created_at.toISOString(),
    }));
  }

  // --- qualifications ----------------------------------------------------------

  async practiceAreas(): Promise<AdminPracticeAreaDto[]> {
    const rows = await this.prisma.practiceArea.findMany({
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      include: {
        parent: { select: { code: true } },
        _count: {
          select: { attorney_practice_areas: true, cases: true, posts: true },
        },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      nameEn: p.name_en,
      parentCode: p.parent?.code ?? null,
      sort: p.sort,
      isActive: p.is_active,
      attorneys: p._count.attorney_practice_areas,
      cases: p._count.cases,
      posts: p._count.posts,
    }));
  }

  async updatePracticeArea(
    id: string,
    dto: UpdatePracticeAreaDto,
  ): Promise<AdminPracticeAreaDto[]> {
    const r = await this.prisma.practiceArea.updateMany({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { name_en: dto.nameEn } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      },
    });
    if (r.count === 0) throw notFound();
    return this.practiceAreas();
  }

  async createPracticeArea(
    dto: CreatePracticeAreaDto,
  ): Promise<AdminPracticeAreaDto[]> {
    const [parentCode] = dto.code.includes('.') ? dto.code.split('.') : [null];
    const parent = parentCode
      ? await this.prisma.practiceArea.findUnique({
          where: { code: parentCode },
        })
      : null;
    if (parentCode && !parent) throw notFound('Parent category not found.');
    await this.prisma.practiceArea.create({
      data: {
        code: dto.code,
        name_en: dto.nameEn,
        i18n_key: `practice.${dto.code}`,
        parent_id: parent?.id ?? null,
        sort: 999,
      },
    });
    return this.practiceAreas();
  }

  // --- broadcasts --------------------------------------------------------------

  async broadcasts(): Promise<BroadcastDto[]> {
    const rows = await this.prisma.adminBroadcast.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      audience: b.audience,
      stateCode: b.state_code,
      recipients: Number(b.recipients),
      createdAt: b.created_at.toISOString(),
    }));
  }

  /** Every active user of the audience gets an in-app notification and a
   * push (the "system" category, which the app always shows). Audit
   * 2026-10-02: the request stores the broadcast with the audience size
   * and queues the fan-out (BroadcastFanoutRunner, batches of 500). */
  async broadcast(
    adminId: string,
    dto: CreateBroadcastDto,
  ): Promise<BroadcastDto> {
    const recipients = await this.prisma.user.count({
      where: broadcastAudienceWhere(dto.audience, dto.stateCode),
    });
    const b = await this.prisma.adminBroadcast.create({
      data: {
        admin_id: adminId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        state_code: dto.stateCode ?? null,
        recipients,
      },
    });
    await this.fanout.start({
      broadcastId: b.id,
      title: dto.title,
      body: dto.body,
      audience: dto.audience,
      stateCode: dto.stateCode ?? null,
    });
    return {
      id: b.id,
      title: b.title,
      body: b.body,
      audience: b.audience,
      stateCode: b.state_code,
      recipients,
      createdAt: b.created_at.toISOString(),
    };
  }

  // --- CSV ---------------------------------------------------------------------

  async exportCsv(entity: string): Promise<string> {
    const LIMIT = 50_000;
    let header: string[] = [];
    let rows: unknown[][] = [];
    if (entity === 'users') {
      const us = await this.prisma.user.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          role: true,
          status: true,
          first_name: true,
          last_name: true,
          phone_e164: true,
          email: true,
          created_at: true,
        },
      });
      header = [
        'id',
        'role',
        'status',
        'first_name',
        'last_name',
        'phone',
        'email',
        'created_at',
      ];
      rows = us.map((u) => [
        u.id,
        u.role,
        u.status,
        u.first_name,
        u.last_name,
        u.phone_e164,
        u.email,
        u.created_at.toISOString(),
      ]);
    } else if (entity === 'cases') {
      const cs = await this.prisma.case.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
        include: { practice_area: { select: { code: true } } },
      });
      header = [
        'id',
        'title',
        'status',
        'practice',
        'state',
        'budget_cents',
        'bids',
        'views',
        'created_at',
      ];
      rows = cs.map((c) => [
        c.id,
        c.title,
        c.status,
        c.practice_area.code,
        c.primary_state_code,
        c.budget_cents,
        c.bids_count,
        c.view_count,
        c.created_at.toISOString(),
      ]);
    } else if (entity === 'bids') {
      const bs = await this.prisma.bid.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
      });
      header = [
        'id',
        'case_id',
        'attorney_id',
        'status',
        'fee_type',
        'amount_cents',
        'rounds',
        'outside_practice',
        'created_at',
      ];
      rows = bs.map((b) => [
        b.id,
        b.case_id,
        b.attorney_id,
        b.status,
        b.fee_type,
        b.amount_cents,
        b.round_count,
        b.outside_practice,
        b.created_at.toISOString(),
      ]);
    } else if (entity === 'payments') {
      const ps = await this.prisma.payment.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
      });
      header = [
        'id',
        'user_id',
        'amount_cents',
        'currency',
        'status',
        'paid_at',
        'failure_code',
        'created_at',
      ];
      rows = ps.map((p) => [
        p.id,
        p.user_id,
        p.amount_cents,
        p.currency,
        p.status,
        p.paid_at?.toISOString(),
        p.failure_code,
        p.created_at.toISOString(),
      ]);
    } else if (entity === 'posts') {
      const ps = await this.prisma.post.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
      });
      header = [
        'id',
        'author_id',
        'kind',
        'title',
        'status',
        'likes',
        'comments',
        'deleted',
        'created_at',
      ];
      rows = ps.map((p) => [
        p.id,
        p.author_id,
        p.kind,
        p.title,
        p.status,
        p.like_count,
        p.comment_count,
        p.deleted_at !== null,
        p.created_at.toISOString(),
      ]);
    } else {
      const ms = await this.prisma.assistantMembership.findMany({
        take: LIMIT,
        orderBy: { created_at: 'desc' },
      });
      header = [
        'membership_id',
        'attorney_id',
        'assistant_user_id',
        'phone',
        'status',
        'approval',
        'duties',
        'joined_at',
        'created_at',
      ];
      rows = ms.map((m) => [
        m.id,
        m.attorney_id,
        m.assistant_user_id,
        m.phone_e164,
        m.status,
        m.approval,
        m.duties.join('|'),
        m.joined_at?.toISOString(),
        m.created_at.toISOString(),
      ]);
    }
    return (
      [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
    );
  }

  // --- overview -----------------------------------------------------------------

  async overview(): Promise<AdminOverviewDto> {
    const d7 = new Date(Date.now() - 7 * 86400000);
    const d30 = new Date(Date.now() - 30 * 86400000);
    // Audit 2026-10-02: the gate's rule (past_due only while in grace),
    // shared with the dashboard tiles — see subscription-metrics.ts.
    const live = liveSubscriptionWhere(new Date());
    const [
      clients,
      attorneys,
      attorneysVerified,
      assistants,
      monthly,
      yearly,
      seats,
      revenue,
      cases7d,
      bids7d,
      posts7d,
      messages7d,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'client', deleted_at: null } }),
      this.prisma.user.count({ where: { role: 'attorney', deleted_at: null } }),
      this.prisma.attorneyProfile.count({
        where: { verification_status: 'verified' },
      }),
      this.prisma.assistantMembership.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({
        where: { ...live, plan: 'monthly' },
      }),
      this.prisma.subscription.count({
        where: { ...live, plan: 'yearly' },
      }),
      this.prisma.subscription.aggregate({
        where: { ...live, plan: 'monthly' },
        _sum: { assistant_seats: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'succeeded', paid_at: { gte: d30 } },
        _sum: { amount_cents: true },
      }),
      this.prisma.case.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.bid.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.post.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.message.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.call.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.call.count({
        where: { created_at: { gte: d7 }, status: 'missed' },
      }),
      this.prisma.attorneyTask.count({
        where: { status: { in: ['open', 'taken'] } },
      }),
      this.prisma.attorneyTask.count({
        where: { status: 'done', done_at: { gte: d30 } },
      }),
      this.prisma.assistantRequest.count({ where: { status: 'pending' } }),
    ]);
    return {
      clients,
      attorneys,
      attorneysVerified,
      assistants,
      subscriptionsMonthly: monthly,
      subscriptionsYearly: yearly,
      assistantSeats:
        (seats._sum.assistant_seats ?? 0) +
        yearly * 6 +
        (await this.extraGrantSeats(live)),
      revenue30dCents: revenue._sum.amount_cents ?? 0,
      cases7d,
      bids7d,
      posts7d,
      messages7d,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    };
  }

  /** Owner 2026-10-02: seats an active contract grant adds on top of the
   * paid ones (per attorney: max(paid, grant) − paid). */
  private async extraGrantSeats(
    live: Prisma.SubscriptionWhereInput,
  ): Promise<number> {
    const now = new Date();
    const grants = await this.prisma.contractGrant.findMany({
      where: {
        revoked_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
        assistant_seats: { gt: 0 },
      },
      select: { user_id: true, assistant_seats: true },
    });
    if (grants.length === 0) return 0;
    const byUser = new Map<string, number>();
    for (const g of grants) {
      byUser.set(
        g.user_id,
        Math.max(byUser.get(g.user_id) ?? 0, g.assistant_seats),
      );
    }
    const subs = await this.prisma.subscription.findMany({
      where: { ...live, user_id: { in: [...byUser.keys()] } },
      select: { user_id: true, plan: true, assistant_seats: true },
    });
    const paid = new Map(subs.map((x) => [x.user_id, paidSeats(x)]));
    let extra = 0;
    for (const [userId, g] of byUser) {
      const p = paid.get(userId) ?? 0;
      extra += effectiveSeats(p, g) - p;
    }
    return extra;
  }
}

/** Review text or either person's name (attorney + client reviews). */
export function reviewSearch(q?: string): {
  OR?: Prisma.ReviewWhereInput[];
} {
  const term = q?.trim();
  if (!term) return {};
  const like = { contains: term, mode: 'insensitive' as const };
  const person = { OR: [{ first_name: like }, { last_name: like }] };
  return {
    OR: [{ body: like }, { attorney: person }, { client: person }],
  };
}

function notFound(message = 'Not found.') {
  return new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
}
