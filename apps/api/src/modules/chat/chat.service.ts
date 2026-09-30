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
import { BlocksService } from '../blocks/blocks.service';
import { maskContactInfo } from '../cases/domain/contact-detector';
import { FilesService } from '../files/files.service';
import { BadgesService, UNREAD_CAP } from '../notifications/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  MESSAGE_MAX_CHARS,
  type CallLogDto,
  type ConversationDto,
  type ConversationPage,
  type MessageDto,
  type MessagePage,
  type SendMessageDto,
} from './chat.dto';

const CONVERSATIONS_PAGE = 20;
const MESSAGES_PAGE = 30;
const CATCH_UP_MAX = 100;
/** OQ-043: messages a requester may send before acceptance. */
export const DIRECT_REQUEST_MAX_MESSAGES = 3;

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
    private readonly notifications: NotificationsService,
    private readonly badges: BadgesService,
    private readonly blocks: BlocksService,
  ) {}

  async list(
    user: RequestUser,
    cursor?: string,
    updatedSince?: string,
    folder: 'primary' | 'requests' = 'primary',
  ): Promise<ConversationPage> {
    if (!this.sideOf(user)) return { items: [], nextCursor: null };
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [
          { OR: [{ client_id: user.sub }, { attorney_id: user.sub }] },
          // OQ-043: requests sent to me wait in "Requests"; everything
          // else (case chats, accepted chats, my own requests) is primary.
          folder === 'requests'
            ? {
                request_status: 'pending',
                requested_by: { not: user.sub },
              }
            : {
                OR: [
                  { request_status: { in: ['none', 'accepted'] } },
                  { requested_by: user.sub },
                ],
              },
        ],
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
    const conv = await this.load(user, id);
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
      const urls = await this.voiceUrls(rows);
      return {
        items: rows.map((m) => this.toMessage(m, user.sub, conv, urls)),
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
    const urls = await this.voiceUrls(page);
    return {
      items: page.map((m) => this.toMessage(m, user.sub, conv, urls)),
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
    const voice = dto.type === 'voice';
    const body = voice ? '' : (dto.body ?? '').trim();
    if (voice) {
      if (!dto.fileId || dto.durationMs === undefined) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A voice message needs fileId and durationMs.',
          details: { fields: ['fileId', 'durationMs'] },
        });
      }
    } else if (!body) {
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
    if (existing) {
      return this.toMessage(
        existing,
        user.sub,
        undefined,
        await this.voiceUrls([existing]),
      );
    }

    await this.limits.consume('message', user.sub);
    if (conv.status === 'closed') throw closed();
    // OQ-043: a message request — the recipient's reply accepts it; the
    // requester may send up to 3 messages until then; a declined request
    // takes no more.
    let requestFirst = false;
    if (conv.request_status === 'pending') {
      if (conv.requested_by === user.sub) {
        const sent = await this.prisma.message.count({
          where: { conversation_id: id, sender_id: user.sub, deleted_at: null },
        });
        if (sent >= DIRECT_REQUEST_MAX_MESSAGES) {
          throw new ConflictException({
            code: ErrorCode.MESSAGE_REQUEST_LIMIT,
            message: 'Wait until your message request is accepted.',
          });
        }
        requestFirst = sent === 0;
      } else {
        await this.prisma.conversation.update({
          where: { id },
          data: { request_status: 'accepted' },
        });
        conv.request_status = 'accepted';
      }
    } else if (
      conv.request_status === 'declined' &&
      conv.requested_by === user.sub
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MESSAGE_REQUEST_DECLINED,
        message: 'This person does not accept your messages.',
      });
    }
    // OQ-028: no messages either way while one side blocks the other.
    await this.blocks.assertNotBlocked(
      user.sub,
      user.sub === conv.attorney_id ? conv.client_id : conv.attorney_id,
    );
    if (
      user.sub === conv.attorney_id &&
      !(await this.subscriptions.isActive(user.sub))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'Renew your subscription to send messages.',
      });
    }
    if (voice) {
      await this.files.assertAttachable(user.sub, dto.fileId!, ['chat_voice']);
      // One note, one message: a file is never re-sent elsewhere.
      const used = await this.prisma.message.findFirst({
        where: { file_id: dto.fileId },
        select: { id: true },
      });
      if (used) {
        throw new ConflictException({
          code: ErrorCode.FILE_NOT_ATTACHABLE,
          message: 'This voice note was already sent.',
        });
      }
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
        const masked =
          voice || locked.contacts_unlocked
            ? { text: body, masked: false }
            : maskContactInfo(body);
        const m = await tx.message.create({
          data: {
            conversation_id: id,
            sender_id: user.sub,
            type: voice ? 'voice' : 'text',
            body_original: body,
            body_display: masked.text,
            contact_masked: masked.masked,
            client_message_id: dto.clientMessageId,
            ...(voice
              ? {
                  file_id: dto.fileId,
                  duration_ms: dto.durationMs,
                  waveform: dto.waveform ?? [],
                }
              : {}),
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
        if (again) {
          return this.toMessage(
            again,
            user.sub,
            undefined,
            await this.voiceUrls([again]),
          );
        }
      }
      throw error;
    }

    const other =
      user.sub === conv.client_id ? conv.attorney_id : conv.client_id;
    const urls = await this.voiceUrls([message]);
    this.realtime.toUsers([user.sub], 'message:new', {
      message: this.toMessage(message, user.sub, undefined, urls),
    });
    this.realtime.toUsers([other], 'message:new', {
      message: this.toMessage(message, other, conv, urls),
    });
    // §8.4: badge + push to the recipient (the dispatcher skips it while
    // the chat is open on their device or muted). OQ-043: a pending
    // request pings once (its first message) and never bumps the badge.
    const pendingRequest =
      conv.request_status === 'pending' && conv.requested_by === user.sub;
    if (!pendingRequest) await this.badges.messageArrived(other);
    if (!pendingRequest || requestFirst) {
      await this.notifications.emit({
        type: 'new_message',
        recipientId: other,
        payload: { conversationId: id, messageId: message.id },
      });
    }
    return this.toMessage(message, user.sub, undefined, urls);
  }

  /**
   * POST /conversations/:id/messages/:messageId/listened (OQ-040): the
   * recipient played a voice note — the sender's dot turns off. Only the
   * first play counts; the sender's own plays never do.
   */
  async listened(
    user: RequestUser,
    id: string,
    messageId: string,
  ): Promise<MessageDto> {
    const conv = await this.load(user, id);
    const m = await this.prisma.message.findFirst({
      where: { id: messageId, conversation_id: id, deleted_at: null },
    });
    if (!m || m.type !== 'voice') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Voice message not found.',
      });
    }
    let row = m;
    if (m.sender_id !== user.sub && !m.listened_at) {
      row = await this.prisma.message.update({
        where: { id: m.id },
        data: { listened_at: new Date() },
      });
      if (m.sender_id) {
        this.realtime.toUsers([m.sender_id], 'message:listened', {
          conversationId: id,
          messageId: m.id,
        });
      }
    }
    return this.toMessage(row, user.sub, conv, await this.voiceUrls([row]));
  }

  /**
   * OQ-041: a message written by the server on someone's behalf (a call
   * in the chat log) — to both members over realtime, like a sent one.
   * [unreadFor] also gets a badge bump (a missed call).
   */
  async announce(m: Message, unreadFor?: string): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: m.conversation_id },
    });
    if (!conv) return;
    for (const uid of [conv.client_id, conv.attorney_id]) {
      this.realtime.toUsers([uid], 'message:new', {
        message: this.toMessage(m, uid, conv),
      });
    }
    if (unreadFor) await this.badges.messageArrived(unreadFor);
  }

  /**
   * POST /conversations/direct (OQ-043): the "Message" button on a
   * profile — the one direct chat of this attorney/client pair, created
   * as a request of the caller if new. Hidden from lists until its first
   * message.
   */
  async startDirect(
    user: RequestUser,
    otherUserId: string,
  ): Promise<ConversationDto> {
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, deleted_at: null, status: 'active' },
      select: { id: true, role: true },
    });
    if (!other) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const pair =
      user.role === 'attorney' && other.role === 'client'
        ? { attorney_id: user.sub, client_id: other.id }
        : user.role === 'client' && other.role === 'attorney'
          ? { attorney_id: other.id, client_id: user.sub }
          : null;
    if (!pair) {
      throw new ConflictException({
        code: ErrorCode.DIRECT_CHAT_NOT_ALLOWED,
        message: 'Direct chats are between an attorney and a client.',
      });
    }
    await this.blocks.assertNotBlocked(user.sub, other.id);
    const existing = await this.prisma.conversation.findFirst({
      where: { ...pair, case_id: null },
    });
    if (existing) return this.get(user, existing.id);
    let conv: Conversation;
    try {
      conv = await this.prisma.conversation.create({
        data: {
          ...pair,
          status: 'active',
          contacts_unlocked: false,
          request_status: 'pending',
          requested_by: user.sub,
          participants: {
            create: [
              { user_id: pair.attorney_id },
              { user_id: pair.client_id },
            ],
          },
        },
      });
    } catch (error) {
      // A double tap: the other request created it first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.conversation.findFirstOrThrow({
          where: { ...pair, case_id: null },
        });
        return this.get(user, again.id);
      }
      throw error;
    }
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  /** GET /conversations/requests/count (OQ-043): requests waiting for me. */
  async requestsCount(user: RequestUser): Promise<{ count: number }> {
    const count = await this.prisma.conversation.count({
      where: {
        OR: [{ client_id: user.sub }, { attorney_id: user.sub }],
        request_status: 'pending',
        requested_by: { not: user.sub },
        last_message_at: { not: null },
      },
    });
    return { count };
  }

  /** POST /conversations/:id/request/accept | decline (OQ-043). */
  async answerRequest(
    user: RequestUser,
    id: string,
    accept: boolean,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    if (conv.request_status !== 'pending' || conv.requested_by === user.sub) {
      const [dto] = await this.present([conv], user.sub);
      return dto;
    }
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { request_status: accept ? 'accepted' : 'declined' },
    });
    if (accept && conv.requested_by) {
      this.realtime.toUsers([conv.requested_by], 'conversation:update', {
        conversationId: id,
      });
    }
    await this.badges.chatsChanged(user.sub);
    const [dto] = await this.present([updated], user.sub);
    return dto;
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
      // No user id: the receiver knows it was the other side.
      this.realtime.toUsers([other], 'message:read', {
        conversationId: id,
        lastReadMessageId: result.lastReadMessageId,
      });
      await this.badges.chatsChanged(user.sub);
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

  /** Signed links for the voice notes among [rows]. */
  private voiceUrls(rows: Message[]): Promise<Map<string, string>> {
    return this.files.voiceUrls(
      rows.flatMap((m) => (m.type === 'voice' && m.file_id ? [m.file_id] : [])),
    );
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

  /** Security review (docs/05): while contacts are locked the attorney
   * must not learn the client's user id — their messages come with
   * senderId null (the app treats "not mine" the same). */
  private toMessage(
    m: Message,
    viewerId: string,
    conv?: Pick<
      Conversation,
      'attorney_id' | 'client_id' | 'contacts_unlocked' | 'case_id'
    >,
    voiceUrls?: Map<string, string>,
  ): MessageDto {
    const hideSender =
      conv !== undefined &&
      conv.case_id !== null &&
      viewerId === conv.attorney_id &&
      !conv.contacts_unlocked &&
      m.sender_id === conv.client_id;
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: hideSender ? null : m.sender_id,
      type: m.type,
      voice:
        m.type === 'voice'
          ? {
              url: m.file_id ? (voiceUrls?.get(m.file_id) ?? null) : null,
              durationMs: m.duration_ms ?? 0,
              waveform: m.waveform,
              listened: m.listened_at !== null,
            }
          : null,
      call:
        m.type === 'call'
          ? {
              outcome: m.body_display as CallLogDto['outcome'],
              durationSec: Math.round((m.duration_ms ?? 0) / 1000),
            }
          : null,
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
          where: {
            id: {
              in: convs.flatMap((c) => (c.case_id ? [c.case_id] : [])),
            },
          },
          select: { id: true, title: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: {
              select: {
                username: true,
                verification_status: true,
                name_mismatch: true,
              },
            },
            client_profile: { select: { username: true } },
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
          SELECT cp.conversation_id::STRING AS id,
                 (SELECT count(*) FROM (
                    SELECT 1 FROM messages m
                    WHERE m.conversation_id = cp.conversation_id
                      AND m.deleted_at IS NULL
                      AND (m.sender_id IS NULL OR m.sender_id <> ${viewerId}::UUID)
                      AND (lr.id IS NULL
                           OR (m.created_at, m.id) > (lr.created_at, lr.id))
                    ORDER BY m.created_at DESC
                    LIMIT ${UNREAD_CAP}) x) AS n
          FROM conversation_participants cp
          LEFT JOIN messages lr ON lr.id = cp.last_read_message_id
          WHERE cp.user_id = ${viewerId}::UUID
            AND cp.conversation_id = ANY(${ids}::UUID[])`,
      ]);
    const titleOf = new Map(cases.map((c) => [c.id, c.title]));
    const userOf = new Map(users.map((u) => [u.id, u]));
    const messageOf = new Map(lastMessages.map((m) => [m.id, m]));
    const partOf = new Map(
      participants.map((p) => [`${p.conversation_id}:${p.user_id}`, p]),
    );
    const unreadOf = new Map(unread.map((r) => [r.id, Number(r.n)]));
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );

    const out: ConversationDto[] = [];
    for (const c of convs) {
      const otherId = c.client_id === viewerId ? c.attorney_id : c.client_id;
      const other = userOf.get(otherId);
      const otherIsClient = other?.role !== 'attorney';
      // docs/04 §9: an attorney sees "Клиент по кейсу «…»" (no name, no
      // photo) until contacts are unlocked; a client always sees the
      // attorney's public identity.
      // OQ-043: in a direct chat both sides are public profiles.
      const hidden =
        otherIsClient && !c.contacts_unlocked && c.case_id !== null;
      // No "Seen" for the requester until the request is accepted.
      const seenHidden =
        c.request_status === 'pending' && c.requested_by === viewerId;
      const last = c.last_message_id ? messageOf.get(c.last_message_id) : null;
      out.push({
        id: c.id,
        caseId: c.case_id,
        caseTitle: c.case_id ? (titleOf.get(c.case_id) ?? null) : null,
        status: c.status,
        contactsUnlocked: c.contacts_unlocked,
        counterpart: {
          id: hidden ? null : otherId,
          kind: otherIsClient ? 'client' : 'attorney',
          displayName:
            hidden || !other
              ? null
              : fullName(other.first_name, other.last_name),
          username:
            other?.attorney_profile?.username ??
            (hidden ? null : (other?.client_profile?.username ?? null)),
          avatarUrl:
            hidden || !other
              ? null
              : other.avatar_file_id
                ? (avatars.get(other.avatar_file_id)?.url256 ?? null)
                : null,
          verifiedBadge:
            other?.attorney_profile?.verification_status === 'verified' &&
            !other.attorney_profile.name_mismatch,
        },
        lastMessage: last ? this.toMessage(last, viewerId, c) : null,
        lastMessageAt: c.last_message_at,
        unreadCount: unreadOf.get(c.id) ?? 0,
        mutedUntil: partOf.get(`${c.id}:${viewerId}`)?.muted_until ?? null,
        counterpartLastReadMessageId: seenHidden
          ? null
          : (partOf.get(`${c.id}:${otherId}`)?.last_read_message_id ?? null),
        kind: c.case_id ? 'case' : 'direct',
        requestStatus: c.request_status,
        requestedByMe: c.requested_by === viewerId,
        updatedAt: c.updated_at,
      });
    }
    return out;
  }
}
