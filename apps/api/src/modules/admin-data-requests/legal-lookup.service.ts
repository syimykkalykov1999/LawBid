import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import type {
  LegalAccountCardDto,
  LegalLookupHitDto,
} from './legal-export.dto';

const MAX_HITS = 20;
const LIST_CAP = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_SELECT = {
  id: true,
  role: true,
  status: true,
  first_name: true,
  last_name: true,
  email: true,
  phone_e164: true,
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/**
 * Owner 2026-10-20: one search box for a government request — phone,
 * e-mail, @username, name or id — and one account card (Meta's records
 * tool / Discord T&S user lookup shape). Everything is an indexed
 * lookup; the card lists objects and counts, the content itself only
 * leaves in an evidence archive.
 */
@Injectable()
export class LegalLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string): Promise<LegalLookupHitDto[]> {
    const q = rawQuery.trim();
    const hits = new Map<string, { row: UserRow; by: string }>();
    const add = (rows: UserRow[], by: string) => {
      for (const row of rows) {
        if (hits.size < MAX_HITS && !hits.has(row.id))
          hits.set(row.id, { row, by });
      }
    };
    const find = (where: Prisma.UserWhereInput) =>
      this.prisma.user.findMany({
        where: withDeleted(where),
        select: USER_SELECT,
        take: MAX_HITS,
      });

    if (UUID_RE.test(q)) {
      add(await find({ id: q.toLowerCase() }), 'id');
    }
    const digits = q.replace(/[^\d]/g, '');
    if (digits.length >= 7 && /^[+\d\s()-]+$/.test(q)) {
      add(await find({ phone_e164: `+${digits}` }), 'phone');
    }
    if (q.includes('@') && !q.startsWith('@')) {
      add(
        await find({ email: { startsWith: q, mode: 'insensitive' } }),
        'email',
      );
    }
    const handle = q.replace(/^@/, '').toLowerCase();
    if (/^[a-z0-9_]{3,64}$/.test(handle)) {
      const names = await this.prisma.username.findMany({
        where: { username_lower: { startsWith: handle } },
        take: MAX_HITS,
      });
      const ids = new Set<string>();
      for (const n of names) {
        if (n.owner_type === 'user') ids.add(n.owner_id);
      }
      const chIds = names
        .filter((n) => n.owner_type === 'channel')
        .map((n) => n.owner_id);
      const gIds = names
        .filter((n) => n.owner_type === 'group')
        .map((n) => n.owner_id);
      if (chIds.length) {
        const ch = await this.prisma.channel.findMany({
          where: withDeleted({ id: { in: chIds } }),
          select: { owner_id: true },
        });
        for (const c of ch) ids.add(c.owner_id);
      }
      if (gIds.length) {
        const g = await this.prisma.chatGroup.findMany({
          where: withDeleted({ id: { in: gIds } }),
          select: { created_by: true },
        });
        for (const x of g) ids.add(x.created_by);
      }
      if (ids.size) add(await find({ id: { in: [...ids] } }), 'username');
    }
    if (q.length >= 3 && !q.startsWith('@') && !q.includes('@')) {
      const [first, ...rest] = q.split(/\s+/);
      add(
        await find(
          rest.length
            ? {
                first_name: { startsWith: first, mode: 'insensitive' },
                last_name: { startsWith: rest.join(' '), mode: 'insensitive' },
              }
            : {
                OR: [
                  { first_name: { startsWith: first, mode: 'insensitive' } },
                  { last_name: { startsWith: first, mode: 'insensitive' } },
                ],
              },
        ),
        'name',
      );
    }

