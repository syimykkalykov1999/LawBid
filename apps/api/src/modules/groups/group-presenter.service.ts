import {
  REACTION_PALETTE,
  reactionMode,
} from '../../common/reactions/reaction-palette';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatGroup,
  ChatGroupTopic,
  ChatGroupMember,
  ChatGroupMessage,
  ChatGroupPoll,
  ChatGroupPollOption,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UNREAD_CAP } from '../notifications/badges.service';
import { unreadMessagesSql } from './group-unread.sql';
import { isImageMime } from '../files/files.policy';
import { FilesService } from '../files/files.service';
import type { ChatAttachmentDto } from '../chat/chat.dto';
import { GROUP_ADMIN_RIGHTS } from './groups.dto';
import type {
  GroupDto,
  GroupMemberDto,
  GroupMessageDto,
  GroupPersonDto,
  GroupReplyPreviewDto,
  GroupAdminRight,
  GroupRoleName,
  GroupTopicDto,
  PollDto,
} from './groups.dto';

/** Viewer id for viewer-neutral payloads (nobody's picks, nobody's mentions). */
export const NOBODY = '00000000-0000-0000-0000-000000000000';
const REPLY_SNIPPET = 100;
const RECENT_VOTERS = 3;

function fullName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

/** The checkboxes a member holds: all for the owner, the ticked ones for an admin. */
export function rightsOf(
  m: { role: GroupRoleName; admin_rights: string[] } | null | undefined,
): GroupAdminRight[] {
  if (!m) return [];
  if (m.role === 'owner') return [...GROUP_ADMIN_RIGHTS];
  if (m.role !== 'admin') return [];
  return GROUP_ADMIN_RIGHTS.filter((r) => m.admin_rights.includes(r));
}

