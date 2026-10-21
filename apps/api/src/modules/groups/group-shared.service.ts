import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { GroupPresenter } from './group-presenter.service';
import type { GroupSharedKind } from './group-shared.dto';
import type { GroupMessagePage } from './groups.dto';
import { GroupsService } from './groups.service';

const PAGE = 30;

/**
 * Owner 2026-10-21 (Telegram «shared media»): a group's photos and videos,
 * files, links and voice notes, newest first, one cursor per tab. Members
 * only (a former member does not read the history).
 */
@Injectable()
export class GroupSharedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly presenter: GroupPresenter,
  ) {}

  private kindWhere(kind: GroupSharedKind): Prisma.ChatGroupMessageWhereInput {
    const file = (f: Prisma.FileWhereInput) => ({
      type: 'attachment' as const,
      file: f,
    });
    switch (kind) {
      case 'media':
        return {
          OR: [
            file({ mime: { startsWith: 'image/' } }),
            file({ mime: { startsWith: 'video/' } }),
          ],
        };
      case 'voice':
        return file({ mime: { startsWith: 'audio/' } });
      case 'files':
        return file({
          NOT: [
            { mime: { startsWith: 'image/' } },
            { mime: { startsWith: 'video/' } },
            { mime: { startsWith: 'audio/' } },
          ],
        });
      case 'links':
        return {
          type: 'text',
          OR: [
            { body: { contains: 'http://', mode: 'insensitive' } },
            { body: { contains: 'https://', mode: 'insensitive' } },
            { body: { contains: 'www.', mode: 'insensitive' } },
          ],
        };
    }
  }

  async list(
    user: RequestUser,
    groupId: string,
    kind: GroupSharedKind,
    cursor?: string,
    limit = PAGE,
  ): Promise<GroupMessagePage> {
    await this.groups.requireMember(user.sub, groupId);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.chatGroupMessage.findMany({
      where: {
        group_id: groupId,
        deleted_at: null,
        AND: [
          this.kindWhere(kind),
          ...(c
            ? [
                {
                  OR: [
                    { created_at: { lt: c.createdAt } },
                    { created_at: c.createdAt, id: { lt: c.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presenter.messages(page, user.sub),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }
}
