import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Conversation, type Message } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { maskContactInfo } from '../cases/domain/contact-detector';
import { FilesService } from '../files/files.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  MESSAGE_MAX_CHARS,
  type ConversationDto,
  type ConversationPage,
  type MessageDto,
  type MessagePage,
  type SendMessageDto,
} from './chat.dto';

const CONVERSATIONS_PAGE = 20;
const MESSAGES_PAGE = 30;
const CATCH_UP_MAX = 100;

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CONVERSATION_NOT_FOUND,
    message: 'Conversation not found.',
  });
}

function closed(): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONVERSATION_CLOSED,
    message: 'This chat is closed.',
  });
}

function fullName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

/** Newer-than on the (created_at, id) message order. */
function isAfter(
  a: { created_at: Date; id: string },
  b: { created_at: Date; id: string },
): boolean {
  const t = a.created_at.getTime() - b.created_at.getTime();
  return t > 0 || (t === 0 && a.id > b.id);
}

/**
 * docs/05 §8 (stage 5.7) chats. Conversations are created only from a case
 * (docs/04 §9: "Написать клиенту", bid acceptance); here: list, messages,
 * sending (idempotent on clientMessageId, contact masking until
 * contacts_unlocked, closed → read only, attorney needs an active
 * subscription/trial), read receipts and mute. Realtime only delivers —
 * every event is re-derivable from these REST reads (§8.5).
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly files: FilesService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(
    user: RequestUser,
    cursor?: string,
    updatedSince?: string,
  ): Promise<ConversationPage> {
    const side = this.sideOf(user);
    if (!side) return { items: [], nextCursor: null };
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.conversation.findMany({
      where: {
        [side]: user.sub,
        // A chat appears in the list once it has a message (§8.1).
        last_message_at: { not: null },
        ...(updatedSince
          ? { updated_at: { gte: new Date(updatedSince) } }
          : {}),
        ...(c
          ? {
              OR: [
                { last_message_at: { lt: c.createdAt } },
                { last_message_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ last_message_at: 'desc' }, { id: 'desc' }],
      take: CONVERSATIONS_PAGE + 1,
    });
    const page = rows.slice(0, CONVERSATIONS_PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page, user.sub),
      nextCursor:
        rows.length > CONVERSATIONS_PAGE && last?.last_message_at
          ? encodeCursor({ createdAt: last.last_message_at, id: last.id })
          : null,
    };
  }

  async get(user: RequestUser, id: string): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  async messages(
    user: RequestUser,
    id: string,
    cursor?: string,
    afterId?: string,
  ): Promise<MessagePage> {
    await this.load(user, id);
    if (afterId) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: afterId, conversation_id: id },
        select: { id: true, created_at: true },
      });
      if (!anchor) throw notFound();
      const rows = await this.prisma.message.findMany({
        where: {
          conversation_id: id,
          deleted_at: null,
          OR: [
            { created_at: { gt: anchor.created_at } },
            { created_at: anchor.created_at, id: { gt: anchor.id } },
          ],
        },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        take: CATCH_UP_MAX,
      });
      return {
        items: rows.map((m) => this.toMessage(m, user.sub)),
        nextCursor: null,
      };
    }
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: id,
        deleted_at: null,
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
      take: MESSAGES_PAGE + 1,
    });
    const page = rows.slice(0, MESSAGES_PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map((m) => this.toMessage(m, user.sub)),
      nextCursor:
        rows.length > MESSAGES_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** POST /conversations/:id/messages (§8.4). */
  async send(
    user: RequestUser,
    id: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Empty message.',
        details: { field: 'body' },
      });
    }
    if ([...body].length > MESSAGE_MAX_CHARS) {
      throw new BadRequestException({
        code: ErrorCode.MESSAGE_TOO_LONG,
        message: `A message is at most ${MESSAGE_MAX_CHARS} characters.`,
        details: { max: MESSAGE_MAX_CHARS },
      });
    }
    const conv = await this.load(user, id);
    // A retry of an already stored message: same answer, no new row and
    // no rate-limit charge.
    const existing = await this.findOwn(id, user.sub, dto.clientMessageId);
    if (existing) return this.toMessage(existing, user.sub);

    await this.limits.consume('message', user.sub);
    if (conv.status === 'closed') throw closed();
    if (
      user.sub === conv.attorney_id &&
      !(await this.subscriptions.isActive(user.sub))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'Renew your subscription to send messages.',
      });
    }

    let message: Message;
    try {
      message = await withTxRetry(this.prisma, async (tx) => {
        // Serializes with the file-04 transactions that close the chat or
        // unlock contacts.
        const [locked] = await tx.$queryRaw<
          { status: string; contacts_unlocked: boolean }[]
        >`SELECT status, contacts_unlocked FROM conversations
            WHERE id = ${id}::UUID FOR UPDATE`;
        if (!locked || locked.status === 'closed') throw closed();
        const masked = locked.contacts_unlocked
          ? { text: body, masked: false }
          : maskContactInfo(body);
        const m = await tx.message.create({
          data: {
            conversation_id: id,
            sender_id: user.sub,
            type: 'text',
            body_original: body,
            body_display: masked.text,
            contact_masked: masked.masked,
            client_message_id: dto.clientMessageId,
          },
        });
        await tx.conversation.update({
          where: { id },
          data: { last_message_at: m.created_at, last_message_id: m.id },
        });
        // Your own message is read by you.
        await tx.conversationParticipant.update({
          where: {
            conversation_id_user_id: { conversation_id: id, user_id: user.sub },
          },
          data: { last_read_message_id: m.id },
        });
        return m;
      });
    } catch (error) {
      // A concurrent retry with the same clientMessageId won the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.findOwn(id, user.sub, dto.clientMessageId);
        if (again) return this.toMessage(again, user.sub);
      }
      throw error;
    }

    const other =
      user.sub === conv.client_id ? conv.attorney_id : conv.client_id;
    this.realtime.toUsers([user.sub], 'message:new', {
      message: this.toMessage(message, user.sub),
    });
    this.realtime.toUsers([other], 'message:new', {
      message: this.toMessage(message, other),
    });
    return this.toMessage(message, user.sub);
  }

  /** POST /conversations/:id/read (§8.4): only ever moves forward. */
  async read(
    user: RequestUser,
    id: string,
    lastReadMessageId: string,
  ): Promise<{ lastReadMessageId: string | null }> {
    const conv = await this.load(user, id);
    const target = await this.prisma.message.findFirst({
      where: { id: lastReadMessageId, conversation_id: id },
      select: { id: true, created_at: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    const result = await withTxRetry(this.prisma, async (tx) => {
      const me = await tx.conversationParticipant.findUniqueOrThrow({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        select: { last_read_message_id: true },
      });
      const current = me.last_read_message_id
        ? await tx.message.findUnique({
            where: { id: me.last_read_message_id },
            select: { id: true, created_at: true },
          })
        : null;
      if (current && !isAfter(target, current)) {
        return { lastReadMessageId: current.id, moved: false };
      }
      await tx.conversationParticipant.update({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        data: { last_read_message_id: target.id },
      });
      return { lastReadMessageId: target.id, moved: true };
    });
    if (result.moved) {
      const other =
        user.sub === conv.client_id ? conv.attorney_id : conv.client_id;
      this.realtime.toUsers([other], 'message:read', {
        conversationId: id,
        userId: user.sub,
        lastReadMessageId: result.lastReadMessageId,
      });
    }
    return { lastReadMessageId: result.lastReadMessageId };
  }

  /** PATCH /conversations/:id/mute (§8.4): push off until `until`. */
  async mute(
    user: RequestUser,
    id: string,
    until: string | null,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_user_id: { conversation_id: id, user_id: user.sub },
      },
      data: { muted_until: until ? new Date(until) : null },
    });
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  private sideOf(user: RequestUser): 'client_id' | 'attorney_id' | null {
    return user.role === 'client'
      ? 'client_id'
      : user.role === 'attorney'
        ? 'attorney_id'
        : null;
  }

  /** The conversation if the caller takes part in it, else 404. */
  private async load(user: RequestUser, id: string): Promise<Conversation> {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (
      !conv ||
      (conv.client_id !== user.sub && conv.attorney_id !== user.sub)
    ) {
      throw notFound();
    }
    return conv;
  }

  private findOwn(id: string, senderId: string, clientMessageId: string) {
    return this.prisma.message.findUnique({
      where: {
        conversation_id_sender_id_client_message_id: {
          conversation_id: id,
          sender_id: senderId,
          client_message_id: clientMessageId,
        },
      },
    });
  }

  private toMessage(m: Message, viewerId: string): MessageDto {
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      type: m.type,
      body: m.body_display,
      contactMasked: m.contact_masked,
      clientMessageId: m.sender_id === viewerId ? m.client_message_id : null,
      createdAt: m.created_at,
    };
  }

  /** Rows → DTOs for one viewer in a fixed number of queries. */
  private async present(
    convs: Conversation[],
    viewerId: string,
  ): Promise<ConversationDto[]> {
    if (convs.length === 0) return [];
    const ids = convs.map((c) => c.id);
    const otherIds = convs.map((c) =>
      c.client_id === viewerId ? c.attorney_id : c.client_id,
    );
    const [cases, users, lastMessages, participants, unread] =
      await Promise.all([
        this.prisma.case.findMany({
          where: { id: { in: convs.map((c) => c.case_id) } },
          select: { id: true, title: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: {
              select: { username: true, verification_status: true },
            },
          },
        }),
        this.prisma.message.findMany({
          where: {
            id: {
              in: convs.flatMap((c) =>
                c.last_message_id ? [c.last_message_id] : [],
              ),
            },
          },
        }),
        this.prisma.conversationParticipant.findMany({
          where: { conversation_id: { in: ids } },
          select: {
            conversation_id: true,
            user_id: true,
            last_read_message_id: true,
            muted_until: true,
          },
        }),
        this.prisma.$queryRaw<{ id: string; n: bigint }[]>`
          SELECT cp.conversation_id::STRING AS id, count(m.id) AS n
          FROM conversation_participants cp
          LEFT JOIN messages lr ON lr.id = cp.last_read_message_id
          JOIN messages m ON m.conversation_id = cp.conversation_id
          WHERE cp.user_id = ${viewerId}::UUID
            AND cp.conversation_id = ANY(${ids}::UUID[])
            AND m.deleted_at IS NULL
            AND (m.sender_id IS NULL OR m.sender_id <> ${viewerId}::UUID)
            AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))
          GROUP BY cp.conversation_id`,
      ]);
    const titleOf = new Map(cases.map((c) => [c.id, c.title]));
    const userOf = new Map(users.map((u) => [u.id, u]));
    const messageOf = new Map(lastMessages.map((m) => [m.id, m]));
    const partOf = new Map(
      participants.map((p) => [`${p.conversation_id}:${p.user_id}`, p]),
    );
    const unreadOf = new Map(unread.map((r) => [r.id, Number(r.n)]));

    const out: ConversationDto[] = [];
    for (const c of convs) {
      const otherId = c.client_id === viewerId ? c.attorney_id : c.client_id;
      const other = userOf.get(otherId);
      const otherIsClient = otherId === c.client_id;
      // docs/04 §9: an attorney sees "Клиент по кейсу «…»" (no name, no
      // photo) until contacts are unlocked; a client always sees the
      // attorney's public identity.
      const hidden = otherIsClient && !c.contacts_unlocked;
      const last = c.last_message_id ? messageOf.get(c.last_message_id) : null;
      out.push({
        id: c.id,
        caseId: c.case_id,
        caseTitle: titleOf.get(c.case_id) ?? '',
        status: c.status,
        contactsUnlocked: c.contacts_unlocked,
        counterpart: {
          id: hidden ? null : otherId,
          kind: otherIsClient ? 'client' : 'attorney',
          displayName:
            hidden || !other
              ? null
              : fullName(other.first_name, other.last_name),
          username: other?.attorney_profile?.username ?? null,
          avatarUrl:
            hidden || !other
              ? null
              : (await this.files.avatarUrls(other.avatar_file_id)).url256,
          verifiedBadge:
            other?.attorney_profile?.verification_status === 'verified',
        },
        lastMessage: last ? this.toMessage(last, viewerId) : null,
        lastMessageAt: c.last_message_at,
        unreadCount: unreadOf.get(c.id) ?? 0,
        mutedUntil: partOf.get(`${c.id}:${viewerId}`)?.muted_until ?? null,
        counterpartLastReadMessageId:
          partOf.get(`${c.id}:${otherId}`)?.last_read_message_id ?? null,
        updatedAt: c.updated_at,
      });
    }
    return out;
  }
}