export function isAdminRole(role: GroupRoleName | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

type PollRow = ChatGroupPoll & { options: ChatGroupPollOption[] };

/**
 * Rows → DTOs for group chats, a fixed number of queries per page
 * (people, replies, polls, attachments are each loaded in one go).
 */
@Injectable()
export class GroupPresenter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly config: ConfigService,
  ) {}

  /** The shareable link: a public group's @username, else the invite code. */
  inviteLink(code: string): string {
    const base = (
      this.config.get<string>('WEB_APP_URL') ?? 'https://lawbid.dev'
    ).replace(/\/+$/, '');
    return `${base}/g/${code}`;
  }

  /** Public identity of [ids] (name, @username, photo, kind, badge). */
  async people(ids: string[]): Promise<Map<string, GroupPersonDto>> {
    const uniq = [...new Set(ids)];
    const out = new Map<string, GroupPersonDto>();
    if (uniq.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: {
          select: { username: true, trust_badge: true },
        },
        client_profile: { select: { username: true } },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    for (const u of users) {
      out.set(u.id, {
        userId: u.id,
        displayName: fullName(u.first_name, u.last_name),
        username:
          u.attorney_profile?.username ?? u.client_profile?.username ?? null,
        avatarUrl: u.avatar_file_id
          ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
          : null,
        kind: u.role === 'attorney' ? 'attorney' : 'client',
        verifiedBadge: u.attorney_profile?.trust_badge ?? false,
      });
    }
    return out;
  }

  async members(rows: ChatGroupMember[]): Promise<GroupMemberDto[]> {
    const people = await this.people(rows.map((r) => r.user_id));
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return rows
      .flatMap((r) => {
        const p = people.get(r.user_id);
        return p
          ? [{ ...p, role: r.role, rights: rightsOf(r), joinedAt: r.joined_at }]
          : [];
      })
      .sort(
        (a, b) =>
          order[a.role] - order[b.role] ||
          (a.displayName ?? '').localeCompare(b.displayName ?? ''),
      );
  }

  /** Polls of [messageIds] for [viewerId]. */
  async polls(
    messageIds: string[],
    viewerId: string,
  ): Promise<Map<string, PollDto>> {
    const out = new Map<string, PollDto>();
    if (messageIds.length === 0) return out;
    const rows: PollRow[] = await this.prisma.chatGroupPoll.findMany({
      where: { message_id: { in: messageIds } },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    const dtos = await this.pollsFromRows(rows, viewerId);
    for (const r of rows) {
      const dto = dtos.get(r.id);
      if (dto) out.set(r.message_id, dto);
    }
    return out;
  }

  async pollsFromRows(
    rows: PollRow[],
    viewerId: string,
  ): Promise<Map<string, PollDto>> {
    const out = new Map<string, PollDto>();
    if (rows.length === 0) return out;
    const pollIds = rows.map((r) => r.id);
    const [counts, voters, mine] = await Promise.all([
      this.prisma.chatGroupPollVote.groupBy({
        by: ['option_id'],
        where: { poll_id: { in: pollIds } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ poll_id: string; n: bigint }[]>`
        SELECT poll_id::TEXT AS poll_id, count(DISTINCT user_id) AS n
        FROM chat_group_poll_votes
        WHERE poll_id = ANY(${pollIds}::UUID[])
        GROUP BY poll_id`,
      this.prisma.chatGroupPollVote.findMany({
        where: { poll_id: { in: pollIds }, user_id: viewerId },
        select: { option_id: true },
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.option_id, c._count._all]));
    const votersOf = new Map(voters.map((v) => [v.poll_id, Number(v.n)]));
    const myOptions = new Set(mine.map((m) => m.option_id));

    // Open polls show a few recent voters under each option.
    const openIds = rows.filter((r) => !r.anonymous).map((r) => r.id);
    const recent =
      openIds.length > 0
        ? await this.prisma.chatGroupPollVote.findMany({
            where: { poll_id: { in: openIds } },
            orderBy: { created_at: 'desc' },
            take: 300,
            select: { option_id: true, user_id: true },
          })
        : [];
    const perOption = new Map<string, string[]>();
    for (const v of recent) {
      const list = perOption.get(v.option_id) ?? [];
      if (list.length < RECENT_VOTERS) list.push(v.user_id);
      perOption.set(v.option_id, list);
    }
    const people = await this.people([...perOption.values()].flat());

    for (const r of rows) {
      const total = votersOf.get(r.id) ?? 0;
      out.set(r.id, {
        id: r.id,
        question: r.question,
        multiple: r.multiple,
        anonymous: r.anonymous,
        closed: r.closed_at !== null,
        closedAt: r.closed_at,
        creatorId: r.creator_id,
        totalVoters: total,
        options: r.options.map((o) => {
          const votes = countOf.get(o.id) ?? 0;
          return {
            id: o.id,
            text: o.text,
            votes,
            percent: total > 0 ? Math.round((votes / total) * 100) : 0,
            voted: myOptions.has(o.id),
            recentVoters: r.anonymous
              ? []
              : (perOption.get(o.id) ?? []).flatMap((uid) => {
                  const p = people.get(uid);
                  return p ? [p] : [];
                }),
          };
        }),
        myOptionIds: r.options
          .filter((o) => myOptions.has(o.id))
          .map((o) => o.id),
      });
    }
    return out;
  }

  /** Messages → DTOs for one viewer. */
  async messages(
    rows: ChatGroupMessage[],
    viewerId: string,
  ): Promise<GroupMessageDto[]> {
    if (rows.length === 0) return [];
    const replyIds = rows.flatMap((m) =>
      m.reply_to_id ? [m.reply_to_id] : [],
    );
    const replies = replyIds.length
      ? await this.prisma.chatGroupMessage.findMany({
          where: { id: { in: replyIds }, deleted_at: {} },
          select: {
            id: true,
            sender_id: true,
            type: true,
            body: true,
            deleted_at: true,
            file_name: true,
            poll: { select: { question: true } },
          },
        })
      : [];
    const sys = (m: ChatGroupMessage) =>
      (m.system_payload ?? {}) as {
        actorId?: string;
        targetIds?: string[];
        text?: string;
      };
    const people = await this.people([
      ...rows.flatMap((m) => (m.sender_id ? [m.sender_id] : [])),
      ...rows.flatMap((m) => m.mention_ids),
      ...replies.flatMap((r) => (r.sender_id ? [r.sender_id] : [])),
      ...rows.flatMap((m) =>
        m.type === 'system'
          ? [
              ...(sys(m).actorId ? [sys(m).actorId!] : []),
              ...(sys(m).targetIds ?? []),
            ]
          : [],
      ),
    ]);
    const fileIds = rows.flatMap((m) =>
      m.type === 'attachment' && m.file_id && !m.deleted_at ? [m.file_id] : [],
    );
    const liveIds = rows.flatMap((m) =>
      m.type !== 'system' && !m.deleted_at ? [m.id] : [],
    );
    const [urls, polls, counts, mine] = await Promise.all([
      this.files.attachmentUrls(fileIds),
      this.polls(
        rows.flatMap((m) => (m.type === 'poll' && !m.deleted_at ? [m.id] : [])),
        viewerId,
      ),
      liveIds.length
        ? this.prisma.groupReaction.groupBy({
            by: ['message_id', 'emoji'],
            where: { message_id: { in: liveIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      liveIds.length
        ? this.prisma.groupReaction.findMany({
            where: { message_id: { in: liveIds }, user_id: viewerId },
            select: { message_id: true, emoji: true },
          })
        : Promise.resolve([]),
    ]);
    const myReactionOf = new Map(mine.map((r) => [r.message_id, r.emoji]));
    const paletteOrder = new Map<string, number>(
      REACTION_PALETTE.map((e, i) => [e as string, i]),
    );
    const replyOf = new Map(replies.map((r) => [r.id, r]));

    return rows.map((m) => {
      const deleted = m.deleted_at !== null;
      const payload = sys(m);
      const reply = m.reply_to_id ? replyOf.get(m.reply_to_id) : undefined;
      const replyTo: GroupReplyPreviewDto | null = reply
        ? {
            id: reply.id,
            senderName: reply.sender_id
              ? (people.get(reply.sender_id)?.displayName ?? null)
              : null,
            type: reply.type,
            deleted: reply.deleted_at !== null,
            snippet: reply.deleted_at
              ? ''
              : [
                  ...(reply.type === 'poll'
                    ? (reply.poll?.question ?? '')
                    : reply.body || reply.file_name || ''),
                ]
                  .slice(0, REPLY_SNIPPET)
                  .join(''),
          }
        : null;
      let attachment: ChatAttachmentDto | null = null;
      if (m.type === 'attachment' && m.file_id && !deleted) {
        const f = urls.get(m.file_id);
        attachment = {
          fileId: m.file_id,
          name: m.file_name ?? 'file',
          mime: f?.mime ?? null,
          sizeBytes: f?.sizeBytes ?? null,
          isImage: f ? isImageMime(f.mime) : false,
          url: f?.url ?? null,
          previewUrl: f?.previewUrl ?? null,
          width: f?.width ?? null,
          height: f?.height ?? null,
        };
      }
      const pick = (ids: string[]) =>
        ids.flatMap((id) => {
          const p = people.get(id);
          return p ? [p] : [];
        });
      return {
        id: m.id,
        groupId: m.group_id,
        topicId: m.topic_id,
        type: m.type,
        sender: m.sender_id ? (people.get(m.sender_id) ?? null) : null,
        body: deleted || m.type === 'poll' ? '' : m.body,
        mine: m.sender_id === viewerId,
        clientMessageId: m.client_message_id,
        systemKind: m.type === 'system' ? m.system_kind : null,
        systemPeople:
          m.type === 'system'
            ? pick([
                ...(payload.actorId ? [payload.actorId] : []),
                ...(payload.targetIds ?? []),
              ])
            : [],
        systemText: m.type === 'system' ? (payload.text ?? null) : null,
        replyTo: deleted ? null : replyTo,
        mentions: deleted ? [] : pick(m.mention_ids),
        mentionsMe: !deleted && m.mention_ids.includes(viewerId),
        attachment,
        poll: polls.get(m.id) ?? null,
        editedAt: m.edited_at,
        deleted,
        createdAt: m.created_at,
        expiresAt: m.expires_at,
        forwarded: m.forwarded && !deleted,
        forwardedFrom: m.forwarded && !deleted ? m.forwarded_from_name : null,
        reactions: counts
          .filter((c) => c.message_id === m.id)
          .map((c) => ({ emoji: c.emoji, count: c._count._all }))
          .sort(
            (a, b) =>
              b.count - a.count ||
              (paletteOrder.get(a.emoji) ?? 99) -
                (paletteOrder.get(b.emoji) ?? 99),
          ),
        myReaction: myReactionOf.get(m.id) ?? null,
      };
    });
  }

  /** Groups → DTOs for one viewer (membership rows already loaded). */
  async groups(
    rows: { group: ChatGroup; me: ChatGroupMember | null }[],
    viewerId: string,
  ): Promise<GroupDto[]> {
    if (rows.length === 0) return [];
    const groups = rows.map((r) => r.group);
    const messageIds = groups.flatMap((g) =>
      [g.last_message_id, g.pinned_message_id].flatMap((x) => (x ? [x] : [])),
    );
    const adminGroupIds = rows.flatMap((r) =>
      r.me && r.me.left_at === null && isAdminRole(r.me.role)
        ? [r.group.id]
        : [],
    );
    const [msgRows, avatars, unread, pending] = await Promise.all([
      this.prisma.chatGroupMessage.findMany({
        where: { id: { in: messageIds }, deleted_at: {} },
      }),
      this.files.avatarUrlsMany(groups.map((g) => g.avatar_file_id)),
      this.unread(
        rows.flatMap((r) => (r.me ? [r.group.id] : [])),
        viewerId,
      ),
      adminGroupIds.length
        ? this.prisma.chatGroupJoinRequest.groupBy({
            by: ['group_id'],
            where: { group_id: { in: adminGroupIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const pendingOf = new Map(pending.map((p) => [p.group_id, p._count._all]));
    const msgs = await this.messages(msgRows, viewerId);
    const msgOf = new Map(msgs.map((m) => [m.id, m]));

    return rows.map(({ group: g, me }) => {
      const role = me && me.left_at === null ? me.role : null;
      const admin = isAdminRole(role);
      const myRights = role !== null ? rightsOf(me) : [];
      const member = role !== null;
      const stats = unread.get(g.id);
      return {
        id: g.id,
        title: g.title,
        description: g.description,
        avatarUrl: g.avatar_file_id
          ? (avatars.get(g.avatar_file_id)?.url256 ?? null)
          : null,
        avatarFullUrl: g.avatar_file_id
          ? (avatars.get(g.avatar_file_id)?.url ?? null)
          : null,
        memberCount: g.member_count,
        type: g.group_type,
        username: g.username,
        joinApproval: g.join_approval,
        topicsEnabled: g.topics_enabled,
        generalTopicId: g.general_topic_id,
        pendingRequests: pendingOf.get(g.id) ?? 0,
        myRole: role,
        whoCanPost: g.who_can_post,
        whoCanAdd: g.who_can_add,
        whoCanEditInfo: g.who_can_edit_info,
        whoCanCall: g.who_can_call,
        showServiceMessages: g.show_service_messages,
        disappearAfterS: g.disappear_after_s,
        protectContent: g.protect_content,
        reactionsMode: reactionMode(g.reactions_mode),
        reactionsAllowed: g.reactions_allowed,
        whoCanMedia: g.who_can_media,
        whoCanPoll: g.who_can_poll,
        whoCanPin: g.who_can_pin,
        myRights,
        canPost: member && (g.who_can_post === 'all' || admin),
        canAdd:
          member && (g.who_can_add === 'all' || myRights.includes('invite')),
        canEditInfo:
          member &&
          (g.who_can_edit_info === 'all' || myRights.includes('info')),
        canCall:
          member && (g.who_can_call === 'all' || myRights.includes('calls')),
        isAdmin: admin,
        inviteEnabled: g.invite_enabled,
        inviteLink:
          member &&
          g.group_type !== 'private' &&
          (g.invite_enabled || g.group_type === 'public') &&
          (admin || g.who_can_add === 'all')
            ? this.inviteLink(
                g.group_type === 'public' && g.username
                  ? g.username
                  : g.invite_code,
              )
            : null,
        pinnedMessage: g.pinned_message_id
          ? (msgOf.get(g.pinned_message_id) ?? null)
          : null,
        lastMessage: g.last_message_id
          ? hiddenService(g, msgOf.get(g.last_message_id))
          : null,
        lastMessageAt: g.last_message_at,
        unreadCount: stats?.n ?? 0,
        unreadMentions: stats?.mentions ?? 0,
        mutedUntil: me?.muted_until ?? null,
        callsMuted: me?.calls_muted ?? false,
        pinned: me?.pinned_at != null,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      };
    });
  }

  /** Unread messages (and @mentions of me) per group, capped. */
  private async unread(
    groupIds: string[],
    viewerId: string,
  ): Promise<Map<string, { n: number; mentions: number }>> {
    const out = new Map<string, { n: number; mentions: number }>();
    if (groupIds.length === 0) return out;
    const unread = unreadMessagesSql(viewerId);
    const rows = await this.prisma.$queryRaw<
      { id: string; n: bigint; mentions: bigint }[]
    >`
      SELECT g.id::TEXT AS id,
             (SELECT count(*) FROM (
                SELECT 1 FROM ${unread}
                ORDER BY m.created_at DESC
                LIMIT ${UNREAD_CAP}) x) AS n,
             (SELECT count(*) FROM (
                SELECT 1 FROM ${unread}
                  AND ${viewerId}::UUID = ANY(m.mention_ids)
                ORDER BY m.created_at DESC
                LIMIT ${UNREAD_CAP}) y) AS mentions
      FROM chat_group_members gm
      JOIN chat_groups g ON g.id = gm.group_id
      WHERE gm.user_id = ${viewerId}::UUID
        AND gm.left_at IS NULL
        AND g.id = ANY(${groupIds}::UUID[])`;
    for (const r of rows) {
      out.set(r.id, { n: Number(r.n), mentions: Number(r.mentions) });
    }
    return out;
  }

  /** Topics of one forum group for [viewerId] (pinned, then recent). */
  async topics(
    topics: ChatGroupTopic[],
    viewerId: string,
  ): Promise<GroupTopicDto[]> {
    if (topics.length === 0) return [];
    const lastIds = topics.flatMap((t) =>
      t.last_message_id ? [t.last_message_id] : [],
    );
    const lastRows = lastIds.length
      ? await this.prisma.chatGroupMessage.findMany({
          where: { id: { in: lastIds }, deleted_at: {} },
        })
      : [];
    const lasts = await this.messages(lastRows, viewerId);
    const lastOf = new Map(lasts.map((m) => [m.id, m]));
    const counts = await this.prisma.$queryRaw<
      { id: string; n: bigint; mentions: bigint }[]
    >`
      SELECT t.id::TEXT AS id,
             (SELECT count(*) FROM (
                SELECT 1 FROM chat_group_messages m
                LEFT JOIN chat_group_topic_reads tr
                  ON tr.topic_id = t.id AND tr.user_id = ${viewerId}::UUID
                LEFT JOIN chat_group_members gm
                  ON gm.group_id = t.group_id AND gm.user_id = ${viewerId}::UUID
                LEFT JOIN chat_group_messages lr
                  ON lr.id = COALESCE(tr.last_read_message_id, gm.last_read_message_id)
                WHERE m.group_id = t.group_id
                  AND (m.topic_id = t.id OR (t.is_general AND m.topic_id IS NULL))
                  AND m.deleted_at IS NULL AND m.type <> 'system'
                  AND (m.sender_id IS NULL OR m.sender_id <> ${viewerId}::UUID)
                  AND m.created_at >= gm.joined_at
                  AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))
                ORDER BY m.created_at DESC
                LIMIT ${UNREAD_CAP}) x) AS n,
             (SELECT count(*) FROM (
                SELECT 1 FROM chat_group_messages m
                LEFT JOIN chat_group_topic_reads tr
                  ON tr.topic_id = t.id AND tr.user_id = ${viewerId}::UUID
                LEFT JOIN chat_group_members gm
                  ON gm.group_id = t.group_id AND gm.user_id = ${viewerId}::UUID
                LEFT JOIN chat_group_messages lr
                  ON lr.id = COALESCE(tr.last_read_message_id, gm.last_read_message_id)
                WHERE m.group_id = t.group_id
                  AND (m.topic_id = t.id OR (t.is_general AND m.topic_id IS NULL))
                  AND m.deleted_at IS NULL
                  AND ${viewerId}::UUID = ANY(m.mention_ids)
                  AND m.created_at >= gm.joined_at
                  AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))
                ORDER BY m.created_at DESC
                LIMIT ${UNREAD_CAP}) y) AS mentions
      FROM chat_group_topics t
      WHERE t.id = ANY(${topics.map((t) => t.id)}::UUID[])`;
    const countOf = new Map(counts.map((c) => [c.id, c]));
    return topics
      .map((t) => ({
        id: t.id,
        title: t.title,
        iconEmoji: t.icon_emoji,
        color: t.color,
        isGeneral: t.is_general,
        closed: t.closed_at !== null,
        pinned: t.pinned_at !== null,
        lastMessage: t.last_message_id
          ? (lastOf.get(t.last_message_id) ?? null)
          : null,
        lastMessageAt: t.last_message_at,
        unreadCount: Number(countOf.get(t.id)?.n ?? 0),
        unreadMentions: Number(countOf.get(t.id)?.mentions ?? 0),
        createdAt: t.created_at,
      }))
      .sort(
        (a, b) =>
          Number(b.isGeneral) - Number(a.isGeneral) ||
          Number(b.pinned) - Number(a.pinned) ||
          (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
      );
  }
}

/** The preview line, minus a service line the group has switched off. */
function hiddenService<T extends { systemKind?: string | null }>(
  g: { show_service_messages: boolean },
  m: T | undefined,
): T | null {
  if (!m) return null;
  return !g.show_service_messages && m.systemKind ? null : m;
}
