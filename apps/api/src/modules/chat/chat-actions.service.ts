import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { MessageSearchIndex } from '../../common/secrets/message-search-index';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { maskContactInfo } from '../cases/domain/contact-detector';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { StarsService } from '../stars/stars.service';
import { isSingleEmoji } from './chat-message-extras';
import { ChatService } from './chat.service';
import type { MessageDto, PinsDto } from './chat.dto';
import { MESSAGE_MAX_CHARS } from './chat.dto';

function messageNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Message not found.',
  });
}

/**
 * Owner 2026-10-20 (WhatsApp / Telegram): what you can do with a message
 * after it is sent — edit (admin window, default 15 min), delete for me /
 * for everyone (default 48 h), react with one emoji, pin (at most 3 per
 * chat). Every change reaches both sides as `message:updated` carrying the
 * message as that side sees it; REST stays the source of truth.
 */
@Injectable()
export class ChatActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly settings: AppSettingsService,
    private readonly realtime: RealtimePublisher,
    private readonly stars: StarsService,
    @Optional() private readonly cipher?: MessageBodyCipher,
    @Optional() private readonly notifications?: NotificationsService,
    // BUG-1 (package N-12b): the blind search index follows edits/deletes.
    @Optional() private readonly searchIndex?: MessageSearchIndex,
  ) {}

  private seal(text: string, messageId: string): string {
    return this.cipher?.seal(text, messageId) ?? text;
  }

  private async own(user: RequestUser, id: string, messageId: string) {
    const conv = await this.chat.load(user, id);
    const m = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversation_id: id,
        deleted_at: null,
        hidden_for: { none: { user_id: user.sub } },
      },
    });
    if (!m) throw messageNotFound();
    return { conv, m };
  }

  /** The message as each side sees it, pushed after a change. */
  private async publish(
    conv: Awaited<ReturnType<ChatService['load']>>,
    messageId: string,
  ): Promise<void> {
    const row = await this.prisma.message.findUnique({
      where: {
        id_conversation_id: { id: messageId, conversation_id: conv.id },
      },
    });
    if (!row) return;
    const urls = await this.chat.mediaLinks([row]);
    for (const uid of [conv.client_id, conv.attorney_id]) {
      this.realtime.toUsers([uid], 'message:updated', {
        message: this.chat.toMessage(row, uid, conv, urls),
      });
    }
  }

  private async view(
    user: RequestUser,
    conv: Awaited<ReturnType<ChatService['load']>>,
    messageId: string,
  ): Promise<MessageDto> {
    const row = await this.prisma.message.findUniqueOrThrow({
      where: {
        id_conversation_id: { id: messageId, conversation_id: conv.id },
      },
    });
    return this.chat.toMessage(
      row,
      user.sub,
      conv,
      await this.chat.mediaLinks([row]),
    );
  }

  private expired(message: string): ConflictException {
    return new ConflictException({
      code: ErrorCode.MESSAGE_WINDOW_EXPIRED,
      message,
    });
  }

  /** PATCH …/messages/:messageId — the sender edits a text message. */
  async edit(
    user: RequestUser,
    id: string,
    messageId: string,
    rawBody: string,
  ): Promise<MessageDto> {
    const { conv, m } = await this.own(user, id, messageId);
    if (m.sender_id !== user.sub || m.type !== 'text' || m.revoked_at) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only your own text messages can be edited.',
      });
    }
    if (conv.status === 'closed') {
      throw new ConflictException({
        code: ErrorCode.CONVERSATION_CLOSED,
        message: 'This chat is closed.',
      });
    }
    const windowMin = await this.settings.number('chat.edit_window_min');
    if (
      windowMin <= 0 ||
      Date.now() - m.created_at.getTime() > windowMin * 60_000
    ) {
      throw this.expired('This message can no longer be edited.');
    }
    const body = rawBody.trim();
    if (!body || [...body].length > MESSAGE_MAX_CHARS) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Empty or too long.',
        details: { field: 'body' },
      });
    }
    const masked = conv.contacts_unlocked
      ? { text: body, masked: false }
      : maskContactInfo(body);
    const now = new Date();
    // BUG-1: the edited text is re-tokenized in the same transaction.
    const searchRows =
      this.searchIndex?.rowsFor(
        m,
        masked.text,
        this.searchIndex.enabled ? await this.searchIndex.prefixMode() : false,
      ) ?? [];
    await this.prisma.$transaction([
      this.prisma.messageEdit.create({
        data: {
          message_id: m.id,
          conversation_id: m.conversation_id,
          body_original: m.body_original,
        },
      }),
      this.prisma.message.update({
        where: {
          id_conversation_id: { id: m.id, conversation_id: m.conversation_id },
        },
        data: {
          body_original: this.seal(body, m.id),
          body_display: this.seal(masked.text, m.id),
          contact_masked: masked.masked,
          edited_at: now,
        },
      }),
      // After the row update (its lock orders this with the backfill job).
      this.prisma.messageSearchToken.deleteMany({
        where: { message_id: m.id },
      }),
      this.prisma.messageSearchToken.createMany({
        data: searchRows,
        skipDuplicates: true,
      }),
    ]);
    await this.publish(conv, m.id);
    await this.notify(
      user.sub === conv.client_id ? conv.attorney_id : conv.client_id,
      conv.id,
      m.id,
      { event: 'edit' },
    );
    return this.view(user, conv, m.id);
  }

  /** Push (the dispatcher groups it under the message, skips a muted or
   * open chat and, for an edit, an already read message). */
  private async notify(
    recipientId: string,
    conversationId: string,
    messageId: string,
    extra: Record<string, string>,
  ): Promise<void> {
    try {
      await this.notifications?.emit({
        type: 'new_message',
        recipientId,
        payload: { conversationId, messageId, ...extra },
      });
    } catch {
      // A failed alert never fails the action.
    }
  }

  /** DELETE …/messages/:messageId?scope=me|all. */
  async remove(
    user: RequestUser,
    id: string,
    messageId: string,
    scope: 'me' | 'all',
  ): Promise<void> {
    const { conv, m } = await this.own(user, id, messageId);
    if (scope === 'me') {
      await this.prisma.messageHidden.upsert({
        where: { message_id_user_id: { message_id: m.id, user_id: user.sub } },
        create: {
          message_id: m.id,
          conversation_id: m.conversation_id,
          user_id: user.sub,
        },
        update: {},
      });
      // My other devices drop it too.
      this.realtime.toUsers([user.sub], 'message:updated', {
        hiddenForMe: true,
        messageId: m.id,
        conversationId: conv.id,
      });
      return;
    }
    if (m.sender_id !== user.sub || m.type === 'system' || m.type === 'call') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only your own messages can be deleted for everyone.',
      });
    }
    if (m.revoked_at) return;
    const hours = await this.settings.number('chat.delete_for_all_hours');
    if (hours <= 0 || Date.now() - m.created_at.getTime() > hours * 3_600_000) {
      throw this.expired('This message can no longer be deleted for everyone.');
    }
    await this.prisma.$transaction([
      this.prisma.message.update({
        where: {
          id_conversation_id: { id: m.id, conversation_id: m.conversation_id },
        },
        // The display texts are scrubbed; body_original stays for
        // moderation / legal (§1.6).
        data: {
          revoked_at: new Date(),
          body_display: this.seal('', m.id),
          contact_masked: false,
        },
      }),
      this.prisma.messagePin.deleteMany({ where: { message_id: m.id } }),
      this.prisma.messageReaction.deleteMany({ where: { message_id: m.id } }),
      // BUG-1: the shown text is gone, so are its search tokens.
      this.prisma.messageSearchToken.deleteMany({
        where: { message_id: m.id },
      }),
    ]);
    await this.publish(conv, m.id);
  }

  /** PUT …/messages/:messageId/reaction — one emoji each; null clears. */
  async react(
    user: RequestUser,
    id: string,
    messageId: string,
    emoji: string | null | undefined,
  ): Promise<MessageDto> {
    const { conv, m } = await this.own(user, id, messageId);
    if (m.revoked_at || m.type === 'system') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This message cannot be reacted to.',
      });
    }
    if (!emoji) {
      await this.prisma.messageReaction.deleteMany({
        where: { message_id: m.id, user_id: user.sub },
      });
    } else {
      if (!isSingleEmoji(emoji)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A reaction is one emoji.',
          details: { field: 'emoji' },
        });
      }
      const clean = emoji.trim();
      // A premium emoji costs stars once per user, message and emoji; the
      // charge and the save share one transaction, so a failed save never
      // keeps the stars (402 INSUFFICIENT_STARS leaves the old reaction).
      await withTxRetry(this.prisma, async (tx) => {
        await this.stars.chargeReaction(tx, user.sub, m.id, clean);
        await tx.messageReaction.upsert({
          where: {
            message_id_user_id: { message_id: m.id, user_id: user.sub },
          },
          create: {
            message_id: m.id,
            conversation_id: m.conversation_id,
            user_id: user.sub,
            emoji: clean,
          },
          update: { emoji: clean, created_at: new Date() },
        });
      });
      // Only the author of the message hears about a reaction.
      if (m.sender_id && m.sender_id !== user.sub) {
        await this.notify(m.sender_id, conv.id, m.id, {
          event: 'reaction',
          actorId: user.sub,
          emoji: emoji.trim(),
        });
      }
    }
    await this.publish(conv, m.id);
    return this.view(user, conv, m.id);
  }

  /** POST / DELETE …/messages/:messageId/pin. */
  async pin(
    user: RequestUser,
    id: string,
    messageId: string,
    on: boolean,
  ): Promise<MessageDto> {
    const { conv, m } = await this.own(user, id, messageId);
    if (!on) {
      await this.prisma.messagePin.deleteMany({ where: { message_id: m.id } });
    } else {
      if (m.revoked_at || m.type === 'system') {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This message cannot be pinned.',
        });
      }
      const max = await this.settings.number('chat.max_pins');
      const have = await this.prisma.messagePin.findMany({
        where: { conversation_id: id },
        orderBy: { pinned_at: 'asc' },
        select: { message_id: true },
      });
      if (!have.some((p) => p.message_id === m.id)) {
        // WhatsApp refuses past the limit (Telegram would not); so do we.
        if (have.length >= max) {
          throw new ConflictException({
            code: ErrorCode.MESSAGE_PIN_LIMIT,
            message: `At most ${max} messages can be pinned.`,
            details: { max },
          });
        }
        await this.prisma.messagePin.create({
          data: {
            message_id: m.id,
            conversation_id: id,
            pinned_by: user.sub,
          },
        });
      }
    }
    await this.publish(conv, m.id);
    return this.view(user, conv, m.id);
  }

  /** GET …/pins — the chat's pinned messages, newest pin first. */
  async pinsInfo(user: RequestUser, id: string): Promise<PinsDto> {
    const [items, editWindowMin, deleteForAllHours, maxPins] =
      await Promise.all([
        this.pins(user, id),
        this.settings.number('chat.edit_window_min'),
        this.settings.number('chat.delete_for_all_hours'),
        this.settings.number('chat.max_pins'),
      ]);
    return { items, editWindowMin, deleteForAllHours, maxPins };
  }

  async pins(user: RequestUser, id: string): Promise<MessageDto[]> {
    const conv = await this.chat.load(user, id);
    const pins = await this.prisma.messagePin.findMany({
      where: {
        conversation_id: id,
        message: {
          hidden_for: { none: { user_id: user.sub } },
          revoked_at: null,
        },
      },
      orderBy: { pinned_at: 'desc' },
      include: { message: true },
    });
    const rows = pins.map((p) => p.message);
    const urls = await this.chat.mediaLinks(rows);
    return rows.map((r) => this.chat.toMessage(r, user.sub, conv, urls));
  }
}
