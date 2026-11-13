import { Injectable } from '@nestjs/common';
import type { Call, Prisma } from '../../generated/prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { timeBucket, weakEtag } from '../../common/sync/cheap-etag';
import { parseUpdatedSince, syncedAt } from '../../common/sync/sync.util';
import { viewerContext } from '../../common/viewer/viewer-context';
import { PrismaService } from '../../prisma/prisma.service';
import { hashShard } from '../../sharding/shard-id';
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
/** B-c7: rows one catch-up carries at most (as the groups' 500). */
const CHANGED_MAX = 500;
const NEWEST_FIRST: Prisma.CallOrderByWithRelationInput[] = [
  { created_at: 'desc' },
  { id: 'desc' },
];
/** The first-page tag rotates at least this often (names, photos, signed
 * links of the people in the rows are not in the tag). */
export const HISTORY_TAG_BUCKET_MS = 5 * 60_000;
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

  /**
   * Owner 2026-11-04 (R-385): the cheap ETag of the first page — the newest
   * visible finished call and my hidden-calls marks (two indexed reads),
   * so an unchanged list is a 304 without the page, people and groups
   * queries. A new call, a status change of the newest one, «delete» and
   * «clear» all move it.
   */
  async firstPageTag(
    user: RequestUser,
    limit = DEFAULT_LIMIT,
  ): Promise<string> {
    const me = user.sub;
    const [[newest], hidden] = await Promise.all([
      this.newestMine(me, {}, 1, (where) =>
        this.prisma.call.findMany({
          where,
          orderBy: NEWEST_FIRST,
          take: 1,
          select: { id: true, status: true, ended_at: true, created_at: true },
        }),
      ),
      this.prisma.callLogHidden.aggregate({
        where: { user_id: me },
        _count: { _all: true },
        _max: { created_at: true },
      }),
    ]);
    return weakEtag(
      'calls',
      me,
      limit,
      newest?.id,
      newest?.status,
      newest?.ended_at,
      hidden._count._all,
      hidden._max.created_at,
      timeBucket(HISTORY_TAG_BUCKET_MS),
    );
  }

  async history(
    user: RequestUser,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<CallHistoryPage> {
    const me = user.sub;
    const c = cursor ? decodeCursor(cursor) : undefined;
    const after: Prisma.CallWhereInput = c
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
      : {};
    const rows = await this.newestMine(me, after, limit + 1, (where) =>
      this.prisma.call.findMany({
        where,
        orderBy: NEWEST_FIRST,
        take: limit + 1,
      }),
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;
    if (page.length === 0) return { items: [], nextCursor: null };
    return { items: await this.present(me, page), nextCursor };
  }

  /**
   * B-c7 (2026-11-09, Telegram getDifference, as GET /groups?updatedSince):
   * the finished calls of mine that appeared or changed since [sinceRaw]
   * (a call ends → its row's updated_at moves), plus `deletedIds` — the
   * calls I took off my list since («delete», «clear» write a hidden row
   * with its time). syncedAt = the newest stamp of the answer; the app
   * passes it back next time and never reloads the whole list.
   */
  async changed(user: RequestUser, sinceRaw: string): Promise<CallHistoryPage> {
    const me = user.sub;
    const since = parseUpdatedSince(sinceRaw) as Date;
    const [rows, hidden] = await Promise.all([
      this.newestMine(
        me,
        { updated_at: { gte: since } },
        CHANGED_MAX,
        (where) =>
          this.prisma.call.findMany({
            where,
            orderBy: NEWEST_FIRST,
            take: CHANGED_MAX,
          }),
      ),
      this.prisma.callLogHidden.findMany({
        where: { user_id: me, created_at: { gte: since } },
        select: { call_id: true, created_at: true },
        take: CHANGED_MAX,
      }),
    ]);
    const items = rows.length === 0 ? [] : await this.present(me, rows);
    return {
      items,
      nextCursor: null,
      deletedIds: hidden.map((h) => h.call_id),
      syncedAt: syncedAt(
        [...rows.map((r) => r.updated_at), ...hidden.map((h) => h.created_at)],
        since,
      ),
    };
  }

  /** The rows as the viewer sees them (names, photos, groups in one pass). */
  private async present(
    me: string,
    page: Call[],
  ): Promise<CallHistoryItemDto[]> {
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

      return page.map((r): CallHistoryItemDto => {
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
    });
  }

  /**
   * The newest [take] finished calls on my list (not hidden by me), newest
   * first. Perf guard 2026-11-08 (test/perf-user.e2e-spec.ts): one query
   * with `caller = me OR callee = me OR a group call I joined` can use no
   * index, so at 10M calls PostgreSQL walked every finished call
   * (calls_status_created_at_idx) and filtered. Split into the three
   * branches, each a keyset range of its own index (caller / callee:
   * (x_id, created_at DESC, id DESC); group: call_participants by user),
   * then merged — the standard OR-to-UNION rewrite.
   */
  private async newestMine<T extends { id: string; created_at: Date }>(
    me: string,
    extra: Prisma.CallWhereInput,
    take: number,
    find: (where: Prisma.CallWhereInput) => Promise<T[]>,
  ): Promise<T[]> {
    const base: Prisma.CallWhereInput = {
      status: { in: [...FINISHED] },
      log_hidden: { none: { user_id: me } },
      ...extra,
    };
    const branches = await Promise.all([
      find({ ...base, caller_id: me }),
      find({ ...base, callee_id: me }),
      find({
        ...base,
        is_group: true,
        participants: { some: { user_id: me } },
      }),
    ]);
    const byId = new Map<string, T>();
    for (const r of branches.flat()) byId.set(r.id, r);
    return [...byId.values()]
      .sort(
        (a, b) =>
          b.created_at.getTime() - a.created_at.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      )
      .slice(0, take);
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
      INSERT INTO call_log_hidden (user_id, call_id, shard_id)
      SELECT ${me}::uuid, c.id, ${hashShard(me)}::smallint FROM calls c
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
