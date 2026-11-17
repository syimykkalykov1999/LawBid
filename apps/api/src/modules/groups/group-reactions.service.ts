import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { isSingleEmoji } from '../chat/chat-message-extras';
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
    }
    await this.groups.broadcast(groupId, row);
    return (await this.presenter.messages([row], user.sub))[0];
  }
}
