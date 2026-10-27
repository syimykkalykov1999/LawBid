import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { SupportMessage, SupportTicket } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AppSettingKey } from '../../common/app-settings/app-settings.defaults';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { RateLimitService } from '../auth/services/rate-limit.service';
import {
  STAFF_SIGNALS,
  type StaffSignals,
} from '../staff-core/staff-signals.port';
import { SupportDeskService } from './support-desk.service';
import { SupportFilesService } from './support-files.service';
import type {
  CreateSupportTicketDto,
  SupportAttachmentDto,
  SupportAttachmentInputDto,
  SupportInfoDto,
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
  assertHasContent,
  buildClientContext,
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
  attachments: readonly SupportAttachmentDto[] = [],
): SupportMessageDto {
  // Owner 2026-10-05: an automatic answer has no author and reads as
  // the team.
  const fromSupport = m.author_admin_id !== null || m.auto;
  return {
    id: m.id,
    author: fromSupport ? 'support' : 'me',
    authorName: fromSupport
      ? supportAuthorName(
          m.author_admin_id ? adminFirstNames.get(m.author_admin_id) : null,
        )
      : null,
    body: m.body,
    attachments: [...attachments],
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
    private readonly desk: SupportDeskService,
    private readonly attachments: SupportFilesService,
    @Optional()
    @Inject(STAFF_SIGNALS)
    private readonly staffSignals?: StaffSignals,
  ) {}

  /** Owner 2026-10-05: hours and the usual answer time, for the app. */
  info(): Promise<SupportInfoDto> {
    return this.desk.info();
  }

  async create(
    userId: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketDetailDto> {
    assertHasContent(dto.body, dto.attachments);
    await this.limit(
      userId,
      'support-ticket',
      'rate_limit.support_ticket_per_hour',
    );
    await this.attachments.assertAttachable(userId, dto.attachments);
    const now = new Date();
    const { ticket, messages } = await withTxRetry(this.prisma, async (tx) => {
      // Owner 2026-10-05: the ticket belongs to the asker's country, so
      // staff assigned to that country see it.
      const asker = await tx.user.findUnique({
        where: { id: userId },
        select: { country_code: true, role: true },
      });
      const t = await tx.supportTicket.create({
        data: {
          user_id: userId,
          country_code: asker?.country_code ?? 'US',
          subject: dto.subject,
          category: dto.category,
          status: 'open',
          unread_by_admin: true,
          unread_by_user: false,
          last_message_at: now,
          client_context:
            buildClientContext(dto.context, {
              id: userId,
              role: asker?.role ?? null,
            }) ?? undefined,
        },
      });
      const m = await tx.supportMessage.create({
        data: { ticket_id: t.id, author_user_id: userId, body: dto.body },
      });
      await this.attachments.attach(tx, m.id, dto.attachments);
      // Owner 2026-10-05: SLA clock, an agent on shift, after-hours answer.
      const lang = await tx.user.findUnique({
        where: { id: userId },
        select: { ui_language: true },
      });
      const autoId = await this.desk.onCreated(
        tx,
        t,
        lang?.ui_language ?? 'en',
        now,
      );
      const auto = autoId
        ? await tx.supportMessage.findUnique({ where: { id: autoId } })
        : null;
      return { ticket: t, messages: auto ? [m, auto] : [m] };
    });
    const files = await this.attachments.forMessages(messages.map((m) => m.id));
    return {
      ...presentTicket(ticket),
      messages: messages.map((m) =>
        presentUserMessage(m, new Map(), files.get(m.id)),
      ),
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
    const [names, files] = await Promise.all([
      this.adminFirstNames(messages),
      this.attachments.forMessages(messages.map((m) => m.id)),
    ]);
    return {
      ...presentTicket({ ...ticket, unread_by_user: false }),
      messages: messages.map((m) =>
        presentUserMessage(m, names, files.get(m.id)),
      ),
    };
  }

  async reply(
    userId: string,
    id: string,
    body: string,
    attachments?: readonly SupportAttachmentInputDto[],
  ): Promise<SupportMessageDto> {
    assertHasContent(body, attachments);
    const ticket = await this.own(userId, id);
    // Checked before the rate limit so a closed ticket says so first.
    afterUserMessage(ticket.status, ticket.resolved_at, new Date());
    await this.limit(
      userId,
      'support-message',
      'rate_limit.support_message_per_hour',
    );
    await this.attachments.assertAttachable(userId, attachments);
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
      await this.attachments.attach(tx, m.id, attachments);
      await this.desk.onUserMessage(tx, t, now);
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
    // Staff package T5: the user wrote again into a ticket support had marked
    // resolved — a repeat, a quality signal against whoever resolved it.
    if (ticket.status === 'resolved' && ticket.resolved_by) {
      void this.staffSignals?.signal(
        ticket.resolved_by,
        'reopened',
        'support_ticket',
        id,
      );
    }
    const files = await this.attachments.forMessages([message.id]);
    return presentUserMessage(message, new Map(), files.get(message.id));
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
