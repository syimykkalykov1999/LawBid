import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { isSingleEmoji } from '../chat/chat-message-extras';
import { NotificationsService } from '../notifications/notifications.service';
import { StarsService } from '../stars/stars.service';
import { GroupPresenter } from './group-presenter.service';
import type { GroupMessageDto } from './groups.dto';
import { GroupsService } from './groups.service';

/**
 * Groups WhatsApp parity: emoji reactions on group messages, copied from
 * the 1:1 chat (ChatActionsService.react): one emoji per person per
 * message, a new one replaces the old, null takes it away; a premium emoji
 * costs stars once per person, message and emoji, in the same transaction
 * as the save. Every member may react (also where only admins write, as in
 * WhatsApp / Telegram); the change reaches the members as `group:message`
 * through the group's ordered fan-out queue.
 */
@Injectable()
export class GroupReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly presenter: GroupPresenter,
    private readonly stars: StarsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** PUT /groups/:id/messages/:messageId/reaction. */
  async react(
    user: RequestUser,
    groupId: string,
    messageId: string,
    emoji: string | null | undefined,
  ): Promise<GroupMessageDto> {
    await this.groups.assertEnabled();
    await this.groups.requireMember(user.sub, groupId);
    const row = await this.prisma.chatGroupMessage.findFirst({
      where: { id: messageId, group_id: groupId },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Message not found.',
      });
    }
    if (row.type === 'system') {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'This message cannot be reacted to.',
      });
    }
    if (!emoji) {
      await this.prisma.chatGroupMessageReaction.deleteMany({
        where: { message_id: row.id, group_id: groupId, user_id: user.sub },
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
      await withTxRetry(this.prisma, async (tx) => {
        await this.stars.chargeReaction(tx, user.sub, row.id, clean);
        await tx.chatGroupMessageReaction.upsert({
          where: {
            message_id_user_id: { message_id: row.id, user_id: user.sub },
          },
          create: {
            message_id: row.id,
            group_id: groupId,
            user_id: user.sub,
            emoji: clean,
          },
          update: { emoji: clean, created_at: new Date() },
        });
      });
      // Only the author of the message hears about a reaction (the 1:1
      // ChatActionsService.react push: «Kim: Реакция 👍 «text»»).
      if (row.sender_id && row.sender_id !== user.sub) {
        await this.notifyAuthor(row.sender_id, groupId, row.id, {
          actorId: user.sub,
          emoji: clean,
        });
      }
    }
    await this.groups.broadcast(groupId, row);
    return (await this.presenter.messages([row], user.sub))[0];
  }

  /** A failed alert never fails the reaction. */
  private async notifyAuthor(
    recipientId: string,
    groupId: string,
    messageId: string,
    extra: { actorId: string; emoji: string },
  ): Promise<void> {
    try {
      await this.notifications?.emit({
        type: 'new_message',
        recipientId,
        payload: {
          groupId,
          conversationId: groupId,
          messageId,
          event: 'reaction',
          ...extra,
        },
      });
    } catch {
      // The push queue is down: the reaction itself is saved.
    }
  }
}
