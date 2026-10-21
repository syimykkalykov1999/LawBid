import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { viewerContext } from '../../common/viewer/viewer-context';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import type {
  CallHistoryItemDto,
  CallHistoryPage,
  HiddenCallsDto,
  OngoingGroupCallDto,
} from './call-history.dto';
import { CALL_SILENT_MS } from './calls.service';

const DEFAULT_LIMIT = 30;
const FINISHED = [
  'ended',
  'missed',
  'declined',
  'busy',
  'canceled',
  'failed',
] as const;

/**
 * Owner 2026-10-21: the «Calls» tab. The calls the person took
 * part in (finished, newest first, keyset cursor) and the group calls running
 * now in their groups; a person deletes calls from their own list (WhatsApp:
 * nobody else's changes). Kept apart from CallsService: nothing here changes
 * a call.
 */
@Injectable()
export class CallHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async history(
    user: RequestUser,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<CallHistoryPage> {
    const me = user.sub;
    const c = cursor ? decodeCursor(cursor) : undefined;
    const where: Prisma.CallWhereInput = {
      ...this.mine(me),
      log_hidden: { none: { user_id: me } },
      ...(c
        ? {
            AND: [
              {
                OR: [
                  { created_at: { lt: c.createdAt } },
                  { created_at: c.createdAt, id: { lt: c.id } },
                ],
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.call.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;
    if (page.length === 0) return { items: [], nextCursor: null };

    return viewerContext.run(me, async () => {
      const peerIds = [
        ...new Set(
          page.map((r) => (r.caller_id === me ? r.callee_id : r.caller_id)),
        ),
      ];
      const [users, groups] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: peerIds } },
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: { select: { username: true } },
            client_profile: { select: { username: true } },
          },
        }),
        this.prisma.chatGroup.findMany({
          where: {
            id: {
              in: [
                ...new Set(
                  page.map((r) => r.group_id).filter((x): x is string => !!x),
                ),
              ],
            },
          },
          select: { id: true, title: true, avatar_file_id: true },
        }),
      ]);
      const avatars = await this.files.avatarUrlsMany([
        ...users.map((u) => u.avatar_file_id),
        ...groups.map((g) => g.avatar_file_id),
      ]);
      const urlOf = (id: string | null | undefined): string | null =>
        id ? (avatars.get(id)?.url ?? avatars.get(id)?.url256 ?? null) : null;
      const userById = new Map(users.map((u) => [u.id, u]));
      const groupById = new Map(groups.map((g) => [g.id, g]));

      const items = page.map((r): CallHistoryItemDto => {
        const peerId = r.caller_id === me ? r.callee_id : r.caller_id;
        const u = userById.get(peerId);
        const g = r.group_id ? groupById.get(r.group_id) : undefined;
        return {
          id: r.id,
          status: r.status as CallHistoryItemDto['status'],
          outgoing: r.caller_id === me,
          video: r.video,
          peer: {
            id: peerId,
            displayName:
              [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
              null,
            username:
              u?.attorney_profile?.username ??
              u?.client_profile?.username ??
              null,
            avatarUrl: urlOf(u?.avatar_file_id),
            kind: u?.role === 'attorney' ? 'attorney' : 'client',
          },
          conversationId: r.conversation_id,
          groupId: r.group_id,
          groupTitle: g?.title ?? null,
          groupAvatarUrl: urlOf(g?.avatar_file_id),
          group: r.is_group || r.group_id !== null,
          createdAt: r.created_at,
          durationSec: r.duration_sec,
        };
      });
      return { items, nextCursor };
    });
  }

  /** My finished calls (the ones my list may show). */
  private mine(me: string): Prisma.CallWhereInput {
    return {
      status: { in: [...FINISHED] },
      OR: [
        { caller_id: me },
        { callee_id: me },
        { is_group: true, participants: { some: { user_id: me } } },
      ],
    };
  }

  /** Takes the given calls off my list (others' lists stay). */
  async hide(user: RequestUser, ids: string[]): Promise<HiddenCallsDto> {
    const me = user.sub;
    const calls = await this.prisma.call.findMany({
      where: { id: { in: [...new Set(ids)] }, ...this.mine(me) },
      select: { id: true },
    });
    const { count } = await this.prisma.callLogHidden.createMany({
      data: calls.map((x) => ({ user_id: me, call_id: x.id })),
      skipDuplicates: true,
    });
    return { count };
  }

  /** «Clear»: every finished call off my list in one statement. */
  async clear(user: RequestUser): Promise<HiddenCallsDto> {
    const me = user.sub;
    const count = await this.prisma.$executeRaw`
      INSERT INTO call_log_hidden (user_id, call_id)
      SELECT ${me}::uuid, c.id FROM calls c
      WHERE c.status::text IN ('ended', 'missed', 'declined', 'busy', 'canceled', 'failed')
        AND (
          c.caller_id = ${me}::uuid
          OR c.callee_id = ${me}::uuid
          OR (c.is_group AND EXISTS (
            SELECT 1 FROM call_participants p
            WHERE p.call_id = c.id AND p.user_id = ${me}::uuid
          ))
        )
      ON CONFLICT DO NOTHING`;
    return { count };
  }

  /** Group calls running now in the groups I belong to. */
  async ongoing(user: RequestUser): Promise<OngoingGroupCallDto[]> {
    const me = user.sub;
    const mine = await this.prisma.chatGroupMember.findMany({
      where: { user_id: me, left_at: null },
      select: { group_id: true },
    });
    if (mine.length === 0) return [];
    const calls = await this.prisma.call.findMany({
      where: {
        status: 'active',
        group_id: { in: mine.map((m) => m.group_id) },
        updated_at: { gt: new Date(Date.now() - CALL_SILENT_MS) },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      include: {
        participants: { select: { user_id: true, status: true } },
      },
    });
    if (calls.length === 0) return [];
    const groups = await this.prisma.chatGroup.findMany({
      where: { id: { in: calls.map((c) => c.group_id as string) } },
      select: { id: true, title: true, avatar_file_id: true },
    });
    const avatars = await viewerContext.run(me, () =>
      this.files.avatarUrlsMany(groups.map((g) => g.avatar_file_id)),
    );
    const byId = new Map(groups.map((g) => [g.id, g]));
    return calls.flatMap((c): OngoingGroupCallDto[] => {
      const g = c.group_id ? byId.get(c.group_id) : undefined;
      if (!g) return [];
      const joined = c.participants.filter((p) => p.status === 'joined');
      return [
        {
          id: c.id,
          groupId: g.id,
          groupTitle: g.title,
          groupAvatarUrl: g.avatar_file_id
            ? (avatars.get(g.avatar_file_id)?.url ??
              avatars.get(g.avatar_file_id)?.url256 ??
              null)
            : null,
          video: c.video,
          joined: joined.length,
          mine: joined.some((p) => p.user_id === me),
          startedAt: c.created_at,
        },
      ];
    });
  }
}
