import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupPresenter } from './group-presenter.service';
import type {
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminGroupPage,
} from './admin-groups.dto';
import { GroupsService } from './groups.service';

const PAGE = 30;

/** Owner 2026-10-20: the admin panel's view of group chats — find a group,
 * see who is in it, remove a member, close the group. */
@Injectable()
export class AdminGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: GroupPresenter,
    private readonly groups: GroupsService,
  ) {}

  async list(q?: string, cursor?: string): Promise<AdminGroupPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const where: Prisma.ChatGroupWhereInput = {
      ...(q?.trim()
        ? { title: { contains: q.trim(), mode: 'insensitive' } }
        : {}),
      ...(c
        ? {
            OR: [
              { created_at: { lt: c.createdAt } },
              { created_at: c.createdAt, id: { lt: c.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.chatGroup.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async get(id: string): Promise<AdminGroupDetailDto> {
    const g = await this.prisma.chatGroup.findUnique({ where: { id } });
    if (!g) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Group not found.',
      });
    }
    const [[dto], members] = await Promise.all([
      this.present([g]),
      this.prisma.chatGroupMember.findMany({
        where: { group_id: id, left_at: null },
      }),
    ]);
    return { ...dto, members: await this.presenter.members(members) };
  }

  removeMember(groupId: string, userId: string): Promise<void> {
    return this.groups.adminRemoveMember(groupId, userId);
  }

  deleteGroup(groupId: string): Promise<void> {
    return this.groups.adminDeleteGroup(groupId);
  }

  private async present(
    rows: Awaited<ReturnType<PrismaService['chatGroup']['findMany']>>,
  ): Promise<AdminGroupDto[]> {
    const ids = rows.map((r) => r.id);
    const [people, messages, polls] = await Promise.all([
      this.presenter.people(rows.map((r) => r.created_by)),
      this.prisma.chatGroupMessage.groupBy({
        by: ['group_id'],
        where: { group_id: { in: ids }, type: { not: 'system' } },
        _count: { _all: true },
      }),
      this.prisma.chatGroupPoll.groupBy({
        by: ['group_id'],
        where: { group_id: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const msgOf = new Map(messages.map((m) => [m.group_id, m._count._all]));
    const pollOf = new Map(polls.map((p) => [p.group_id, p._count._all]));
    return rows.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      memberCount: g.member_count,
      ownerName: people.get(g.created_by)?.displayName ?? null,
      createdBy: g.created_by,
      messageCount: msgOf.get(g.id) ?? 0,
      pollCount: pollOf.get(g.id) ?? 0,
      createdAt: g.created_at,
      lastMessageAt: g.last_message_at,
      deletedAt: g.deleted_at,
    }));
  }
}
