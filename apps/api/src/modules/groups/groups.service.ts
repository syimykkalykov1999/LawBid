import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { UsernamePolicyService } from '../usernames/username-policy.service';
import { GroupAddPolicy } from './group-add-policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  ChatGroup,
  ChatGroupInvite,
  ChatGroupMember,
  ChatGroupMessage,
  ChatGroupTopic,
} from '@prisma/client';
import { Subject } from 'rxjs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseUpdatedSince,
  syncedAt,
  SYNC_TOO_OLD_ERROR,
  type SyncPage,
} from '../../common/sync/sync.util';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { FilesService } from '../files/files.service';
import { decodeOffset, encodeOffset } from '../recommendations/offset-cursor';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { BadgesService } from '../notifications/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  GroupFanoutQueue,
  broadcastAudiences,
  type GroupFanoutJob,
} from './group-fanout.queue';
import {
  GroupPresenter,
  NOBODY,
  isAdminRole,
  rightsOf,
} from './group-presenter.service';
import {
  GROUP_HARD_MAX_MEMBERS,
  GROUP_MAX_MEMBERS,
  type AddGroupMembersDto,
  type CreateGroupDto,
  type CreateTopicDto,
  type GroupJoinRequestDto,
  type GroupJoinResultDto,
  type GroupTopicDto,
  type UpdateTopicDto,
  type GroupDetailDto,
  type GroupCardDto,
  type GroupDto,
  type GroupDiscoverPageDto,
  type GroupInviteDto,
  type GroupInvitePreviewDetailDto,
  type GroupInvitePreviewDto,
  type GroupPersonDto,
  type GroupMessageDto,
  type GroupMessagePage,
  type GroupPage,
  type GroupAdminRight,
  type GroupRoleName,
  DEFAULT_ADMIN_RIGHTS,
  GROUP_ADMIN_RIGHTS,
  type SendGroupMessageDto,
  type UpdateGroupDto,
  type UpdateGroupMeDto,
} from './groups.dto';

import {
  DISAPPEAR_OPTIONS_S,
  expiresAtFor,
  notExpired,
} from '../chat/disappearing';
import {
  type ForwardContent,
  contentProtected,
  forwardName,
  forwardNotAllowed,
  forwardPartId,
  unsupportedInTarget,
} from '../../common/forward/forward-content';

const GROUPS_PAGE = 30;
const MESSAGES_PAGE = 30;
/** `afterId` catch-up: more than this many missed → reload the page. */
export const CATCH_UP_MAX = 200;
/** `group:update` kinds whose event carries the shared card. */
const CARD_KINDS = new Set(['info', 'members', 'topics', 'pinned', 'deleted']);
const INVITE_RETRY_MS = 24 * 3600 * 1000;
const TOPICS_MAX = 100;
const TOPIC_COLORS = 7;

/** Why a person is no longer in a group (consumed by the calls module). */
export interface MembershipEnded {
  groupId: string;
  userId: string;
  reason: 'left' | 'removed' | 'group_deleted';
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.GROUP_NOT_FOUND,
    message: 'Group not found.',
  });
}

function forbidden(message = 'Only admins can do that.'): ForbiddenException {
  return new ForbiddenException({ code: ErrorCode.GROUP_FORBIDDEN, message });
}

export interface Membership {
  group: ChatGroup;
  me: ChatGroupMember;
  role: GroupRoleName;
  admin: boolean;
  /** Telegram's checkboxes I hold (the owner: all). */
  rights: GroupAdminRight[];
  can: (right: GroupAdminRight) => boolean;
}

/**
 * Owner 2026-10-20: group chats «как Telegram + WhatsApp» — groups,
 * members and roles, messages (text, files, replies, @mentions, edit,
 * delete for everyone, pin), the join link. Polls live in
 * [GroupPollsService]; rows → DTOs in [GroupPresenter]. The REST reads are
 * the source of truth; realtime (`group:message`, `group:update`,
 * `group:member_removed`) only delivers.
 *
 * For the calls module: [membershipEnded$] fires whenever someone leaves,
 * is removed or the group is deleted (drop them from a running group call);
 * [activeMemberIds], [assertMember] and [canStartCall] answer who is in and
 * who may ring the group.
 */
