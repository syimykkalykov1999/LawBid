import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { GroupPresenter } from './group-presenter.service';
import type { GroupMessageReadersDto } from './groups.dto';
import { GroupsService } from './groups.service';

/** A read mark covers [target] when it is the same message or a later one
 * (time, then id — the order of the thread and of POST /read). */
export function covers(
  mark: { id: string; created_at: Date },
  target: { id: string; created_at: Date },
): boolean {
  const a = mark.created_at.getTime();
  const b = target.created_at.getTime();
  return a > b || (a === b && mark.id >= target.id);
}

/**
 * Groups WhatsApp parity: read receipts of my message («Данные» →
 * «Прочитано»), from the read marks the group already keeps — each
 * member's `last_read_message_id` (POST /groups/:id/read), or the topic's
 * one in forum groups (the same fallback as `GroupsService.read`). Read on
 * demand only, never per page: one query for the members, one for the
 * topic marks, one for the marked messages, one for the people. Only the
 * author asks (WhatsApp shows «Данные» only on my own messages).
 */
@Injectable()
export class GroupReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly presenter: GroupPresenter,
  ) {}

  /** GET /groups/:id/messages/:messageId/readers. */
  async readers(
    user: RequestUser,
    groupId: string,
    messageId: string,
  ): Promise<GroupMessageReadersDto> {
    await this.groups.assertEnabled();
    const m = await this.groups.requireMember(user.sub, groupId);
    const target = await this.prisma.chatGroupMessage.findFirst({
      where: { id: messageId, group_id: groupId },
      select: {
        id: true,
        created_at: true,
        sender_id: true,
        topic_id: true,
        type: true,
      },
    });
    if (!target || target.type === 'system') {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Message not found.',
      });
    }
    if (target.sender_id !== user.sub) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'Only the author sees who read a message.',
      });
    }
    const members = await this.prisma.chatGroupMember.findMany({
      where: { group_id: groupId, left_at: null, user_id: { not: user.sub } },
      select: { user_id: true, last_read_message_id: true },
    });
    const marks = new Map<string, string>();
    for (const r of members) {
      if (r.last_read_message_id) marks.set(r.user_id, r.last_read_message_id);
    }
    const topicId = m.group.topics_enabled
      ? (target.topic_id ?? m.group.general_topic_id)
      : null;
    if (topicId && members.length) {
      const topicReads = await this.prisma.chatGroupTopicRead.findMany({
        where: {
          topic_id: topicId,
          user_id: { in: members.map((r) => r.user_id) },
        },
        select: { user_id: true, last_read_message_id: true },
      });
      for (const r of topicReads) {
        if (r.last_read_message_id) {
          marks.set(r.user_id, r.last_read_message_id);
        }
      }
    }
    const markRows = marks.size
      ? await this.prisma.chatGroupMessage.findMany({
          where: {
            id: { in: [...new Set(marks.values())] },
            group_id: groupId,
            deleted_at: {},
          },
          select: { id: true, created_at: true },
        })
      : [];
    const markOf = new Map(markRows.map((r) => [r.id, r]));
    const readerIds = members
      .map((r) => r.user_id)
      .filter((uid) => {
        const mark = markOf.get(marks.get(uid) ?? '');
        return mark !== undefined && covers(mark, target);
      });
    const people = await this.presenter.people(readerIds);
    return {
      readers: readerIds.flatMap((id) => {
        const p = people.get(id);
        return p ? [p] : [];
      }),
      recipients: members.length,
    };
  }
}