    const ids = [...hits.keys()];
    const handles = ids.length
      ? await this.prisma.username.findMany({
          where: { owner_type: 'user', owner_id: { in: ids } },
        })
      : [];
    const handleOf = new Map(
      handles.map((h) => [h.owner_id, h.username_lower]),
    );
    return [...hits.values()].map(({ row, by }) => ({
      userId: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
      role: row.role,
      status: row.status,
      phone: row.phone_e164,
      email: row.email,
      username: handleOf.get(row.id) ?? null,
      matchedBy: by,
    }));
  }

  /** The account card: who, handles (with history), what exists. */
  async card(userId: string): Promise<LegalAccountCardDto> {
    const user = await this.prisma.user.findUnique({
      where: withDeleted({ id: userId }),
      select: {
        ...USER_SELECT,
        ui_language: true,
        timezone: true,
        created_at: true,
        deleted_at: true,
        deletion_requested_at: true,
        last_active_at: true,
        email_verified_at: true,
        phone_verified_at: true,
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const own = { OR: [{ client_id: userId }, { attorney_id: userId }] };
    const [
      handles,
      oldHandles,
      conversations,
      groups,
      channels,
      sessions,
      holds,
      cPosts,
      cReels,
      cStories,
      cQuestions,
      cChannelPosts,
      cMessages,
    ] = await Promise.all([
      this.prisma.username.findMany({ where: { owner_id: userId } }),
      this.prisma.usernameHold.findMany({
        where: { holder_user_id: userId },
        orderBy: { released_at: 'desc' },
        take: 50,
      }),
      this.prisma.conversation.findMany({
        where: own,
        select: {
          id: true,
          pair_kind: true,
          last_message_at: true,
          created_at: true,
          client: { select: { id: true, first_name: true, last_name: true } },
          attorney: { select: { id: true, first_name: true, last_name: true } },
        },
        orderBy: { last_message_at: { sort: 'desc', nulls: 'last' } },
        take: LIST_CAP,
      }),
      this.prisma.chatGroupMember.findMany({
        where: { user_id: userId },
        select: {
          role: true,
          joined_at: true,
          left_at: true,
          group: {
            select: {
              id: true,
              title: true,
              username: true,
              member_count: true,
              deleted_at: true,
            },
          },
        },
        orderBy: { joined_at: 'desc' },
        take: LIST_CAP,
      }),
      this.prisma.channel.findMany({
        where: withDeleted({
          OR: [{ owner_id: userId }, { admins: { some: { user_id: userId } } }],
        }),
        select: {
          id: true,
          title: true,
          username: true,
          owner_id: true,
          post_count: true,
          deleted_at: true,
        },
        take: LIST_CAP,
      }),
      this.prisma.session.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          device_id: true,
          device_name: true,
          platform: true,
          app_version: true,
          ip: true,
          user_agent: true,
          created_at: true,
          last_used_at: true,
          revoked_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      this.prisma.legalHold.findMany({
        where: { target_id: userId, released_at: null },
      }),
      this.prisma.post.count({
        where: withDeleted({ author_id: userId, video_asset_id: null }),
      }),
      this.prisma.post.count({
        where: withDeleted({
          author_id: userId,
          video_asset_id: { not: null },
        }),
      }),
      this.prisma.story.count({ where: withDeleted({ author_id: userId }) }),
      this.prisma.legalQuestion.count({
        where: withDeleted({ author_id: userId }),
      }),
      this.prisma.channelPost.count({
        where: withDeleted({ author_id: userId }),
      }),
      this.prisma.message.count({ where: withDeleted({ sender_id: userId }) }),
    ]);
    const name = (u: { first_name: string | null; last_name: string | null }) =>
      [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
    return {
      profile: {
        id: user.id,
        role: user.role,
        status: user.status,
        name: name(user),
        phone: user.phone_e164,
        phoneVerifiedAt: user.phone_verified_at,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
        language: user.ui_language,
        timezone: user.timezone,
        registeredAt: user.created_at,
        lastActiveAt: user.last_active_at,
        deletionRequestedAt: user.deletion_requested_at,
        deletedAt: user.deleted_at,
      },
      usernames: [
        ...handles.map((h) => ({
          username: h.username_lower,
          ownerType: h.owner_type,
          current: true,
          since: h.created_at,
        })),
        ...oldHandles.map((h) => ({
          username: h.username_lower,
          ownerType: 'user',
          current: false,
          releasedAt: h.released_at,
        })),
      ],
      counts: {
        messages: cMessages,
        conversations: conversations.length,
        groups: groups.length,
        channels: channels.length,
        channelPosts: cChannelPosts,
        posts: cPosts,
        reels: cReels,
        stories: cStories,
        questions: cQuestions,
        sessions: sessions.length,
      },
      conversations: conversations.map((c) => ({
        id: c.id,
        kind: c.pair_kind,
        with: name(c.client.id === userId ? c.attorney : c.client),
        withUserId: c.client.id === userId ? c.attorney.id : c.client.id,
        lastMessageAt: c.last_message_at,
        createdAt: c.created_at,
      })),
      groups: groups.map((m) => ({
        id: m.group.id,
        title: m.group.title,
        username: m.group.username,
        role: m.role,
        members: m.group.member_count,
        joinedAt: m.joined_at,
        leftAt: m.left_at,
        deletedAt: m.group.deleted_at,
      })),
      channels: channels.map((c) => ({
        id: c.id,
        title: c.title,
        username: c.username,
        owner: c.owner_id === userId,
        posts: c.post_count,
        deletedAt: c.deleted_at,
      })),
      sessions,
      holds,
    };
  }
}
