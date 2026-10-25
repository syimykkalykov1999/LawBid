import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { SavedChatKind } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from '../chat/chat.service';
import type { SavedChatItemDto, SavedChatTab } from './chat-saved.dto';

const PAGE = 30;
/** One person keeps at most this many saved messages. */
export const SAVED_CHAT_MAX = 5000;
/** A search reads this many of the newest saved messages (they are sealed
 * in the database, so the match happens after opening them). */
const SEARCH_SCAN = 600;

const TAB_KINDS: Record<SavedChatTab, SavedChatKind[] | null> = {
  all: null,
  media: ['media', 'voice'],
  files: ['file'],
  links: ['link'],
};

function fold(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

/**
 * Owner 2026-10-20: «Сохранённое» for chat messages (WeChat favorites /
 * Telegram Saved Messages). A row is only a reference to the message; what
 * the person sees is read again through the chat, so a chat they left shows
 * nothing and a deleted message disappears.
 */
@Injectable()
export class ChatSavedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    // Owner 2026-10-25: saves per minute against scripts.
    @Optional() private readonly limits?: UsageLimitsService,
  ) {}

  /** Saves a message (idempotent). */
  async save(user: RequestUser, messageId: string): Promise<void> {
    await this.limits?.consume('chat_save', user.sub);
    const { kind, conversationId } = await this.chat.savableKind(
      user,
      messageId,
    );
    const have = await this.prisma.savedChatMessage.findUnique({
      where: {
        user_id_message_id: { user_id: user.sub, message_id: messageId },
      },
      select: { message_id: true },
    });
    if (have) return;
    const count = await this.prisma.savedChatMessage.count({
      where: { user_id: user.sub },
    });
    if (count >= SAVED_CHAT_MAX) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `At most ${SAVED_CHAT_MAX} saved messages.`,
        details: { max: SAVED_CHAT_MAX },
      });
    }
    await this.prisma.savedChatMessage.createMany({
      data: [
        {
          user_id: user.sub,
          message_id: messageId,
          conversation_id: conversationId,
          kind,
        },
      ],
      skipDuplicates: true,
    });
  }

  async remove(user: RequestUser, messageId: string): Promise<void> {
    await this.prisma.savedChatMessage.deleteMany({
      where: { user_id: user.sub, message_id: messageId },
    });
  }

  /** Ids of the saved messages — the chat marks them in its menu. */
  async ids(user: RequestUser): Promise<string[]> {
    const rows = await this.prisma.savedChatMessage.findMany({
      where: { user_id: user.sub },
      select: { message_id: true },
      orderBy: [{ created_at: 'desc' }, { message_id: 'desc' }],
      take: SAVED_CHAT_MAX,
    });
    return rows.map((r) => r.message_id);
  }

  async list(
    user: RequestUser,
    tab: SavedChatTab = 'all',
    q?: string,
    cursor?: string,
  ): Promise<{ items: SavedChatItemDto[]; nextCursor: string | null }> {
    const kinds = TAB_KINDS[tab];
    const where = {
      user_id: user.sub,
      ...(kinds ? { kind: { in: kinds } } : {}),
    };
    const words = fold(q ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length > 0) return this.search(user, where, words);

    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.savedChatMessage.findMany({
      where: {
        ...where,
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, message_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { message_id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(user, page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.message_id })
          : null,
    };
  }

  private async search(
    user: RequestUser,
    where: { user_id: string; kind?: { in: SavedChatKind[] } },
    words: string[],
  ): Promise<{ items: SavedChatItemDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.savedChatMessage.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { message_id: 'desc' }],
      take: SEARCH_SCAN,
    });
    const items = (await this.present(user, rows)).filter((i) => {
      const hay = fold(
        [
          i.message.type === 'contact'
            ? (i.message.contact?.displayName ?? '')
            : i.message.body,
          i.message.attachment?.name ?? '',
          i.chat.counterpart.displayName ?? '',
          i.chat.counterpart.username ?? '',
          i.chat.caseTitle ?? '',
        ].join(' '),
      );
      return words.every((w) => hay.includes(w));
    });
    return { items: items.slice(0, PAGE * 2), nextCursor: null };
  }

  private async present(
    user: RequestUser,
    rows: { message_id: string; conversation_id: string; created_at: Date }[],
  ): Promise<SavedChatItemDto[]> {
    const seen = await this.chat.messagesWithChats(
      user,
      rows.map((r) => ({
        id: r.message_id,
        conversationId: r.conversation_id,
      })),
    );
    const savedAt = new Map(rows.map((r) => [r.message_id, r.created_at]));
    return seen.map(({ message, chat }) => ({
      savedAt: savedAt.get(message.id) ?? message.createdAt,
      message,
      chat,
      mine: message.senderId === user.sub,
    }));
  }
}
