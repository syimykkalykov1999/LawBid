import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChatGroupMessage } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { GroupPresenter, NOBODY } from './group-presenter.service';
import {
  type CreatePollDto,
  type GroupMessageDto,
  type PollDto,
  type PollVoterOptionDto,
} from './groups.dto';
import { GroupsService } from './groups.service';

/**
 * Owner 2026-10-20: polls in a group, Telegram-style. One or several
 * answers, anonymous or open (who voted), revote or retract, closed by the
 * author or an admin. The poll is a message of type `poll`; counters travel
 * as `poll:update` (viewer-neutral — the app keeps its own picks).
 */
@Injectable()
export class GroupPollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly groups: GroupsService,
    private readonly presenter: GroupPresenter,
  ) {}

  async create(
    user: RequestUser,
    groupId: string,
    dto: CreatePollDto,
  ): Promise<GroupMessageDto> {
    const m = await this.groups.requireMember(user.sub, groupId);
    if (!(m.admin || m.group.who_can_post === 'all')) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'Only admins can write in this group.',
      });
    }
    const topic = await this.groups.writableTopic(m, dto.topicId);
    const options = dto.options.map((o) => o.trim()).filter(Boolean);
    const distinct = new Set(options.map((o) => o.toLowerCase()));
    if (options.length < 2 || distinct.size !== options.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A poll needs at least two different options.',
        details: { field: 'options' },
      });
    }
    const existing = await this.prisma.chatGroupMessage.findUnique({
      where: {
        deleted_at: {},
        group_id_sender_id_client_message_id: {
          group_id: groupId,
          sender_id: user.sub,
          client_message_id: dto.clientMessageId,
        },
      },
    });
    if (existing) {
      return (await this.presenter.messages([existing], user.sub))[0];
    }
    let row: ChatGroupMessage;
    try {
      row = await withTxRetry(this.prisma, async (tx) => {
        const msg = await tx.chatGroupMessage.create({
          data: {
            group_id: groupId,
            sender_id: user.sub,
            type: 'poll',
            body: '',
            topic_id: topic && !topic.is_general ? topic.id : null,
            client_message_id: dto.clientMessageId,
            poll: {
              create: {
                group_id: groupId,
                creator_id: user.sub,
                question: dto.question.trim(),
                multiple: dto.multiple,
                anonymous: dto.anonymous,
                options: {
                  create: options.map((text, position) => ({ text, position })),
                },
              },
            },
          },
        });
        await tx.chatGroup.update({
          where: { id: groupId },
          data: { last_message_id: msg.id, last_message_at: msg.created_at },
        });
        if (topic) await this.groups.bumpTopic(tx, topic.id, msg);
        return msg;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.chatGroupMessage.findUnique({
          where: {
            deleted_at: {},
            group_id_sender_id_client_message_id: {
              group_id: groupId,
              sender_id: user.sub,
              client_message_id: dto.clientMessageId,
            },
          },
        });
        if (again) {
          return (await this.presenter.messages([again], user.sub))[0];
        }
      }
      throw error;
    }
    await this.groups.fanOut(groupId, row);
    return (await this.presenter.messages([row], user.sub))[0];
  }

  /** Set my answer (an empty list retracts it); returns the poll for me. */
  async vote(
    user: RequestUser,
    groupId: string,
    pollId: string,
    optionIds: string[],
  ): Promise<PollDto> {
    await this.groups.requireMember(user.sub, groupId);
    const poll = await this.load(groupId, pollId);
    if (poll.closed_at) {
      throw new ConflictException({
        code: ErrorCode.POLL_CLOSED,
        message: 'This poll is closed.',
      });
    }
    const valid = new Set(poll.options.map((o) => o.id));
    if (
      optionIds.some((o) => !valid.has(o)) ||
      (!poll.multiple && optionIds.length > 1)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: poll.multiple
          ? 'Unknown option.'
          : 'This poll allows one answer.',
        details: { field: 'optionIds' },
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.chatGroupPollVote.deleteMany({
        where: { poll_id: pollId, user_id: user.sub },
      });
      if (optionIds.length > 0) {
        await tx.chatGroupPollVote.createMany({
          data: optionIds.map((option_id) => ({
            poll_id: pollId,
            option_id,
            user_id: user.sub,
          })),
        });
      }
    });
    return this.publish(groupId, pollId, poll.message_id, user.sub);
  }

  async close(
    user: RequestUser,
    groupId: string,
    pollId: string,
  ): Promise<PollDto> {
    const m = await this.groups.requireMember(user.sub, groupId);
    const poll = await this.load(groupId, pollId);
    if (poll.creator_id !== user.sub && !m.admin) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'Only the author or an admin can close the poll.',
      });
    }
    if (!poll.closed_at) {
      await this.prisma.chatGroupPoll.update({
        where: { id: pollId },
        data: { closed_at: new Date(), closed_by: user.sub },
      });
    }
    return this.publish(groupId, pollId, poll.message_id, user.sub);
  }

  /** Who voted for what — only for open (non-anonymous) polls. */
  async voters(
    user: RequestUser,
    groupId: string,
    pollId: string,
  ): Promise<PollVoterOptionDto[]> {
    await this.groups.requireMember(user.sub, groupId);
    const poll = await this.load(groupId, pollId);
    if (poll.anonymous) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_FORBIDDEN,
        message: 'This poll is anonymous.',
      });
    }
    const votes = await this.prisma.chatGroupPollVote.findMany({
      where: { poll_id: pollId },
      orderBy: { created_at: 'asc' },
      select: { option_id: true, user_id: true },
    });
    const people = await this.presenter.people(votes.map((v) => v.user_id));
    return poll.options.map((o) => ({
      optionId: o.id,
      voters: votes
        .filter((v) => v.option_id === o.id)
        .flatMap((v) => {
          const p = people.get(v.user_id);
          return p ? [p] : [];
        }),
    }));
  }

  private async load(groupId: string, pollId: string) {
    const poll = await this.prisma.chatGroupPoll.findFirst({
      where: { id: pollId, group_id: groupId },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    if (!poll) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Poll not found.',
      });
    }
    return poll;
  }

  /** Counters to every member (viewer-neutral), the poll back for [viewer]. */
  private async publish(
    groupId: string,
    pollId: string,
    messageId: string,
    viewerId: string,
  ): Promise<PollDto> {
    const poll = await this.load(groupId, pollId);
    const [mine, neutral] = await Promise.all([
      this.presenter.pollsFromRows([poll], viewerId),
      this.presenter.pollsFromRows([poll], NOBODY),
    ]);
    this.realtime.toUsers(
      await this.groups.activeMemberIds(groupId),
      'poll:update',
      {
        groupId,
        messageId,
        // An anonymous poll never says who voted.
        ...(poll.anonymous ? {} : { actorId: viewerId }),
        poll: neutral.get(pollId),
      },
    );
    return mine.get(pollId)!;
  }
}
