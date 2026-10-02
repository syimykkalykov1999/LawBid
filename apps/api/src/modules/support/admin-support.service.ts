import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, SupportMessage, SupportTicket } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  SUPPORT_STATUSES,
  type AdminSupportMessageDto,
  type AdminSupportReplyDto,
  type AdminSupportStatsDto,
  type AdminSupportTicketDetailDto,
  type AdminSupportTicketRowDto,
  type AdminSupportTicketsQueryDto,
  type AdminSupportUserSummaryDto,
  type AdminUpdateSupportTicketDto,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from './support.dto';
import {
  activityKeyset,
  activityPage,
  afterAdminReply,
  nameOf,
  SUPPORT_TEAM_NAME,
  ticketNotFound,
  withResolvedAt,
} from './support.rules';

const PAGE = 50;
const MAX_MESSAGES = 1000;
const STATS_WINDOW_MS = 30 * 86_400_000;
const STATS_MAX_TICKETS = 2000;

type Page<T> = { items: T[]; nextCursor: string | null };
type Named = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Owner 2026-10-02 — the admin side of support tickets: queue, stats,
 * the full thread (internal notes included), replies and triage.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionAccessService,
  ) {}

  async list(
    adminId: string,
    q: AdminSupportTicketsQueryDto,
  ): Promise<Page<AdminSupportTicketRowDto>> {
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.userId ? { user_id: q.userId } : {}),
      ...(q.q ? { subject: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.assignee === 'me'
        ? { assignee_id: adminId }
        : q.assignee === 'unassigned'
          ? { assignee_id: null }
          : q.assignee
            ? { assignee_id: q.assignee.toLowerCase() }
            : {}),
      ...activityKeyset(q.cursor),
    };
    const rows = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [{ last_message_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const people = await this.people(
      rows.slice(0, PAGE).flatMap((r) => [r.user_id, r.assignee_id]),
    );
    return activityPage(rows, PAGE, (r) => this.row(r, people));
  }

  async stats(): Promise<AdminSupportStatsDto> {
    const [grouped, openUnassigned, unreadByAdmin, attention, avg] =
      await Promise.all([
        this.prisma.supportTicket.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.supportTicket.count({
          where: { status: 'open', assignee_id: null },
        }),
        this.prisma.supportTicket.count({
          where: { unread_by_admin: true, status: { not: 'closed' } },
        }),
        this.prisma.supportTicket.count({
          where: {
            OR: [
              { status: 'open', assignee_id: null },
              { unread_by_admin: true, status: { not: 'closed' } },
            ],
          },
        }),
        this.avgFirstResponseMinutes(),
      ]);
    const byStatus = { open: 0, waiting_user: 0, resolved: 0, closed: 0 };
    for (const g of grouped) {
      if ((SUPPORT_STATUSES as readonly string[]).includes(g.status)) {
        byStatus[g.status as SupportStatus] = g._count._all;
      }
    }
    return {
      byStatus,
      openUnassigned,
      unreadByAdmin,
      attention,
      avgFirstResponseMinutes30d: avg,
    };
  }

  async get(id: string): Promise<AdminSupportTicketDetailDto> {
    const ticket = await this.ticket(id);
    const [messages, user] = await Promise.all([
      this.prisma.supportMessage.findMany({
        where: { ticket_id: id },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        take: MAX_MESSAGES,
      }),
      this.userSummary(ticket.user_id),
    ]);
    if (ticket.unread_by_admin) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { unread_by_admin: false },
      });
    }
    const people = await this.people([
      ticket.user_id,
      ticket.assignee_id,
      ...messages.flatMap((m) => [m.author_user_id, m.author_admin_id]),
    ]);
    return {
      ...this.row({ ...ticket, unread_by_admin: false }, people),
      userSummary: user,
      messages: messages.map((m) => presentAdminMessage(m, people)),
    };
  }

  async reply(
    adminId: string,
    id: string,
    dto: AdminSupportReplyDto,
  ): Promise<AdminSupportMessageDto> {
    const internal = dto.internal ?? false;
    const { message, ticket } = await withTxRetry(this.prisma, async (tx) => {
      const t = await tx.supportTicket.findUnique({ where: { id } });
      if (!t) throw ticketNotFound();
      const m = await tx.supportMessage.create({
        data: {
          ticket_id: id,
          author_admin_id: adminId,
          internal,
          body: dto.body,
        },
      });
      if (internal) {
        // A note changes nothing the user can see (not even the order).
        return { message: m, ticket: t };
      }
      const now = new Date();
      const next = afterAdminReply(dto.status, t.resolved_at, now);
      const updated = await tx.supportTicket.update({
        where: { id },
        data: {
          status: next.status,
          resolved_at: next.resolvedAt,
          unread_by_user: true,
          unread_by_admin: false,
          last_message_at: now,
        },
      });
      const lang = await tx.user.findUnique({
        where: { id: t.user_id },
        select: { ui_language: true },
      });
      const ru = (lang?.ui_language ?? 'en').startsWith('ru');
      // `admin_broadcast` carries its own title/body (PushDispatcher) and
      // is the generic "message from the LawBid team" type; ticketId is
      // passed to the push deep link.
      await this.notifications.emit(
        {
          type: 'admin_broadcast',
          recipientId: t.user_id,
          payload: {
            title: SUPPORT_TEAM_NAME,
            body: ru
              ? `Новый ответ по обращению «${clip(t.subject)}»`
              : `New reply to your request “${clip(t.subject)}”`,
            ticketId: t.id,
            kind: 'support_reply',
          },
        },
        tx,
      );
      return { message: m, ticket: updated };
    });
    const people = await this.people([adminId, ticket.user_id]);
    return presentAdminMessage(message, people);
  }

  async update(
    id: string,
    dto: AdminUpdateSupportTicketDto,
  ): Promise<AdminSupportTicketRowDto> {
    if (dto.assigneeId) await this.assertAdmin(dto.assigneeId);
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const t = await tx.supportTicket.findUnique({ where: { id } });
      if (!t) throw ticketNotFound();
      const data: Prisma.SupportTicketUpdateInput = {};
      if (dto.status && dto.status !== t.status) {
        const next = withResolvedAt(dto.status, t.resolved_at, new Date());
        data.status = next.status;
        data.resolved_at = next.resolvedAt;
      }
      if (dto.priority) data.priority = dto.priority;
      if (dto.assigneeId !== undefined) data.assignee_id = dto.assigneeId;
      if (Object.keys(data).length === 0) return t;
      return tx.supportTicket.update({ where: { id }, data });
    });
    const people = await this.people([updated.user_id, updated.assignee_id]);
    return this.row(updated, people);
  }

  // --- helpers -----------------------------------------------------------------

  private async ticket(id: string): Promise<SupportTicket> {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw ticketNotFound();
    return t;
  }

  private async assertAdmin(userId: string): Promise<void> {
    const admin = await this.prisma.adminProfile.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });
    if (!admin) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The assignee must be an admin.',
        details: { field: 'assigneeId' },
      });
    }
  }

  private async people(
    ids: (string | null)[],
  ): Promise<Map<string, Named & { role: string | null }>> {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, first_name: true, last_name: true, role: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private row(
    t: SupportTicket,
    people: Map<string, Named & { role: string | null }>,
  ): AdminSupportTicketRowDto {
    const u = people.get(t.user_id);
    const a = t.assignee_id ? people.get(t.assignee_id) : undefined;
    return {
      id: t.id,
      subject: t.subject,
      category: t.category as SupportCategory,
      status: t.status as SupportStatus,
      priority: t.priority as SupportPriority,
      user: { id: t.user_id, name: nameOf(u), role: u?.role ?? null },
      assigneeId: t.assignee_id,
      assigneeName: t.assignee_id ? nameOf(a) : null,
      unreadByAdmin: t.unread_by_admin,
      unreadByUser: t.unread_by_user,
      lastMessageAt: t.last_message_at.toISOString(),
      createdAt: t.created_at.toISOString(),
      resolvedAt: t.resolved_at?.toISOString() ?? null,
    };
  }

  private async userSummary(
    userId: string,
  ): Promise<AdminSupportUserSummaryDto> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        status: true,
        ui_language: true,
        email: true,
        email_verified_at: true,
        phone_e164: true,
        phone_verified_at: true,
        created_at: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    if (!u) {
      return {
        id: userId,
        name: '—',
        username: null,
        role: null,
        status: 'deleted',
        uiLanguage: 'en',
        hasEmail: false,
        hasPhone: false,
        subscriptionActive: null,
        createdAt: new Date(0).toISOString(),
      };
    }
    return {
      id: u.id,
      name: nameOf(u),
      username:
        u.attorney_profile?.username ?? u.client_profile?.username ?? null,
      role: u.role,
      status: u.status,
      uiLanguage: u.ui_language,
      hasEmail: !!(u.email && u.email_verified_at),
      hasPhone: !!(u.phone_e164 && u.phone_verified_at),
      subscriptionActive:
        u.role === 'attorney' ? await this.subscriptions.isActive(u.id) : null,
      createdAt: u.created_at.toISOString(),
    };
  }

  /** Two bounded queries: tickets of the last 30 days and the first
   * public admin message of each. */
  private async avgFirstResponseMinutes(): Promise<number | null> {
    const since = new Date(Date.now() - STATS_WINDOW_MS);
    const tickets = await this.prisma.supportTicket.findMany({
      where: { created_at: { gte: since } },
      select: { id: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: STATS_MAX_TICKETS,
    });
    if (tickets.length === 0) return null;
    const firsts = await this.prisma.supportMessage.groupBy({
      by: ['ticket_id'],
      where: {
        ticket_id: { in: tickets.map((t) => t.id) },
        author_admin_id: { not: null },
        internal: false,
      },
      _min: { created_at: true },
    });
    const created = new Map(tickets.map((t) => [t.id, t.created_at]));
    let total = 0;
    let n = 0;
    for (const f of firsts) {
      const c = created.get(f.ticket_id);
      const first = f._min.created_at;
      if (c && first) {
        total += first.getTime() - c.getTime();
        n += 1;
      }
    }
    return n === 0 ? null : Math.round(total / n / 60_000);
  }
}

export function presentAdminMessage(
  m: SupportMessage,
  people: Map<string, Named>,
): AdminSupportMessageDto {
  const isAdmin = m.author_admin_id !== null;
  const authorId = (isAdmin ? m.author_admin_id : m.author_user_id) ?? '';
  return {
    id: m.id,
    authorType: isAdmin ? 'admin' : 'user',
    authorId,
    authorName: nameOf(people.get(authorId)),
    internal: m.internal,
    body: m.body,
    createdAt: m.created_at.toISOString(),
  };
}

function clip(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
