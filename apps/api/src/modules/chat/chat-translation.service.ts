import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  type TextTranslation,
  TranslationService,
  translationUnavailable,
} from '../translation/translation.service';

export type MessageTranslation = TextTranslation;

/**
 * Owner 2026-10-04: "Translate" under a chat message. The app shows the
 * button only while the chat zone is on and the key is saved (bootstrap
 * gate); TranslationService checks the same before calling Google.
 * Translates the displayed text (hidden contacts stay hidden).
 */
@Injectable()
export class ChatTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translation: TranslationService,
  ) {}

  async translate(
    user: RequestUser,
    conversationId: string,
    messageId: string,
    target: string,
  ): Promise<MessageTranslation> {
    // Plan, then zone and key: nothing is read when translation is off.
    await this.translation.assertEntitled(user);
    if (!(await this.translation.apiKey('chat'))) {
      throw translationUnavailable();
    }
    const m = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversation_id: conversationId,
        deleted_at: null,
        type: { in: ['text', 'attachment'] },
      },
      select: { body_display: true },
    });
    const text = m?.body_display.trim() ?? '';
    if (!m || text === '') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    return this.translation.translate(
      user,
      'chat',
      `msg:${messageId}`,
      text,
      target,
    );
  }
}