@Injectable()
export class GroupsService {
  readonly membershipEnded$ = new Subject<MembershipEnded>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
    private readonly badges: BadgesService,
    private readonly blocks: BlocksService,
    private readonly presenter: GroupPresenter,
    private readonly addPolicy: GroupAddPolicy,
    private readonly usernames: UsernamePolicyService,
    private readonly reco: RecommendationsService,
    // Owner 2026-10-22 (server load audit, finding 7): realtime, badges
    // and pushes of a message go out from the ordered fan-out queue.
    private readonly fanoutQueue: GroupFanoutQueue,
    // Owner 2026-10-22 (audit #4 §6): groups per day and members per group
    // are admin settings again.
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly limits?: UsageLimitsService,
  ) {}

  /** `groups.max_members` (admin), never above the hard ceiling. */
  private async maxMembers(): Promise<number> {
    const n = (await this.settings?.number('groups.max_members')) ?? 0;
    return n > 0 ? Math.min(n, GROUP_HARD_MAX_MEMBERS) : GROUP_MAX_MEMBERS;
  }

  // ------------------------------------------------------------ membership

  /** The live group + my live membership, else 404 (never leak existence). */
  async requireMember(userId: string, groupId: string): Promise<Membership> {
    const me = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      include: { group: true },
    });
    if (!me || me.left_at !== null || me.group.deleted_at !== null) {
      throw notFound();
    }
    const { group, ...member } = me;
    const rights = rightsOf(member);
    return {
      group,
      me: member,
      role: member.role,
      admin: isAdminRole(member.role),
      rights,
      can: (right) => rights.includes(right),
    };
  }

  /** For the calls module: 404 unless [userId] is in the group. */
  async assertMember(userId: string, groupId: string): Promise<Membership> {
    return this.requireMember(userId, groupId);
  }

  /** For the calls module: everyone currently in the group. */
  async activeMemberIds(groupId: string): Promise<string[]> {
    const rows = await this.prisma.chatGroupMember.findMany({
      where: { group_id: groupId, left_at: null },
      select: { user_id: true },
    });
    return rows.map((r) => r.user_id);
  }

  /** For the calls module: the owner and admins currently in the group. */
  async adminIds(groupId: string): Promise<string[]> {
    const rows = await this.prisma.chatGroupMember.findMany({
      where: { group_id: groupId, left_at: null },
      select: { user_id: true, role: true },
    });
    return rows.filter((r) => isAdminRole(r.role)).map((r) => r.user_id);
  }

  /** For the calls module: may [userId] ring the whole group? */
  async canStartCall(userId: string, groupId: string): Promise<boolean> {
    try {
      const m = await this.requireMember(userId, groupId);
      return m.group.who_can_call === 'all' || m.can('calls');
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ reads

  async list(
    user: RequestUser,
    cursor?: string,
    archived = false,
    updatedSinceRaw?: string,
  ): Promise<GroupPage> {
    const since = parseUpdatedSince(updatedSinceRaw);
    if (since) return this.listChanged(user, archived, since);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const base: Prisma.ChatGroupMemberWhereInput = {
      user_id: user.sub,
      left_at: null,
      hidden_at: null,
      archived_at: archived ? { not: null } : null,
      group: { deleted_at: null, last_message_at: { not: null } },
    };
    const pinned = !c
      ? await this.prisma.chatGroupMember.findMany({
          where: { ...base, pinned_at: { not: null } },
          include: { group: true },
          take: 50,
        })
      : [];
    const rows = await this.prisma.chatGroupMember.findMany({
      where: {
        ...base,
        pinned_at: null,
        ...(c
          ? {
              group: {
                deleted_at: null,
                OR: [
                  { last_message_at: { lt: c.createdAt } },
                  { last_message_at: c.createdAt, id: { lt: c.id } },
                ],
              },
            }
          : {}),
      },
      include: { group: true },
      orderBy: [
        { group: { last_message_at: 'desc' } },
        { group: { id: 'desc' } },
      ],
      take: GROUPS_PAGE + 1,
    });
    const page = rows.slice(0, GROUPS_PAGE);
    const last = page[page.length - 1]?.group;
    const items = await this.presenter.groups(
      [...pinned, ...page].map(({ group, ...me }) => ({ group, me })),
      user.sub,
    );
    return {
      items,
      nextCursor:
        rows.length > GROUPS_PAGE && last?.last_message_at
          ? encodeCursor({ createdAt: last.last_message_at, id: last.id })
          : null,
    };
  }

  /**
   * Owner 2026-10-22 (client economy plan, package B, Telegram
   * getDifference): GET /groups?updatedSince — the groups whose row
   * (a message, settings, members) or my membership row (read, pin,
   * archive, hide) changed since; the ones that left this list come back
   * as ids. syncedAt = the newest stamp of the answer.
   */
  private async listChanged(
    user: RequestUser,
    archived: boolean,
    since: Date,
  ): Promise<GroupPage> {
    const rows = await this.prisma.chatGroupMember.findMany({
      where: {
        user_id: user.sub,
        OR: [
          { updated_at: { gte: since } },
          { group: { updated_at: { gte: since } } },
        ],
      },
      include: { group: true },
      orderBy: [
        { group: { last_message_at: 'desc' } },
        { group: { id: 'desc' } },
      ],
      take: 500,
    });
    const inList = (m: (typeof rows)[number]) =>
      m.left_at === null &&
      m.hidden_at === null &&
      (archived ? m.archived_at !== null : m.archived_at === null) &&
      m.group.deleted_at === null &&
      m.group.last_message_at !== null;
    const kept = rows.filter(inList);
    const deletedIds = rows.filter((m) => !inList(m)).map((m) => m.group_id);
    const items = await this.presenter.groups(
      kept.map(({ group, ...me }) => ({ group, me })),
      user.sub,
    );
    return {
      items,
      nextCursor: null,
      deletedIds,
      syncedAt: syncedAt(
        rows.flatMap((m) => [m.updated_at, m.group.updated_at]),
        since,
      ),
    };
  }

  async get(user: RequestUser, id: string): Promise<GroupDetailDto> {
    return this.detail(user.sub, id);
  }

  private async detail(userId: string, id: string): Promise<GroupDetailDto> {
    const { group, me } = await this.requireMember(userId, id);
    const [[dto], members] = await Promise.all([
      this.presenter.groups([{ group, me }], userId),
      this.prisma.chatGroupMember.findMany({
        where: { group_id: id, left_at: null },
      }),
    ]);
    // Owner 2026-10-21: whom I invited and who has not answered yet.
    const pending =
      me.role === 'member' && group.who_can_add !== 'all'
        ? []
        : await this.prisma.chatGroupInvite.findMany({
            where: { group_id: id, status: 'pending' },
            orderBy: { created_at: 'desc' },
            take: 100,
          });
    const people = await this.presenter.people(
      pending.map((x) => x.invitee_id),
    );
    return {
      ...dto,
      members: await this.presenter.members(members),
      invited: pending.flatMap((x) => {
        const p = people.get(x.invitee_id);
        return p ? [p] : [];
      }),
    };
  }

  async messages(
    user: RequestUser,
    id: string,
    cursor?: string,
    limit = MESSAGES_PAGE,
    topicId?: string,
  ): Promise<GroupMessagePage> {
    await this.requireMember(user.sub, id);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const topic = topicId ? await this.topicOf(id, topicId) : null;
    const hideService = !(await this.requireMember(user.sub, id)).group
      .show_service_messages;
    const rows = await this.prisma.chatGroupMessage.findMany({
      where: {
        group_id: id,
        deleted_at: {},
        ...(hideService ? { type: { not: 'system' as const } } : {}),
        // «General» also holds the chat from before topics (topic_id null).
        ...(topic
          ? topic.is_general
            ? { OR: [{ topic_id: topic.id }, { topic_id: null }] }
            : { topic_id: topic.id }
          : {}),
        AND: [
          notExpired(),
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

  /**
   * Owner 2026-10-22 (package B): GET /groups/:id/messages?afterId — the
   * messages after one (oldest first), the catch-up after a reconnect.
   * More than [CATCH_UP_MAX] missed → 409 SYNC_TOO_OLD: the app reloads
   * the page instead.
   */
  async messagesAfter(
    user: RequestUser,
    id: string,
    afterId: string,
    topicId?: string,
  ): Promise<GroupMessagePage> {
    const m = await this.requireMember(user.sub, id);
    const topic = topicId ? await this.topicOf(id, topicId) : null;
    const anchor = await this.prisma.chatGroupMessage.findFirst({
      where: { id: afterId, group_id: id },
      select: { id: true, created_at: true },
    });
    if (!anchor) throw notFound();
    const rows = await this.prisma.chatGroupMessage.findMany({
      where: {
        group_id: id,
        deleted_at: {},
        ...(m.group.show_service_messages
          ? {}
          : { type: { not: 'system' as const } }),
        ...(topic
          ? topic.is_general
            ? { OR: [{ topic_id: topic.id }, { topic_id: null }] }
            : { topic_id: topic.id }
          : {}),
        AND: [
          notExpired(),
          {
            OR: [
              { created_at: { gt: anchor.created_at } },
              { created_at: anchor.created_at, id: { gt: anchor.id } },
            ],
          },
        ],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: CATCH_UP_MAX + 1,
    });
    if (rows.length > CATCH_UP_MAX) {
      throw new ConflictException({
        ...SYNC_TOO_OLD_ERROR,
        message: 'Too many messages since afterId — reload the page.',
        details: { field: 'afterId', max: CATCH_UP_MAX },
      });
    }
    return {
      items: await this.presenter.messages(rows, user.sub),
      nextCursor: null,
    };
  }

  // ----------------------------------------------------------------- create

  async create(
    user: RequestUser,
    dto: CreateGroupDto,
  ): Promise<GroupDetailDto> {
    // Owner 2026-10-22 (audit #4 §6): `rate_limit.group_create_per_day`.
    await this.limits?.consume('group_create', user.sub);
    if (dto.avatarFileId) {
      await this.files.assertAttachable(user.sub, dto.avatarFileId, ['avatar']);
    }
    const type = dto.type ?? 'private';
    if (type === 'public' && !dto.username) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A public group needs a @username.',
        details: { field: 'username' },
      });
    }
    // Owner 2026-10-20: one @username namespace — people, channels, groups.
    const handle =
      type === 'public'
        ? await this.usernames.assertAvailable(
            dto.username!,
            'group',
            { userId: user.sub },
            ErrorCode.GROUP_USERNAME_TAKEN,
            { title: dto.title },
          )
        : null;
    const others = await this.addableIds(user.sub, dto.memberIds);
    if (others.length === 0 && type === 'private') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Add at least one person.',
        details: { field: 'memberIds' },
      });
    }
    const title = dto.title.trim();
    const { groupId, rows } = await withTxRetry(this.prisma, async (tx) => {
      const g = await tx.chatGroup.create({
        data: {
          group_type: type,
          username: type === 'public' ? dto.username!.replace(/^@/, '') : null,
          username_lower: handle,
          join_approval: type === 'closed' && !!dto.joinApproval,
          invite_enabled: type !== 'private',
          // Owner 2026-10-21 (inbox 20, WhatsApp): any member starts a call.
          who_can_call: 'all',
          title,
          description: dto.description?.trim() || null,
          avatar_file_id: dto.avatarFileId ?? null,
          created_by: user.sub,
          invite_code: newInviteCode(),
          // Owner 2026-10-21: nobody is put in — the people are invited.
          member_count: 1,
          members: { create: [{ user_id: user.sub, role: 'owner' }] },
        },
      });
      const created = await this.system(
        tx,
        g.id,
        'created',
        user.sub,
        [],
        title,
      );
      const out = [created];
      const last = out[out.length - 1];
      await tx.chatGroup.update({
        where: { id: g.id },
        data: { last_message_id: last.id, last_message_at: last.created_at },
      });
      return { groupId: g.id, rows: out };
    }).catch((error: unknown) => {
      throw this.usernameTaken(error) ?? error;
    });
    for (const row of rows) await this.broadcast(groupId, row);
    await this.sendInvites(groupId, user.sub, others);
    return this.detail(user.sub, groupId);
  }

  // ----------------------------------------------------------------- update

  async update(
    user: RequestUser,
    id: string,
    dto: UpdateGroupDto,
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    const settings =
      dto.whoCanPost !== undefined ||
      dto.whoCanAdd !== undefined ||
      dto.whoCanEditInfo !== undefined ||
      dto.whoCanCall !== undefined ||
      dto.whoCanMedia !== undefined ||
      dto.whoCanPoll !== undefined ||
      dto.whoCanPin !== undefined ||
      dto.showServiceMessages !== undefined ||
      dto.type !== undefined ||
      dto.username !== undefined ||
      dto.joinApproval !== undefined ||
      dto.topicsEnabled !== undefined ||
      dto.protectContent !== undefined;
    const info =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.avatarFileId !== undefined;
    if (settings && !m.can('info')) throw forbidden();
    // Owner 2026-10-21 (WhatsApp): the disappearing timer follows «edit group
    // info» — admins always, everyone while it is open to all.
    const disappearing =
      dto.disappearAfterS !== undefined &&
      (dto.disappearAfterS || null) !== m.group.disappear_after_s;
    if (
      dto.disappearAfterS !== undefined &&
      !(m.can('info') || m.group.who_can_edit_info === 'all')
    ) {
      throw forbidden();
    }
    if (
      dto.disappearAfterS &&
      !(DISAPPEAR_OPTIONS_S as readonly number[]).includes(dto.disappearAfterS)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Unsupported disappearing-messages timer.',
        details: { field: 'disappearAfterS' },
      });
    }
    if (dto.inviteEnabled !== undefined && !m.can('invite')) throw forbidden();
    if (info && !(m.can('info') || m.group.who_can_edit_info === 'all')) {
      throw forbidden();
    }
    if (dto.avatarFileId) {
      await this.files.assertAttachable(user.sub, dto.avatarFileId, ['avatar']);
    }
    const data: Prisma.ChatGroupUpdateInput = {};
    const newTitle = dto.title?.trim();
    const renamed = newTitle !== undefined && newTitle !== m.group.title;
    if (renamed) data.title = newTitle;
    let describedChanged = false;
    if (dto.description !== undefined) {
      const d = dto.description.trim() || null;
      describedChanged = d !== m.group.description;
      data.description = d;
    }
    const photoChanged =
      dto.avatarFileId !== undefined &&
      dto.avatarFileId !== m.group.avatar_file_id;
    if (dto.avatarFileId !== undefined) {
      data.avatar_file =
        dto.avatarFileId === null
          ? { disconnect: true }
          : { connect: { id: dto.avatarFileId } };
    }
    if (disappearing) data.disappear_after_s = dto.disappearAfterS || null;
    if (dto.whoCanPost) data.who_can_post = dto.whoCanPost;
    if (dto.whoCanAdd) data.who_can_add = dto.whoCanAdd;
    if (dto.whoCanEditInfo) data.who_can_edit_info = dto.whoCanEditInfo;
    if (dto.whoCanCall) data.who_can_call = dto.whoCanCall;
    if (dto.whoCanMedia) data.who_can_media = dto.whoCanMedia;
    if (dto.whoCanPoll) data.who_can_poll = dto.whoCanPoll;
    if (dto.whoCanPin) data.who_can_pin = dto.whoCanPin;
    if (dto.showServiceMessages !== undefined) {
      data.show_service_messages = dto.showServiceMessages;
    }
    if (dto.inviteEnabled !== undefined)
      data.invite_enabled = dto.inviteEnabled;
    // Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»).
    const protectChanged =
      dto.protectContent !== undefined &&
      dto.protectContent !== m.group.protect_content;
    if (protectChanged) data.protect_content = dto.protectContent;

    // Type switch: the rules move with it (public needs a @username, a
    // private group has no link, closed keeps the approval flag).
    const g0 = m.group;
    const newType = dto.type ?? g0.group_type;
    const newUsername = dto.username !== undefined ? dto.username : g0.username;
    if (newType === 'public' && !newUsername) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A public group needs a @username.',
        details: { field: 'username' },
      });
    }
    if (
      newType === 'public' &&
      g0.group_type !== 'public' &&
      m.role !== 'owner'
    ) {
      throw forbidden('Only the owner can make a group public.');
    }
    if (dto.type !== undefined) {
      data.group_type = newType;
      if (newType !== g0.group_type) {
        data.invite_enabled =
          dto.inviteEnabled !== undefined
            ? dto.inviteEnabled && newType !== 'private'
            : newType !== 'private';
      }
    }
    if (newType === 'public') {
      const handle = newUsername!.replace(/^@/, '');
      if (handle.toLowerCase() !== g0.username_lower) {
        // Owner 2026-10-20: once per N days, and the same namespace rules.
        const wait = g0.username_lower
          ? await this.usernames.nextChangeAt(g0.username_changed_at)
          : null;
        if (wait) {
          throw new ConflictException({
            code: ErrorCode.USERNAME_CHANGE_TOO_SOON,
            message: 'The @username was changed recently.',
            details: { nextChangeAt: wait.toISOString() },
          });
        }
        await this.usernames.assertAvailable(
          handle,
          'group',
          { userId: user.sub, owner: { type: 'group', id } },
          ErrorCode.GROUP_USERNAME_TAKEN,
          { title: dto.title ?? g0.title },
        );
        data.username_changed_at = new Date();
      }
      data.username = handle;
      data.username_lower = handle.toLowerCase();
    } else {
      data.username = null;
      data.username_lower = null;
    }
    if (newType === 'private') data.invite_enabled = false;
    data.join_approval =
      newType === 'closed' ? (dto.joinApproval ?? g0.join_approval) : false;

    const topicsOn =
      dto.topicsEnabled !== undefined &&
      dto.topicsEnabled !== m.group.topics_enabled;
    const rows = await withTxRetry(this.prisma, async (tx) => {
      await tx.chatGroup.update({ where: { id }, data });
      if (topicsOn) await this.switchTopics(tx, m.group, dto.topicsEnabled!);
      const out: ChatGroupMessage[] = [];
      if (renamed) {
        out.push(await this.system(tx, id, 'renamed', user.sub, [], newTitle));
      }
      if (photoChanged) {
        out.push(await this.system(tx, id, 'photo', user.sub, []));
      }
      if (describedChanged) {
        out.push(await this.system(tx, id, 'description', user.sub, []));
      }
      if (disappearing) {
        // The line never expires itself; the text is the new timer ("0" off).
        out.push(
          await this.system(
            tx,
            id,
            'disappearing',
            user.sub,
            [],
            String(dto.disappearAfterS || 0),
          ),
        );
      }
      if (protectChanged) {
        // The text is "1" (on) or "0" (off).
        out.push(
          await this.system(
            tx,
            id,
            'protect_content',
            user.sub,
            [],
            dto.protectContent ? '1' : '0',
          ),
        );
      }
      const last = out[out.length - 1];
      if (last) {
        await tx.chatGroup.update({
          where: { id },
          data: { last_message_id: last.id, last_message_at: last.created_at },
        });
      }
      return out;
    }).catch((error: unknown) => {
      throw this.usernameTaken(error) ?? error;
    });
    for (const row of rows) await this.broadcast(id, row);
    await this.groupChanged(id, topicsOn ? 'topics' : 'info');
    return this.detail(user.sub, id);
  }

  async resetInvite(user: RequestUser, id: string): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('invite')) throw forbidden();
    if (m.group.group_type === 'private') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A private group has no join link.',
        details: { field: 'type' },
      });
    }
    await this.prisma.chatGroup.update({
      where: { id },
      data: { invite_code: newInviteCode(), invite_enabled: true },
    });
    await this.groupChanged(id, 'info');
    return this.detail(user.sub, id);
  }

  async deleteGroup(user: RequestUser, id: string): Promise<void> {
    const m = await this.requireMember(user.sub, id);
    if (m.role !== 'owner')
      throw forbidden('Only the owner can delete the group.');
    await this.adminDeleteGroup(id);
  }

  // ---------------------------------------------------------------- members

  /**
   * Owner 2026-10-21 (Instagram): «Add» is an invitation. The person sees it
   * in Requests and joins after «Accept»; someone who declined can be asked
   * again after a day.
   */
  async addMembers(
    user: RequestUser,
    id: string,
    dto: AddGroupMembersDto,
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (!(m.can('invite') || m.group.who_can_add === 'all')) throw forbidden();
    const wanted = await this.addableIds(user.sub, dto.userIds);
    const { held } = await this.sendInvites(id, user.sub, wanted);
    const notAdded = dto.userIds.filter(
      (u) => u !== user.sub && !wanted.includes(u),
    );
    return {
      ...(await this.detail(user.sub, id)),
      notAdded: [...notAdded, ...held],
    };
  }

  /**
   * Invitations to [ids] (already screened by [addableIds]). Skips people
   * already inside and ones who declined less than a day ago ([held]).
   */
  private async sendInvites(
    groupId: string,
    inviterId: string,
    ids: string[],
  ): Promise<{ sent: string[]; held: string[] }> {
    if (ids.length === 0) return { sent: [], held: [] };
    const [members, invites, group] = await Promise.all([
      this.prisma.chatGroupMember.findMany({
        where: { group_id: groupId, user_id: { in: ids }, left_at: null },
        select: { user_id: true },
      }),
      this.prisma.chatGroupInvite.findMany({
        where: { group_id: groupId, invitee_id: { in: ids } },
      }),
      this.prisma.chatGroup.findUnique({
        where: { id: groupId },
        select: { title: true },
      }),
    ]);
    const inside = new Set(members.map((x) => x.user_id));
    const byId = new Map(invites.map((x) => [x.invitee_id, x]));
    const dayAgo = Date.now() - INVITE_RETRY_MS;
    const sent: string[] = [];
    const held: string[] = [];
    for (const uid of ids) {
      if (inside.has(uid)) continue;
      const old = byId.get(uid);
      if (old?.status === 'pending') continue;
      if (
        old?.status === 'declined' &&
        (old.responded_at?.getTime() ?? 0) > dayAgo
      ) {
        held.push(uid);
        continue;
      }
      const row = await this.prisma.chatGroupInvite.upsert({
        where: { group_id_invitee_id: { group_id: groupId, invitee_id: uid } },
        create: { group_id: groupId, invitee_id: uid, inviter_id: inviterId },
        update: {
          inviter_id: inviterId,
          status: 'pending',
          created_at: new Date(),
          responded_at: null,
        },
      });
      sent.push(uid);
      this.realtime.toUsers([uid], 'group:invite', { groupId });
      await this.badges.chatsChanged(uid).catch(() => undefined);
      await this.notifications
        .emit({
          type: 'group_invite',
          recipientId: uid,
          payload: {
            groupId,
            inviteId: row.id,
            groupTitle: group?.title ?? '',
            inviterId,
          },
        })
        .catch(() => undefined);
    }
    if (sent.length) await this.groupChanged(groupId, 'invites');
    return { sent, held };
  }

  /** My pending invitations (the group cards in Requests). */
  async myInvites(user: RequestUser): Promise<GroupInviteDto[]> {
    const rows = await this.prisma.chatGroupInvite.findMany({
      where: {
        invitee_id: user.sub,
        status: 'pending',
        group: { deleted_at: null },
      },
      include: { group: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return this.inviteDtos(rows);
  }

  private async inviteDtos(
    rows: (ChatGroupInvite & { group: ChatGroup })[],
  ): Promise<GroupInviteDto[]> {
    if (rows.length === 0) return [];
    const [people, avatars] = await Promise.all([
      this.presenter.people(rows.map((r) => r.inviter_id)),
      this.files.avatarUrlsMany(rows.map((r) => r.group.avatar_file_id)),
    ]);
    return rows.flatMap((r) => {
      const inviter = people.get(r.inviter_id);
      if (!inviter) return [];
      return [
        {
          id: r.id,
          groupId: r.group_id,
          title: r.group.title,
          avatarUrl: r.group.avatar_file_id
            ? (avatars.get(r.group.avatar_file_id)?.url256 ?? null)
            : null,
          memberCount: r.group.member_count,
          type: r.group.group_type,
          inviter,
          createdAt: r.created_at,
        },
      ];
    });
  }

  private async myInvite(
    userId: string,
    inviteId: string,
  ): Promise<ChatGroupInvite & { group: ChatGroup }> {
    const row = await this.prisma.chatGroupInvite.findUnique({
      where: { id: inviteId },
      include: { group: true },
    });
    if (
      !row ||
      row.invitee_id !== userId ||
      row.status !== 'pending' ||
      row.group.deleted_at !== null
    ) {
      throw notFound();
    }
    return row;
  }

  /** Look inside before answering: open group = members and chat, read-only. */
  async invitePreview(
    user: RequestUser,
    inviteId: string,
  ): Promise<GroupInvitePreviewDetailDto> {
    const row = await this.myInvite(user.sub, inviteId);
    const [invite] = await this.inviteDtos([row]);
    if (!invite) throw notFound();
    const readable = row.group.group_type === 'public';
    let members: GroupPersonDto[] = [];
    let messages: GroupMessageDto[] = [];
    if (readable) {
      const [memberRows, messageRows] = await Promise.all([
        this.prisma.chatGroupMember.findMany({
          where: { group_id: row.group_id, left_at: null },
          orderBy: { joined_at: 'asc' },
          take: 50,
        }),
        this.prisma.chatGroupMessage.findMany({
          where: {
            group_id: row.group_id,
            deleted_at: null,
            type: { not: 'system' },
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 30,
        }),
      ]);
      members = (await this.presenter.members(memberRows)).map(
        (m): GroupPersonDto => ({
          userId: m.userId,
          displayName: m.displayName,
          username: m.username,
          avatarUrl: m.avatarUrl,
          kind: m.kind,
          verifiedBadge: m.verifiedBadge,
        }),
      );
      messages = await this.presenter.messages(messageRows, user.sub);
    }
    return {
      invite,
      description: row.group.description,
      readable,
      members,
      messages,
    };
  }

  async acceptInvite(
    user: RequestUser,
    inviteId: string,
  ): Promise<GroupJoinResultDto> {
    const row = await this.myInvite(user.sub, inviteId);
    const existing = await this.prisma.chatGroupMember.findUnique({
      where: {
        group_id_user_id: { group_id: row.group_id, user_id: user.sub },
      },
    });
    if (!existing || existing.left_at !== null) {
      const line = await this.admit(
        row.group_id,
        user.sub,
        row.inviter_id,
        'added',
      );
      await this.broadcast(row.group_id, line);
      await this.groupChanged(row.group_id, 'members');
    }
    await this.prisma.chatGroupInvite.update({
      where: { id: row.id },
      data: { status: 'accepted', responded_at: new Date() },
    });
    await this.badges.chatsChanged(user.sub).catch(() => undefined);
    await this.prisma.chatGroupJoinRequest
      .deleteMany({ where: { group_id: row.group_id, user_id: user.sub } })
      .catch(() => undefined);
    return {
      status: 'joined',
      groupId: row.group_id,
      group: await this.detail(user.sub, row.group_id),
    };
  }

  async declineInvite(user: RequestUser, inviteId: string): Promise<void> {
    const row = await this.myInvite(user.sub, inviteId);
    await this.prisma.chatGroupInvite.update({
      where: { id: row.id },
      data: { status: 'declined', responded_at: new Date() },
    });
    await this.badges.chatsChanged(user.sub).catch(() => undefined);
    await this.groupChanged(row.group_id, 'invites');
  }

  async removeMember(
    user: RequestUser,
    id: string,
    targetId: string,
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (targetId === user.sub) throw forbidden('Use leave instead.');
    if (!m.can('ban')) throw forbidden();
    const target = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: targetId } },
    });
    if (!target || target.left_at !== null) throw notFound();
    if (target.role === 'owner')
      throw forbidden('The owner cannot be removed.');
    if (target.role === 'admin' && m.role !== 'owner') {
      throw forbidden('Only the owner can remove an admin.');
    }
    const row = await this.endMembership(id, targetId, 'removed', user.sub);
    await this.broadcast(id, row);
    await this.groupChanged(id, 'members');
    return this.detail(user.sub, id);
  }

  async leave(user: RequestUser, id: string): Promise<void> {
    const m = await this.requireMember(user.sub, id);
    if (m.role === 'owner') {
      // Hand the group to the longest-serving admin, else member.
      const heir =
        (await this.prisma.chatGroupMember.findFirst({
          where: { group_id: id, left_at: null, user_id: { not: user.sub } },
          orderBy: [{ role: 'asc' }, { joined_at: 'asc' }],
        })) ?? null;
      if (!heir) {
        await this.deleteGroup(user, id);
        return;
      }
      await this.prisma.chatGroupMember.update({
        where: { group_id_user_id: { group_id: id, user_id: heir.user_id } },
        data: { role: 'owner' },
      });
    }
    const row = await this.endMembership(id, user.sub, 'left', user.sub);
    await this.broadcast(id, row);
    await this.groupChanged(id, 'members');
  }

  async setRole(
    user: RequestUser,
    id: string,
    targetId: string,
    role: 'admin' | 'member',
    rights?: GroupAdminRight[],
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('admins')) throw forbidden('Only the owner can do that.');
    const target = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: targetId } },
    });
    if (!target || target.left_at !== null || target.role === 'owner') {
      throw notFound();
    }
    const asOwner = m.role === 'owner';
    // An admin with «add admins» may only raise plain members; changing or
    // removing an admin is the owner's.
    if (!asOwner && target.role === 'admin') {
      throw forbidden('Only the owner can change an admin.');
    }
    const granted =
      role === 'admin'
        ? [...new Set(rights ?? DEFAULT_ADMIN_RIGHTS)].filter((r) =>
            asOwner ? true : m.rights.includes(r),
          )
        : [];
    const same =
      target.role === role &&
      granted.length === target.admin_rights.length &&
      granted.every((r) => target.admin_rights.includes(r));
    if (!same) {
      const row = await withTxRetry(this.prisma, async (tx) => {
        await tx.chatGroupMember.update({
          where: { group_id_user_id: { group_id: id, user_id: targetId } },
          data: { role, admin_rights: granted },
        });
        const sys = await this.system(
          tx,
          id,
          role === 'admin' ? 'promoted' : 'demoted',
          user.sub,
          [targetId],
        );
        await tx.chatGroup.update({
          where: { id },
          data: { last_message_id: sys.id, last_message_at: sys.created_at },
        });
        return sys;
      });
      await this.broadcast(id, row);
      await this.groupChanged(id, 'members');
    }
    return this.detail(user.sub, id);
  }

  /** Owner only: hand the group to [targetId]; I stay as an admin. */
  async transferOwner(
    user: RequestUser,
    id: string,
    targetId: string,
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (m.role !== 'owner') throw forbidden('Only the owner can do that.');
    if (targetId === user.sub) throw forbidden();
    const target = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: targetId } },
    });
    if (!target || target.left_at !== null) throw notFound();
    const row = await withTxRetry(this.prisma, async (tx) => {
      await tx.chatGroupMember.update({
        where: { group_id_user_id: { group_id: id, user_id: targetId } },
        data: { role: 'owner', admin_rights: [] },
      });
      await tx.chatGroupMember.update({
        where: { group_id_user_id: { group_id: id, user_id: user.sub } },
        data: { role: 'admin', admin_rights: [...GROUP_ADMIN_RIGHTS] },
      });
      const sys = await this.system(tx, id, 'transferred', user.sub, [
        targetId,
      ]);
      await tx.chatGroup.update({
        where: { id },
        data: { last_message_id: sys.id, last_message_at: sys.created_at },
      });
      return sys;
    });
    await this.broadcast(id, row);
    await this.groupChanged(id, 'members');
    return this.detail(user.sub, id);
  }

  // ------------------------------------------------------- admin (platform)

  /** Admin panel: remove [userId] whatever the group's rules say. */
  async adminRemoveMember(groupId: string, userId: string): Promise<void> {
    const target = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      include: { group: true },
    });
    if (!target || target.left_at !== null || target.group.deleted_at) {
      throw notFound();
    }
    if (target.role === 'owner') {
      // Hand the group over first, like a voluntary leave.
      const heir = await this.prisma.chatGroupMember.findFirst({
        where: { group_id: groupId, left_at: null, user_id: { not: userId } },
        orderBy: [{ role: 'asc' }, { joined_at: 'asc' }],
      });
      if (!heir) {
        await this.adminDeleteGroup(groupId);
        return;
      }
      await this.prisma.chatGroupMember.update({
        where: {
          group_id_user_id: { group_id: groupId, user_id: heir.user_id },
        },
        data: { role: 'owner' },
      });
    }
    const row = await this.endMembership(groupId, userId, 'removed', null);
    await this.broadcast(groupId, row);
    await this.groupChanged(groupId, 'members');
  }

  /** Admin panel: close the group for everyone. */
  async adminDeleteGroup(groupId: string): Promise<void> {
    const g = await this.prisma.chatGroup.findUnique({
      where: { id: groupId },
    });
    if (!g || g.deleted_at) throw notFound();
    const ids = await this.activeMemberIds(groupId);
    await this.prisma.chatGroup.update({
      where: { id: groupId },
      data: { deleted_at: new Date() },
    });
    this.realtime.toUsers(ids, 'group:update', { groupId, kind: 'deleted' });
    for (const uid of ids) {
      this.membershipEnded$.next({
        groupId,
        userId: uid,
        reason: 'group_deleted',
      });
      await this.badges.chatsChanged(uid);
    }
  }

  // ---------------------------------------------------- invites and joining

  async previewInvite(
    user: RequestUser,
    code: string,
  ): Promise<GroupInvitePreviewDto> {
    const g = await this.byCode(code);
    return (await this.previews([g], user.sub, code))[0];
  }

  /** Public groups by title or @username (the «Find groups» search). */
  async searchPublic(
    user: RequestUser,
    q: string,
  ): Promise<GroupInvitePreviewDto[]> {
    const text = q.trim().replace(/^@/, '');
    const rows = await this.prisma.chatGroup.findMany({
      where: {
        group_type: 'public',
        deleted_at: null,
        OR: [
          { title: { contains: text, mode: 'insensitive' } },
          { username_lower: { contains: text.toLowerCase() } },
        ],
      },
      orderBy: [{ member_count: 'desc' }, { created_at: 'desc' }],
      take: 20,
    });
    return this.previews(rows, user.sub);
  }

  /**
   * «Recommended» groups: the per-viewer snapshot of RecommendationsService,
   * paged by an offset cursor. Rows that became mine after the snapshot are
   * dropped here, so the list never offers a group I already joined.
   */
  async discover(
    user: RequestUser,
    cursor?: string,
    limit = 15,
  ): Promise<GroupDiscoverPageDto> {
    const ranked = await this.reco.communities(user.sub, 'group');
    const start = decodeOffset(cursor);
    const slice = ranked.slice(start, start + limit);
    const next =
      start + limit < ranked.length ? encodeOffset(start + limit) : null;
    if (slice.length === 0) return { items: [], nextCursor: next };
    const rows = await this.prisma.chatGroup.findMany({
      where: {
        id: { in: slice.map((r) => r.id) },
        group_type: 'public',
        deleted_at: null,
      },
    });
    const byId = new Map(rows.map((g) => [g.id, g]));
    const ordered = slice.flatMap((r) => {
      const g = byId.get(r.id);
      return g ? [{ g, mutual: r.mutual }] : [];
    });
    const dtos = await this.previews(
      ordered.map((o) => o.g),
      user.sub,
    );
    const items = dtos
      .map((d, i) => ({ ...d, mutualCount: ordered[i].mutual }))
      .filter((d) => !d.alreadyMember && !d.requestPending);
    return { items, nextCursor: next };
  }

  private async previews(
    rows: ChatGroup[],
    userId: string,
    code?: string,
  ): Promise<GroupInvitePreviewDto[]> {
    const ids = rows.map((g) => g.id);
    const [mine, asked, avatars] = await Promise.all([
      this.prisma.chatGroupMember.findMany({
        where: { group_id: { in: ids }, user_id: userId, left_at: null },
        select: { group_id: true },
      }),
      this.prisma.chatGroupJoinRequest.findMany({
        where: { group_id: { in: ids }, user_id: userId },
        select: { group_id: true },
      }),
      this.files.avatarUrlsMany(rows.map((g) => g.avatar_file_id)),
    ]);
    const inSet = new Set(mine.map((m) => m.group_id));
    const askedSet = new Set(asked.map((m) => m.group_id));
    return rows.map((g) => ({
      id: g.id,
      code:
        g.group_type === 'public' && g.username
          ? g.username
          : (code ?? g.invite_code),
      type: g.group_type,
      username: g.username,
      requiresApproval: g.group_type === 'closed' && g.join_approval,
      requestPending: askedSet.has(g.id),
      title: g.title,
      description: g.description,
      avatarUrl: g.avatar_file_id
        ? (avatars.get(g.avatar_file_id)?.url256 ?? null)
        : null,
      memberCount: g.member_count,
      alreadyMember: inSet.has(g.id),
    }));
  }

  async join(user: RequestUser, code: string): Promise<GroupJoinResultDto> {
    const g = await this.byCode(code);
    const existing = await this.prisma.chatGroupMember.findUnique({
      where: { group_id_user_id: { group_id: g.id, user_id: user.sub } },
    });
    if (existing && existing.left_at === null) {
      return {
        status: 'joined',
        groupId: g.id,
        group: await this.detail(user.sub, g.id),
      };
    }
    if (existing?.left_reason === 'removed') {
      throw forbidden('You were removed from this group.');
    }
    if (g.group_type === 'closed' && g.join_approval) {
      await this.prisma.chatGroupJoinRequest.upsert({
        where: { group_id_user_id: { group_id: g.id, user_id: user.sub } },
        create: { group_id: g.id, user_id: user.sub },
        update: {},
      });
      await this.adminsChanged(g.id, 'requests');
      return { status: 'pending', groupId: g.id, group: null };
    }
    const row = await this.admit(g.id, user.sub, null, 'joined');
    await this.broadcast(g.id, row);
    await this.groupChanged(g.id, 'members');
    return {
      status: 'joined',
      groupId: g.id,
      group: await this.detail(user.sub, g.id),
    };
  }

  /** Admins: the people waiting to be let in. */
  async requests(
    user: RequestUser,
    id: string,
  ): Promise<GroupJoinRequestDto[]> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('invite')) throw forbidden();
    const rows = await this.prisma.chatGroupJoinRequest.findMany({
      where: { group_id: id },
      orderBy: { created_at: 'asc' },
      take: 200,
    });
    const people = await this.presenter.people(rows.map((r) => r.user_id));
    return rows.flatMap((r) => {
      const p = people.get(r.user_id);
      return p ? [{ user: p, createdAt: r.created_at }] : [];
    });
  }

  async decideRequest(
    user: RequestUser,
    id: string,
    userId: string,
    approve: boolean,
  ): Promise<GroupJoinRequestDto[]> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('invite')) throw forbidden();
    const req = await this.prisma.chatGroupJoinRequest.findUnique({
      where: { group_id_user_id: { group_id: id, user_id: userId } },
    });
    if (!req) throw notFound();
    if (approve) {
      const row = await this.admit(id, userId, user.sub, 'added');
      await this.broadcast(id, row);
      await this.notifyAdded(id, row, [userId]);
      await this.groupChanged(id, 'members');
    } else {
      await this.prisma.chatGroupJoinRequest.delete({
        where: { group_id_user_id: { group_id: id, user_id: userId } },
      });
      this.realtime.toUsers([userId], 'group:update', {
        groupId: id,
        kind: 'declined',
      });
      await this.adminsChanged(id, 'requests');
    }
    return this.requests(user, id);
  }

  /** Put [userId] in (joined by link, or added by [actorId]); returns the
   * system line. The caller broadcasts. */
  private async admit(
    groupId: string,
    userId: string,
    actorId: string | null,
    kind: 'joined' | 'added',
  ): Promise<ChatGroupMessage> {
    return withTxRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM chat_groups WHERE id = ${groupId}::UUID FOR UPDATE`;
      const count = await tx.chatGroupMember.count({
        where: { group_id: groupId, left_at: null },
      });
      const max = await this.maxMembers();
      if (count >= max) {
        throw new ConflictException({
          code: ErrorCode.GROUP_FULL,
          message: 'The group is full.',
          details: { max },
        });
      }
      const existing = await tx.chatGroupMember.findUnique({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        select: { user_id: true },
      });
      if (existing) {
        await tx.chatGroupMember.update({
          where: { group_id_user_id: { group_id: groupId, user_id: userId } },
          data: {
            left_at: null,
            left_reason: null,
            role: 'member',
            joined_at: new Date(),
            added_by: actorId,
            hidden_at: null,
          },
        });
      } else {
        await tx.chatGroupMember.create({
          data: {
            group_id: groupId,
            user_id: userId,
            role: 'member',
            added_by: actorId,
          },
        });
      }
      await tx.chatGroupJoinRequest.deleteMany({
        where: { group_id: groupId, user_id: userId },
      });
      await tx.chatGroup.update({
        where: { id: groupId },
        data: { member_count: count + 1 },
      });
      const sys =
        kind === 'joined' || !actorId
          ? await this.system(tx, groupId, 'joined', userId, [])
          : await this.system(tx, groupId, 'added', actorId, [userId]);
      await tx.chatGroup.update({
        where: { id: groupId },
        data: { last_message_id: sys.id, last_message_at: sys.created_at },
      });
      return sys;
    });
  }

  private async byCode(code: string): Promise<ChatGroup> {
    const g = await this.prisma.chatGroup.findFirst({
      where: {
        deleted_at: null,
        OR: [
          { invite_code: code },
          { username_lower: code.toLowerCase(), group_type: 'public' },
        ],
      },
    });
    if (!g) throw notFound();
    // A private group has no link; a closed one only while the link is on.
    if (
      g.invite_code === code &&
      (g.group_type === 'private' || !g.invite_enabled)
    ) {
      throw notFound();
    }
    return g;
  }

  /** `group:update` to the admins only (new join request, …). */
  private async adminsChanged(groupId: string, kind: string): Promise<void> {
    const rows = await this.prisma.chatGroupMember.findMany({
      where: {
        group_id: groupId,
        left_at: null,
        role: { in: ['owner', 'admin'] },
      },
      select: { user_id: true },
    });
    this.realtime.toUsers(
      rows.map((r) => r.user_id),
      'group:update',
      { groupId, kind },
    );
  }

  /** 409 GROUP_USERNAME_TAKEN for the unique-@username violation. */
  private usernameTaken(error: unknown): ConflictException | null {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      JSON.stringify(error.meta ?? {}).includes('username_lower')
    ) {
      return new ConflictException({
        code: ErrorCode.GROUP_USERNAME_TAKEN,
        message: 'This @username is taken.',
      });
    }
    return null;
  }

  // --------------------------------------------------------------- messages

  async send(
    user: RequestUser,
    id: string,
    dto: SendGroupMessageDto,
    opts: { forwardedFromName?: string | null; push?: boolean } = {},
  ): Promise<GroupMessageDto> {
    const m = await this.requireMember(user.sub, id);
    if (!(m.admin || m.group.who_can_post === 'all')) {
      throw forbidden('Only admins can write in this group.');
    }
    const body = (dto.body ?? '').trim();
    const attachment = dto.type === 'attachment';
    if (attachment && !(m.admin || m.group.who_can_media === 'all')) {
      throw forbidden('Media is not allowed in this group.');
    }
    if (attachment ? !dto.fileId || !dto.fileName : body.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: attachment
          ? 'An attachment needs fileId and fileName.'
          : 'The message is empty.',
        details: { field: attachment ? 'fileId' : 'body' },
      });
    }
    const dup = await this.findOwn(id, user.sub, dto.clientMessageId);
    if (dup) return this.one(dup, user.sub);
    const topic = await this.writableTopic(m, dto.topicId);
    if (attachment) {
      await this.files.assertAttachable(user.sub, dto.fileId!, [
        'chat_attachment',
      ]);
      const used =
        (await this.prisma.chatGroupMessage.findFirst({
          where: { file_id: dto.fileId, deleted_at: {} },
          select: { id: true },
        })) ??
        (await this.prisma.message.findFirst({
          where: { file_id: dto.fileId },
          select: { id: true },
        }));
      if (used) {
        throw new ConflictException({
          code: ErrorCode.FILE_NOT_ATTACHABLE,
          message: 'This file was already sent.',
        });
      }
    }
    if (dto.replyToId) {
      const reply = await this.prisma.chatGroupMessage.findFirst({
        where: { id: dto.replyToId, group_id: id },
        select: { id: true },
      });
      if (!reply) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'The quoted message was not found.',
        });
      }
    }
    // Only live members can be @mentioned.
    const mentions = dto.mentionIds?.length
      ? (
          await this.prisma.chatGroupMember.findMany({
            where: {
              group_id: id,
              left_at: null,
              user_id: { in: dto.mentionIds },
            },
            select: { user_id: true },
          })
        ).map((r) => r.user_id)
      : [];
    let row: ChatGroupMessage;
    try {
      row = await withTxRetry(this.prisma, async (tx) => {
        const created = await tx.chatGroupMessage.create({
          data: {
            group_id: id,
            sender_id: user.sub,
            type: attachment ? 'attachment' : 'text',
            body,
            client_message_id: dto.clientMessageId,
            topic_id: topic && !topic.is_general ? topic.id : null,
            reply_to_id: dto.replyToId ?? null,
            mention_ids: mentions,
            // Owner 2026-10-21: disappearing messages.
            expires_at: expiresAtFor(m.group.disappear_after_s),
            file_id: attachment ? dto.fileId : null,
            file_name: attachment ? dto.fileName : null,
            // Owner 2026-10-21 (Telegram): «Forwarded from <name>».
            ...(opts.forwardedFromName !== undefined
              ? {
                  forwarded: true,
                  forwarded_from_name: opts.forwardedFromName,
                }
              : {}),
          },
        });
        await tx.chatGroup.update({
          where: { id },
          data: {
            last_message_id: created.id,
            last_message_at: created.created_at,
          },
        });
        if (topic) await this.bumpTopic(tx, topic.id, created);
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.findOwn(id, user.sub, dto.clientMessageId);
        if (again) return this.one(again, user.sub);
      }
      throw error;
    }
    await this.fanOut(id, row, { push: opts.push });
    return this.one(row, user.sub);
  }

  /**
   * Owner 2026-10-21 (Telegram «Переслать»): a message of a group I am in
   * as forward content — 404 when I cannot read it, 403 CONTENT_PROTECTED
   * when the group restricts saving content, FORWARD_NOT_ALLOWED for a
   * disappearing one. Polls and service lines are not forwarded.
   */
  async forwardSource(
    user: RequestUser,
    messageId: string,
  ): Promise<ForwardContent> {
    // Only the id is known here (the forward picker), so this probes the
    // primary key of every hash partition: one call per forward.
    const row = await this.prisma.chatGroupMessage.findFirst({
      where: { id: messageId },
    });
    if (!row || row.deleted_at) throw notFound();
    const m = await this.requireMember(user.sub, row.group_id);
    if (m.group.protect_content) throw contentProtected();
    if (row.type !== 'text' && row.type !== 'attachment') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This message cannot be forwarded.',
        details: { field: 'sources' },
      });
    }
    if (row.expires_at) throw forwardNotAllowed();
    const author = row.sender_id
      ? await this.prisma.user.findUnique({
          where: { id: row.sender_id },
          select: { first_name: true, last_name: true },
        })
      : null;
    const fromName =
      row.forwarded_from_name ??
      forwardName(author?.first_name, author?.last_name);
    if (row.type === 'text') return { kind: 'text', text: row.body, fromName };
    if (!row.file_id) throw notFound();
    const file = await this.prisma.file.findUnique({
      where: { id: row.file_id },
      select: { mime: true },
    });
    return {
      kind: 'attachment',
      text: row.body,
      fileId: row.file_id,
      fileName: row.file_name ?? 'file',
      mime: file?.mime,
      fromName,
    };
  }

  /**
   * Owner 2026-10-21 (Telegram): «Share» of a protected group sends its
   * link instead of its content — a public group's @username or the
   * invite link; 403 CONTENT_PROTECTED when it has no link to give.
   */
  async linkSource(
    user: RequestUser,
    groupId: string,
  ): Promise<ForwardContent> {
    const { group: g } = await this.requireMember(user.sub, groupId);
    const handle =
      g.group_type === 'public' && g.username
        ? g.username
        : g.group_type !== 'private' && g.invite_enabled
          ? g.invite_code
          : null;
    if (!handle) throw contentProtected();
    return {
      kind: 'text',
      text: `${g.title}\n${this.presenter.inviteLink(handle)}`,
      fromName: null,
      own: true,
    };
  }

  /**
   * Owner 2026-10-21: [content] forwarded into group [id] through [send]
   * (membership, «who can post / send media», topics, sockets, pushes).
   * Groups hold texts and files: a voice note, a sticker, a contact card
   * or a gift is UNSUPPORTED_IN_TARGET. A retry copies nothing again.
   */
  async sendForwarded(
    user: RequestUser,
    id: string,
    clientMessageId: string,
    content: ForwardContent,
    opts: { topicId?: string; silent?: boolean } = {},
  ): Promise<GroupMessageDto> {
    const photos = content.kind === 'post' ? (content.photoFileIds ?? []) : [];
    const parts: ForwardContent[] =
      photos.length > 0
        ? photos.map((fileId, i) => ({
            kind: 'attachment',
            text:
              i === 0
                ? [content.text, content.postLink].filter(Boolean).join('\n')
                : '',
            fileId,
            fromName: content.fromName,
          }))
        : [content];
    if (
      parts.some(
        (p) => !['text', 'place', 'post', 'attachment'].includes(p.kind),
      )
    ) {
      throw unsupportedInTarget();
    }
    const m = await this.requireMember(user.sub, id);
    if (!(m.admin || m.group.who_can_post === 'all')) {
      throw forbidden('Only admins can write in this group.');
    }
    if (
      parts.some((p) => p.kind === 'attachment') &&
      !(m.admin || m.group.who_can_media === 'all')
    ) {
      throw forbidden('Media is not allowed in this group.');
    }
    let first: GroupMessageDto | null = null;
    for (const [i, part] of parts.entries()) {
      const cmid = forwardPartId(clientMessageId, i);
      const dup = await this.findOwn(id, user.sub, cmid);
      let sent: GroupMessageDto;
      if (dup) {
        sent = await this.one(dup, user.sub);
      } else {
        const file =
          part.kind === 'attachment'
            ? await this.files.copyForUser(
                part.fileId!,
                user.sub,
                'chat_attachment',
              )
            : null;
        sent = await this.send(
          user,
          id,
          {
            clientMessageId: cmid,
            type: file ? 'attachment' : 'text',
            body: file
              ? part.text
              : [part.text, part.postLink].filter(Boolean).join('\n'),
            topicId: opts.topicId,
            ...(file
              ? {
                  fileId: file.id,
                  fileName:
                    part.fileName ??
                    `photo.${(file.mime.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')}`,
                }
              : {}),
          },
          {
            forwardedFromName: content.own ? undefined : part.fromName,
            push: !(opts.silent || i < parts.length - 1),
          },
        );
      }
      first ??= sent;
    }
    return first!;
  }

  async edit(
    user: RequestUser,
    id: string,
    messageId: string,
    body: string,
  ): Promise<GroupMessageDto> {
    await this.requireMember(user.sub, id);
    const row = await this.prisma.chatGroupMessage.findFirst({
      where: { id: messageId, group_id: id },
    });
    if (!row || row.deleted_at) throw notFound();
    if (row.sender_id !== user.sub || row.type !== 'text') {
      throw forbidden('You can only edit your own text messages.');
    }
    const text = body.trim();
    if (!text) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The message is empty.',
        details: { field: 'body' },
      });
    }
    const updated = await this.prisma.chatGroupMessage.update({
      where: { id_group_id: { id: messageId, group_id: id } },
      data: { body: text, edited_at: new Date() },
    });
    await this.broadcast(id, updated);
    return this.one(updated, user.sub);
  }

  /** Delete for everyone: the author, or an admin. */
  async remove(
    user: RequestUser,
    id: string,
    messageId: string,
  ): Promise<void> {
    const m = await this.requireMember(user.sub, id);
    const row = await this.prisma.chatGroupMessage.findFirst({
      where: { id: messageId, group_id: id },
    });
    if (!row || row.deleted_at || row.type === 'system') throw notFound();
    if (row.sender_id !== user.sub && !m.can('delete')) throw forbidden();
    const updated = await this.prisma.chatGroupMessage.update({
      where: { id_group_id: { id: messageId, group_id: id } },
      data: { deleted_at: new Date(), body: '', mention_ids: [] },
    });
    if (m.group.pinned_message_id === messageId) {
      await this.prisma.chatGroup.update({
        where: { id },
        data: { pinned_message_id: null },
      });
    }
    await this.broadcast(id, updated);
    await this.groupChanged(id, 'pinned');
  }

  async pin(
    user: RequestUser,
    id: string,
    messageId: string | null,
  ): Promise<GroupDetailDto> {
    const m = await this.requireMember(user.sub, id);
    if (!(m.can('pin') || m.group.who_can_pin === 'all')) throw forbidden();
    let row: ChatGroupMessage | null = null;
    if (messageId) {
      const target = await this.prisma.chatGroupMessage.findFirst({
        where: { id: messageId, group_id: id, deleted_at: null },
      });
      if (!target || target.type === 'system') throw notFound();
      row = await withTxRetry(this.prisma, async (tx) => {
        await tx.chatGroup.update({
          where: { id },
          data: { pinned_message_id: messageId },
        });
        const sys = await this.system(
          tx,
          id,
          'pinned',
          user.sub,
          [],
          messageId,
        );
        await tx.chatGroup.update({
          where: { id },
          data: { last_message_id: sys.id, last_message_at: sys.created_at },
        });
        return sys;
      });
    } else {
      await this.prisma.chatGroup.update({
        where: { id },
        data: { pinned_message_id: null },
      });
    }
    if (row) await this.broadcast(id, row);
    await this.groupChanged(id, 'pinned');
    return this.detail(user.sub, id);
  }

  async read(
    user: RequestUser,
    id: string,
    lastReadMessageId: string,
  ): Promise<{ lastReadMessageId: string | null }> {
    const m = await this.requireMember(user.sub, id);
    const target = await this.prisma.chatGroupMessage.findFirst({
      where: { id: lastReadMessageId, group_id: id },
      select: { id: true, created_at: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    const topicRead = m.group.topics_enabled
      ? await this.prisma.chatGroupTopicRead.findUnique({
          where: {
            topic_id_user_id: {
              topic_id: await this.topicIdOfMessage(m.group, target.id),
              user_id: user.sub,
            },
          },
        })
      : null;
    const pointer = m.group.topics_enabled
      ? (topicRead?.last_read_message_id ?? m.me.last_read_message_id)
      : m.me.last_read_message_id;
    const current = pointer
      ? await this.prisma.chatGroupMessage.findUnique({
          where: {
            id_group_id: { id: pointer, group_id: id },
            deleted_at: {},
          },
          select: { id: true, created_at: true },
        })
      : null;
    if (
      current &&
      (current.created_at > target.created_at ||
        (current.created_at.getTime() === target.created_at.getTime() &&
          current.id >= target.id))
    ) {
      return { lastReadMessageId: current.id };
    }
    if (m.group.topics_enabled) {
      const topicId = await this.topicIdOfMessage(m.group, target.id);
      await this.prisma.chatGroupTopicRead.upsert({
        where: { topic_id_user_id: { topic_id: topicId, user_id: user.sub } },
        create: {
          topic_id: topicId,
          user_id: user.sub,
          last_read_message_id: target.id,
        },
        update: { last_read_message_id: target.id },
      });
    } else {
      await this.prisma.chatGroupMember.update({
        where: { group_id_user_id: { group_id: id, user_id: user.sub } },
        data: { last_read_message_id: target.id },
      });
    }
    await this.badges.chatsChanged(user.sub);
    return { lastReadMessageId: target.id };
  }

  async updateMe(
    user: RequestUser,
    id: string,
    dto: UpdateGroupMeDto,
  ): Promise<GroupDto> {
    await this.requireMember(user.sub, id);
    const data: Prisma.ChatGroupMemberUpdateInput = {};
    if (dto.mutedUntil !== undefined) {
      data.muted_until =
        dto.mutedUntil === null ? null : new Date(dto.mutedUntil);
    }
    if (dto.callsMuted !== undefined) data.calls_muted = dto.callsMuted;
    if (dto.pinned !== undefined)
      data.pinned_at = dto.pinned ? new Date() : null;
    if (dto.hidden !== undefined)
      data.hidden_at = dto.hidden ? new Date() : null;
    if (dto.archived !== undefined)
      data.archived_at = dto.archived ? new Date() : null;
    await this.prisma.chatGroupMember.update({
      where: { group_id_user_id: { group_id: id, user_id: user.sub } },
      data,
    });
    // The write is done: a failing badge refresh must not fail the request.
    if (dto.hidden !== undefined || dto.archived !== undefined)
      await this.badges.chatsChanged(user.sub).catch(() => undefined);
    const { group, me } = await this.requireMember(user.sub, id);
    return (await this.presenter.groups([{ group, me }], user.sub))[0];
  }

  // ----------------------------------------------------------------- topics

  /** Owner 2026-10-22 (package B): with `updatedSince` only the topics
   * changed since, as a delta answer (meta.syncedAt). */
  async topics(
    user: RequestUser,
    id: string,
    updatedSinceRaw?: string,
  ): Promise<GroupTopicDto[] | SyncPage<GroupTopicDto>> {
    const since = parseUpdatedSince(updatedSinceRaw);
    const m = await this.requireMember(user.sub, id);
    if (!m.group.topics_enabled) {
      return since
        ? {
            items: [],
            nextCursor: null,
            deletedIds: [],
            syncedAt: since.toISOString(),
          }
        : [];
    }
    const rows = await this.prisma.chatGroupTopic.findMany({
      where: { group_id: id, ...(since ? { updated_at: { gte: since } } : {}) },
    });
    const items = await this.presenter.topics(rows, user.sub);
    if (!since) return items;
    return {
      items,
      nextCursor: null,
      deletedIds: [],
      syncedAt: syncedAt(
        rows.map((t) => t.updated_at),
        since,
      ),
    };
  }

  async createTopic(
    user: RequestUser,
    id: string,
    dto: CreateTopicDto,
  ): Promise<GroupTopicDto> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('info')) throw forbidden();
    this.requireTopicsOn(m.group);
    const count = await this.prisma.chatGroupTopic.count({
      where: { group_id: id },
    });
    if (count >= TOPICS_MAX) {
      throw new ConflictException({
        code: ErrorCode.GROUP_FULL,
        message: 'Too many topics.',
        details: { max: TOPICS_MAX },
      });
    }
    const title = dto.title.trim();
    const { topic, row } = await withTxRetry(this.prisma, async (tx) => {
      const t = await tx.chatGroupTopic.create({
        data: {
          group_id: id,
          title,
          icon_emoji: dto.iconEmoji?.trim() || null,
          color: dto.color ?? count % TOPIC_COLORS,
          created_by: user.sub,
        },
      });
      const sys = await this.system(
        tx,
        id,
        'topic_created',
        user.sub,
        [],
        title,
      );
      await tx.chatGroup.update({
        where: { id },
        data: { last_message_id: sys.id, last_message_at: sys.created_at },
      });
      return { topic: t, row: sys };
    });
    await this.broadcast(id, row);
    await this.groupChanged(id, 'topics');
    return (await this.presenter.topics([topic], user.sub))[0];
  }

  async updateTopic(
    user: RequestUser,
    id: string,
    topicId: string,
    dto: UpdateTopicDto,
  ): Promise<GroupTopicDto[]> {
    const m = await this.requireMember(user.sub, id);
    if (!m.can('info')) throw forbidden();
    this.requireTopicsOn(m.group);
    const topic = await this.topicOf(id, topicId);
    const data: Prisma.ChatGroupTopicUpdateInput = {};
    if (topic.is_general) {
      // «General» can only be pinned; it keeps its name and stays open.
      if (dto.pinned !== undefined)
        data.pinned_at = dto.pinned ? new Date() : null;
    } else {
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.iconEmoji !== undefined) {
        data.icon_emoji = dto.iconEmoji?.trim() || null;
      }
      if (dto.color !== undefined) data.color = dto.color;
      if (dto.closed !== undefined) {
        data.closed_at = dto.closed ? new Date() : null;
      }
      if (dto.pinned !== undefined)
        data.pinned_at = dto.pinned ? new Date() : null;
    }
    await this.prisma.chatGroupTopic.update({ where: { id: topicId }, data });
    await this.groupChanged(id, 'topics');
    return (await this.topics(user, id)) as GroupTopicDto[];
  }

  private requireTopicsOn(group: ChatGroup): void {
    if (!group.topics_enabled) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Topics are off in this group.',
        details: { field: 'topicsEnabled' },
      });
    }
  }

  private async topicOf(
    groupId: string,
    topicId: string,
  ): Promise<ChatGroupTopic> {
    const t = await this.prisma.chatGroupTopic.findFirst({
      where: { id: topicId, group_id: groupId },
    });
    if (!t) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Topic not found.',
      });
    }
    return t;
  }

  /** The topic a new message goes to (null when the group has no topics);
   * a closed topic takes messages from admins only. */
  async writableTopic(
    m: Membership,
    topicId?: string,
  ): Promise<ChatGroupTopic | null> {
    if (!m.group.topics_enabled) {
      if (topicId) this.requireTopicsOn(m.group);
      return null;
    }
    const topic = await this.topicOf(
      m.group.id,
      topicId ?? m.group.general_topic_id!,
    );
    if (topic.closed_at && !m.admin) {
      throw forbidden('This topic is closed.');
    }
    return topic;
  }

  /** The topic row a message belongs to (General for the older chat). */
  private async topicIdOfMessage(
    group: ChatGroup,
    messageId: string,
  ): Promise<string> {
    const row = await this.prisma.chatGroupMessage.findUniqueOrThrow({
      where: {
        id_group_id: { id: messageId, group_id: group.id },
        deleted_at: {},
      },
      select: { topic_id: true },
    });
    return row.topic_id ?? group.general_topic_id!;
  }

  async bumpTopic(
    tx: Prisma.TransactionClient,
    topicId: string,
    msg: ChatGroupMessage,
  ): Promise<void> {
    await tx.chatGroupTopic.update({
      where: { id: topicId },
      data: { last_message_id: msg.id, last_message_at: msg.created_at },
    });
  }

  /** Forum mode on (creates «General») or off (marks the chat read). */
  private async switchTopics(
    tx: Prisma.TransactionClient,
    group: ChatGroup,
    on: boolean,
  ): Promise<void> {
    if (on) {
      const general =
        (await tx.chatGroupTopic.findFirst({
          where: { group_id: group.id, is_general: true },
        })) ??
        (await tx.chatGroupTopic.create({
          data: {
            group_id: group.id,
            title: 'General',
            is_general: true,
            color: 0,
            last_message_id: group.last_message_id,
            last_message_at: group.last_message_at,
          },
        }));
      await tx.chatGroup.update({
        where: { id: group.id },
        data: { topics_enabled: true, general_topic_id: general.id },
      });
    } else {
      await tx.chatGroup.update({
        where: { id: group.id },
        data: { topics_enabled: false },
      });
      // One stream again: nothing is "unread in some topic" any more.
      await tx.chatGroupMember.updateMany({
        where: { group_id: group.id, left_at: null },
        data: { last_read_message_id: group.last_message_id },
      });
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Live users [by] may add: active, not blocked, not self, privacy ok. */
  private async addableIds(by: string, ids: string[]): Promise<string[]> {
    const wanted = [...new Set(ids)].filter((u) => u !== by);
    if (wanted.length === 0) return [];
    const [users, hidden] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: wanted }, status: 'active' },
        select: { id: true },
      }),
      this.blocks.hiddenIds(by),
    ]);
    const out: string[] = [];
    for (const u of users) {
      if (hidden.has(u.id)) continue;
      // Their "who can add me to groups" setting (a «no» stays out; the
      // caller reports them as not added).
      if (await this.addPolicy.allows(by, u.id)) out.push(u.id);
    }
    return out;
  }

  private async system(
    tx: Prisma.TransactionClient,
    groupId: string,
    kind: string,
    actorId: string | null,
    targetIds: string[],
    text?: string,
  ): Promise<ChatGroupMessage> {
    return tx.chatGroupMessage.create({
      data: {
        group_id: groupId,
        sender_id: null,
        type: 'system',
        body: '',
        client_message_id: `sys-${randomBytes(8).toString('hex')}`,
        system_kind: kind,
        system_payload: {
          ...(actorId ? { actorId } : {}),
          targetIds,
          ...(text !== undefined ? { text } : {}),
        },
      },
    });
  }

  /** Mark [userId] as gone and write the system line; returns that line. */
  private async endMembership(
    groupId: string,
    userId: string,
    reason: 'left' | 'removed',
    actorId: string | null,
  ): Promise<ChatGroupMessage> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      await tx.chatGroupMember.update({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        data: { left_at: new Date(), left_reason: reason },
      });
      const count = await tx.chatGroupMember.count({
        where: { group_id: groupId, left_at: null },
      });
      await tx.chatGroup.update({
        where: { id: groupId },
        data: { member_count: count },
      });
      const sys = await this.system(
        tx,
        groupId,
        // No actor = removed by the platform's moderators.
        reason === 'removed' && !actorId ? 'removed_admin' : reason,
        actorId,
        reason === 'removed' ? [userId] : [],
      );
      await tx.chatGroup.update({
        where: { id: groupId },
        data: { last_message_id: sys.id, last_message_at: sys.created_at },
      });
      return sys;
    });
    this.realtime.toUsers([userId], 'group:member_removed', {
      groupId,
      userId,
      reason,
    });
    this.membershipEnded$.next({ groupId, userId, reason });
    await this.badges.chatsChanged(userId);
    return row;
  }

  private findOwn(groupId: string, senderId: string, clientMessageId: string) {
    return this.prisma.chatGroupMessage.findUnique({
      where: {
        deleted_at: {},
        group_id_sender_id_client_message_id: {
          group_id: groupId,
          sender_id: senderId,
          client_message_id: clientMessageId,
        },
      },
    });
  }

  private async one(
    row: ChatGroupMessage,
    viewerId: string,
  ): Promise<GroupMessageDto> {
    return (await this.presenter.messages([row], viewerId))[0];
  }

  /**
   * Realtime `group:message` to every live member (personalised flags).
   * Owner 2026-10-22 (server load audit, finding 7): queued on the group's
   * fan-out partition (GroupFanoutQueue) — members get a group's events in
   * the order they happened, and the request does not wait for them.
   */
  async broadcast(groupId: string, row: ChatGroupMessage): Promise<void> {
    await this.fanoutQueue.enqueue(
      { kind: 'broadcast', groupId, messageId: row.id },
      // Every change is its own event (each edit of one message too).
      `b-${row.id}-${Date.now()}-${randomBytes(4).toString('hex')}`,
      () => this.deliverBroadcast(groupId, row),
    );
  }

  /** A new user-written message: unhide, broadcast, badge and push
   * ([push] false: no push — the earlier messages of a forwarded batch).
   * Owner 2026-10-22 (finding 7): one job per message (job id = the
   * message), delivered by [deliverFanOut]. */
  async fanOut(
    groupId: string,
    row: ChatGroupMessage,
    opts: { push?: boolean } = {},
  ): Promise<void> {
    const push = opts.push !== false;
    await this.fanoutQueue.enqueue(
      { kind: 'message', groupId, messageId: row.id, push },
      `fo-${row.id}`,
      () => this.deliverMessage(groupId, row, push),
    );
  }

  /** The worker side of [broadcast] / [fanOut] (GroupFanoutWorker): the
   * message as it is now (an edit or deletion since is included). */
  async deliverFanOut(job: GroupFanoutJob): Promise<void> {
    const row = await this.prisma.chatGroupMessage.findFirst({
      where: { id: job.messageId, group_id: job.groupId, deleted_at: {} },
    });
    if (!row) return;
    if (job.kind === 'broadcast')
      return this.deliverBroadcast(job.groupId, row);
    return this.deliverMessage(job.groupId, row, job.push !== false);
  }

  /** One publish per audience (at most four), not one per member. */
  private async deliverBroadcast(
    groupId: string,
    row: ChatGroupMessage,
    memberIds?: string[],
  ): Promise<void> {
    if (row.type === 'system') {
      const g = await this.prisma.chatGroup.findUnique({
        where: { id: groupId },
        select: { show_service_messages: true },
      });
      if (g && !g.show_service_messages) return;
    }
    const [ids, [dto]] = await Promise.all([
      memberIds ?? this.activeMemberIds(groupId),
      this.presenter.messages([row], NOBODY),
    ]);
    if (!dto) return;
    for (const a of broadcastAudiences(
      ids,
      row.sender_id,
      row.mention_ids,
      !!dto.deleted,
    )) {
      // Owner 2026-10-22 (package B): groupId / lastMessageAt beside the
      // message, so the list row (last message, order, +1 unread when not
      // mine) is fixed without a GET.
      this.realtime.toUsers(a.userIds, 'group:message', {
        groupId,
        lastMessageAt: row.created_at,
        message: { ...dto, mine: a.mine, mentionsMe: a.mentionsMe },
      });
    }
  }

  /** Unhide the chat, the event, then badges (batched) and the pushes
   * (queued 500 members per job). */
  private async deliverMessage(
    groupId: string,
    row: ChatGroupMessage,
    push: boolean,
  ): Promise<void> {
    await this.prisma.chatGroupMember.updateMany({
      where: { group_id: groupId, hidden_at: { not: null }, left_at: null },
      data: { hidden_at: null },
    });
    const members = await this.activeMemberIds(groupId);
    await this.deliverBroadcast(groupId, row, members);
    // Deleted before the job ran: nothing to count or ring.
    if (row.deleted_at) return;
    const ids = members.filter((u) => u !== row.sender_id);
    await this.badges.messagesArrived(ids, row.id);
    if (push) {
      await this.notifications.queueGroupMessagePushes({
        groupId,
        messageId: row.id,
        recipientIds: ids,
      });
    }
  }

  /** «You were added» — a push for the people just added. */
  private async notifyAdded(
    groupId: string,
    row: ChatGroupMessage,
    targetIds: string[],
  ): Promise<void> {
    await Promise.all(
      targetIds.map(async (uid) => {
        this.realtime.toUsers([uid], 'group:update', {
          groupId,
          kind: 'added',
        });
        await this.badges.messageArrived(uid);
        await this.notifications.emit({
          type: 'new_message',
          recipientId: uid,
          payload: { groupId, conversationId: groupId, messageId: row.id },
        });
      }),
    );
  }

  /** `group:update` to the live members. Owner 2026-10-22 (package B):
   * for a change of the card itself (info, members, topics, pinned) the
   * event carries the shared card, so the app edits the row without a
   * GET; the personal fields keep their local values. */
  async groupChanged(groupId: string, kind: string): Promise<void> {
    const card = CARD_KINDS.has(kind) ? await this.card(groupId) : null;
    this.realtime.toUsers(await this.activeMemberIds(groupId), 'group:update', {
      groupId,
      kind,
      ...(card ? { card } : {}),
    });
  }

  /** The shared part of a group card (GroupCardDto), one read. */
  async card(groupId: string): Promise<GroupCardDto | null> {
    const g = await this.prisma.chatGroup.findFirst({
      where: { id: groupId, deleted_at: null },
    });
    if (!g) return null;
    const avatars = await this.files.avatarUrlsMany(
      g.avatar_file_id ? [g.avatar_file_id] : [],
    );
    const a = g.avatar_file_id ? avatars.get(g.avatar_file_id) : undefined;
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      avatarUrl: a?.url256 ?? null,
      avatarFullUrl: a?.url ?? null,
      memberCount: g.member_count,
      type: g.group_type,
      username: g.username,
      joinApproval: g.join_approval,
      topicsEnabled: g.topics_enabled,
      generalTopicId: g.general_topic_id,
      whoCanPost: g.who_can_post,
      whoCanAdd: g.who_can_add,
      whoCanEditInfo: g.who_can_edit_info,
      whoCanCall: g.who_can_call,
      whoCanMedia: g.who_can_media,
      whoCanPoll: g.who_can_poll,
      whoCanPin: g.who_can_pin,
      showServiceMessages: g.show_service_messages,
      disappearAfterS: g.disappear_after_s,
      protectContent: g.protect_content,
      lastMessageAt: g.last_message_at,
      updatedAt: g.updated_at,
    };
  }
}

function newInviteCode(): string {
  return randomBytes(12).toString('base64url');
}
