import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { SupportMessage, SupportTicket } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AppSettingKey } from '../../common/app-settings/app-settings.defaults';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { RateLimitService } from '../auth/services/rate-limit.service';
import type {
  CreateSupportTicketDto,
  SupportCategory,
  SupportMessageDto,
  SupportStatus,
  SupportTicketDetailDto,
  SupportTicketDto,
} from './support.dto';
import {
  activityKeyset,
  activityPage,
  afterUserMessage,
  supportAuthorName,
  ticketNotFound,
  withResolvedAt,
} from './support.rules';

const PAGE = 20;
/** The thread a user sees: plenty for a support conversation. */
const MAX_MESSAGES = 500;

type Page<T> = { items: T[]; nextCursor: string | null };

export function presentTicket(t: SupportTicket): SupportTicketDto {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category as SupportCategory,
    status: t.status as SupportStatus,
    unread: t.unread_by_user,
    lastMessageAt: t.last_message_at.toISOString(),
    createdAt: t.created_at.toISOString(),
    resolvedAt: t.resolved_at?.toISOString() ?? null,
    canReply: t.status !== 'closed',
  };
}

/** A message as the app user sees it: no admin ids, emails or notes. */
export function presentUserMessage(
  m: SupportMessage,
  adminFirstNames: ReadonlyMap<string, string | null>,
): SupportMessageDto {
  const fromSupport = m.author_admin_id !== null;
  return {
    id: m.id,
    author: fromSupport ? 'support' : 'me',
    authorName: fromSupport
      ? supportAuthorName(adminFirstNames.get(m.author_admin_id ?? ''))
      : null,
    body: m.body,
    createdAt: m.created_at.toISOString(),
  };
}

/**
 * Owner 2026-10-02 — support tickets from the app. A user only ever sees
 * their own tickets (someone else's id is a 404) and never sees internal
 * notes or who in the team answered beyond a first name.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly settings: AppSettingsService,
  ) {}

  async create(
    userId: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketDetailDto> {
    await this.limit(
      userId,
      'support-ticket',
      'rate_limit.support_ticket_per_hour',
    );
    const now = new Date();
    const { ticket, message } = await withTxRetry(this.prisma, async (tx) => {
      const t = await tx.supportTicket.create({
        data: {
          user_id: userId,
          subject: dto.subject,
          category: dto.category,
          status: 'open',
          unread_by_admin: true,
          unread_by_user: false,
          last_message_at: now,
        },
      });
      const m = await tx.supportMessage.create({
        data: { ticket_id: t.id, author_user_id: userId, body: dto.body },
      });
      return { ticket: t, message: m };
    });
    return {
      ...presentTicket(ticket),
      messages: [presentUserMessage(message, new Map())],
    };
  }

  async list(userId: string, cursor?: string): Promise<Page<SupportTicketDto>> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { user_id: userId, ...activityKeyset(cursor) },
      orderBy: [{ last_message_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    return activityPage(rows, PAGE, presentTicket);
  }

  async get(userId: string, id: string): Promise<SupportTicketDetailDto> {
    const ticket = await this.own(userId, id);
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticket_id: id, internal: false },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: MAX_MESSAGES,
    });
    if (ticket.unread_by_user) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { unread_by_user: false },
      });
    }
    const names = await this.adminFirstNames(messages);
    return {
      ...presentTicket({ ...ticket, unread_by_user: false }),
      messages: messages.map((m) => presentUserMessage(m, names)),
    };
  }

  async reply(
    userId: string,
    id: string,
    body: string,
  ): Promise<SupportMessageDto> {
    const ticket = await this.own(userId, id);
    // Checked before the rate limit so a closed ticket says so first.
    afterUserMessage(ticket.status, ticket.resolved_at, new Date());
    await this.limit(
      userId,
      'support-message',
      'rate_limit.support_message_per_hour',
    );
    const message = await withTxRetry(this.prisma, async (tx) => {
      const t = await tx.supportTicket.findFirst({
        where: { id, user_id: userId },
      });
      if (!t) throw ticketNotFound();
      const now = new Date();
      const next = afterUserMessage(t.status, t.resolved_at, now);
      const m = await tx.supportMessage.create({
        data: { ticket_id: id, author_user_id: userId, body },
      });
      await tx.supportTicket.update({
        where: { id },
        data: {
          status: next.status,
          resolved_at: next.resolvedAt,
          unread_by_admin: true,
          last_message_at: now,
        },
      });
      return m;
    });
    return presentUserMessage(message, new Map());
  }

  async close(userId: string, id: string): Promise<SupportTicketDto> {
    const ticket = await this.own(userId, id);
    if (ticket.status === 'closed') return presentTicket(ticket);
    const next = withResolvedAt('closed', ticket.resolved_at, new Date());
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: next.status, resolved_at: next.resolvedAt },
    });
    return presentTicket(updated);
  }

  private async own(userId: string, id: string): Promise<SupportTicket> {
    const t = await this.prisma.supportTicket.findFirst({
      where: { id, user_id: userId },
    });
    if (!t) throw ticketNotFound();
    return t;
  }

  private async adminFirstNames(
    messages: SupportMessage[],
  ): Promise<Map<string, string | null>> {
    const ids = [
      ...new Set(
        messages
          .map((m) => m.author_admin_id)
          .filter((v): v is string => v !== null),
      ),
    ];
    if (ids.length === 0) return new Map();
    const admins = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, first_name: true },
    });
    return new Map(admins.map((a) => [a.id, a.first_name]));
  }

  private async limit(
    userId: string,
    bucket: string,
    key: AppSettingKey,
  ): Promise<void> {
    const max = await this.settings.number(key);
    const r = await this.rateLimit.consumeFixedWindow(
      [bucket, userId],
      max,
      3600,
    );
    if (!r.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many support requests. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
