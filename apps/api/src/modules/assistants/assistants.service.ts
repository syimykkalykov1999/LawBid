import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssistantMembership, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { OtpService } from '../auth/services/otp.service';
import { CaseCommentsService } from '../case-comments/case-comments.service';
import { CommentsService } from '../comments/comments.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreatePostDto } from '../posts/dto/posts.dto';
import { PostsService } from '../posts/posts.service';
import { AttorneyProfilesService } from '../profiles/services/attorney-profiles.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  DEFAULT_DUTIES,
  LIABILITY_DUTIES,
  LIABILITY_TERMS_VERSION,
} from './assistant-duties';
import type {
  ActivityDto,
  AddAssistantDto,
  AssistantMeDto,
  AssistantMemberDto,
  AssistantRequestDto,
  CreateAssistantRequestDto,
  TeamDto,
  UpdateAssistantDto,
} from './assistants.dto';

const PAGE = 30;

type MemberNames = {
  display_name: string | null;
  phone_e164: string;
  assistant_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

/**
 * Owner 2026-09-30 (OQ-048): attorney assistants.
 * - Seats come from the subscription (monthly: bought seats; yearly: 6).
 * - Joining: a phone the attorney added (at purchase or in Team) joins
 *   right away; otherwise the attorney's phone gets a code the attorney
 *   tells the assistant.
 * - An active assistant works inside the attorney's account
 *   (JwtAuthGuard), never bids, and publishes through approval requests.
 * - Every action lands in the activity log the assistant can't see.
 */
@Injectable()
export class AssistantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly context: AssistantContextService,
    private readonly access: SubscriptionAccessService,
    private readonly notifications: NotificationsService,
    private readonly posts: PostsService,
    private readonly comments: CommentsService,
    private readonly caseComments: CaseCommentsService,
    private readonly profiles: AttorneyProfilesService,
    private readonly files: FilesService,
  ) {}

  // --- the assistant themself ------------------------------------------

  /** GET /assistants/me (as the assistant): joined, invited or nothing. */
  async me(user: RequestUser): Promise<AssistantMeDto> {
    const assistantId = user.assistant?.userId ?? user.sub;
    const active = await this.prisma.assistantMembership.findFirst({
      where: { assistant_user_id: assistantId, status: 'active' },
    });
    if (active) return this.meOf('active', active);
    const invite = await this.inviteFor(assistantId);
    if (invite) return this.meOf('invited', invite);
    return {
      state: 'none',
      membershipId: null,
      attorneyId: null,
      attorneyName: null,
      attorneyUsername: null,
      attorneyAvatarUrl: null,
      duties: [],
    };
  }

  private async meOf(
    state: 'invited' | 'active',
    m: AssistantMembership,
  ): Promise<AssistantMeDto> {
    const a = await this.prisma.user.findUnique({
      where: { id: m.attorney_id },
      select: {
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
      },
    });
    const avatar = a?.avatar_file_id
      ? (await this.files.avatarUrls(a.avatar_file_id)).url256
      : null;
    return {
      state,
      membershipId: m.id,
      attorneyId: m.attorney_id,
      attorneyName:
        [a?.first_name, a?.last_name].filter(Boolean).join(' ') || null,
      attorneyUsername: a?.attorney_profile?.username ?? null,
      attorneyAvatarUrl: avatar,
      duties: m.duties,
    };
  }

  /** A pending invite for the assistant's verified phone. */
  private async inviteFor(assistantId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: assistantId },
      select: { phone_e164: true, phone_verified_at: true },
    });
    if (!u?.phone_e164 || !u.phone_verified_at) return null;
    return this.prisma.assistantMembership.findFirst({
      where: { phone_e164: u.phone_e164, status: 'invited' },
    });
  }

  /** POST /assistants/join — accept the invite of the verified phone. */
  async acceptInvite(user: RequestUser): Promise<AssistantMeDto> {
    await this.assertCanJoin(user.sub);
    const invite = await this.inviteFor(user.sub);
    if (!invite) {
      throw new NotFoundException({
        code: ErrorCode.ASSISTANT_INVITE_NOT_FOUND,
        message: 'No attorney has added this phone.',
      });
    }
    await this.activate(user.sub, invite.id, invite.attorney_id);
    return this.me(user);
  }

  /** POST /assistants/join/request-code — a code to the attorney's phone. */
  async requestCode(user: RequestUser, attorneyPhone: string): Promise<void> {
    await this.assertCanJoin(user.sub);
    const attorney = await this.attorneyByPhone(attorneyPhone);
    await this.assertFreeSeat(attorney.id);
    await this.otp.requestOtp('phone', attorneyPhone, 'assistant');
  }

  /** POST /assistants/join/verify — the code the attorney told them. */
  async verifyCode(
    user: RequestUser,
    attorneyPhone: string,
    code: string,
  ): Promise<AssistantMeDto> {
    await this.assertCanJoin(user.sub);
    const result = await this.otp.verifyOtp(
      'phone',
      attorneyPhone,
      code,
      'assistant',
    );
    if (result !== 'ok') {
      throw new BadRequestException({
        code:
          result === 'expired'
            ? ErrorCode.AUTH_OTP_EXPIRED
            : result === 'locked'
              ? ErrorCode.AUTH_OTP_LOCKED
              : ErrorCode.AUTH_OTP_INVALID,
        message: 'The code is not valid.',
      });
    }
    const attorney = await this.attorneyByPhone(attorneyPhone);
    await this.assertFreeSeat(attorney.id);
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { phone_e164: true },
    });
    if (!me?.phone_e164) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Sign in with your phone first.',
      });
    }
    // A stale invite for this phone (another attorney) gives way.
    await this.prisma.assistantMembership.updateMany({
      where: { phone_e164: me.phone_e164, status: 'invited' },
      data: { status: 'removed', removed_at: new Date() },
    });
    const m = await this.prisma.assistantMembership.create({
      data: {
        attorney_id: attorney.id,
        phone_e164: me.phone_e164,
        approval: 'attorney_otp',
        status: 'invited',
        duties: [...DEFAULT_DUTIES],
      },
    });
    await this.activate(user.sub, m.id, attorney.id);
    return this.me(user);
  }

  private async assertCanJoin(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (u?.role && u.role !== 'assistant') {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'This account is already a client or an attorney.',
      });
    }
    const live = await this.prisma.assistantMembership.findFirst({
      where: { assistant_user_id: userId, status: 'active' },
      select: { id: true },
    });
    if (live) {
      throw new ConflictException({
        code: ErrorCode.ASSISTANT_PHONE_TAKEN,
        message: 'You already work in an attorney team.',
      });
    }
  }

  private async attorneyByPhone(phone: string) {
    const a = await this.prisma.user.findFirst({
      where: {
        phone_e164: phone,
        role: 'attorney',
        deleted_at: null,
        status: 'active',
      },
      select: { id: true },
    });
    // Same answer for "no such attorney" and "no free seat": no probing.
    if (!a || !(await this.access.isActive(a.id))) {
      throw new NotFoundException({
        code: ErrorCode.ASSISTANT_NO_FREE_SEAT,
        message: 'This attorney has no free assistant seat.',
      });
    }
    return a;
  }

  private async seatsOf(attorneyId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { user_id: attorneyId },
      select: { plan: true, assistant_seats: true },
    });
    const used = await this.prisma.assistantMembership.count({
      where: { attorney_id: attorneyId, status: { not: 'removed' } },
    });
    const seats = sub ? (sub.plan === 'yearly' ? 6 : sub.assistant_seats) : 0;
    return { seats, used, plan: sub?.plan ?? null };
  }

  private async assertFreeSeat(attorneyId: string): Promise<void> {
    const { seats, used } = await this.seatsOf(attorneyId);
    if (used + 1 > seats) {
      throw new ConflictException({
        code: ErrorCode.ASSISTANT_NO_FREE_SEAT,
        message: 'No free assistant seat — add seats in Subscription.',
        details: { seats, used },
      });
    }
  }

  private async activate(
    assistantId: string,
    membershipId: string,
    attorneyId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: assistantId },
        data: { role: 'assistant' },
      }),
      this.prisma.assistantMembership.update({
        where: { id: membershipId },
        data: {
          assistant_user_id: assistantId,
          status: 'active',
          joined_at: new Date(),
        },
      }),
    ]);
    await this.context.invalidate(assistantId);
    await this.notifications.emit({
      type: 'assistant_joined',
      recipientId: attorneyId,
      payload: { membershipId },
    });
  }

  // --- the attorney's team ---------------------------------------------

  async team(user: RequestUser): Promise<TeamDto> {
    const rows = await this.prisma.assistantMembership.findMany({
      where: { attorney_id: user.sub, status: { not: 'removed' } },
      orderBy: { created_at: 'asc' },
      include: {
        assistant_user: { select: { first_name: true, last_name: true } },
        liability_acceptances: {
          where: { granted: true },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { created_at: true },
        },
      },
    });
    const s = await this.seatsOf(user.sub);
    return {
      members: rows.map((m) => ({
        ...memberDto(m),
        liabilityAcceptedAt:
          m.liability_acceptances[0]?.created_at.toISOString() ?? null,
      })),
      seats: s.seats,
      used: s.used,
      plan: s.plan ?? 'none',
    };
  }

  /** Added by the attorney: joins without a code. */
  async add(
    user: RequestUser,
    dto: AddAssistantDto,
    meta?: RequestMeta,
  ): Promise<TeamDto> {
    await this.assertFreeSeat(user.sub);
    const taken = await this.prisma.assistantMembership.findFirst({
      where: { phone_e164: dto.phone, status: { not: 'removed' } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ErrorCode.ASSISTANT_PHONE_TAKEN,
        message: 'This phone is already in a team.',
      });
    }
    const duties = dto.duties ?? [...DEFAULT_DUTIES];
    const granted = liabilityDiff([], duties).granted;
    assertLiability(granted, dto.acceptLiability);
    const m = await this.prisma.assistantMembership.create({
      data: {
        attorney_id: user.sub,
        phone_e164: dto.phone,
        display_name: dto.name ?? null,
        approval: 'attorney_added',
        status: 'invited',
        duties,
      },
    });
    await this.recordLiability(user, m.id, granted, [], meta);
    return this.team(user);
  }

  /**
   * OQ-049: an append-only record each time the attorney grants (with the
   * accepted warning) or withdraws "bids" / "publish" — the evidence that
   * the attorney took responsibility, kept even if the assistant leaves.
   */
  private async recordLiability(
    user: RequestUser,
    membershipId: string,
    granted: string[],
    revoked: string[],
    meta?: RequestMeta,
  ): Promise<void> {
    const rows = [
      ...(granted.length ? [{ duties: granted, granted: true }] : []),
      ...(revoked.length ? [{ duties: revoked, granted: false }] : []),
    ];
    for (const r of rows) {
      await this.prisma.assistantLiabilityAcceptance.create({
        data: {
          attorney_id: user.sub,
          membership_id: membershipId,
          duties: r.duties,
          granted: r.granted,
          terms_version: LIABILITY_TERMS_VERSION,
          ip: meta?.ip?.slice(0, 64) ?? null,
          user_agent: meta?.userAgent?.slice(0, 300) ?? null,
        },
      });
      await this.prisma.assistantActivity.create({
        data: {
          attorney_id: user.sub,
          membership_id: membershipId,
          action: r.granted ? 'liability.granted' : 'liability.revoked',
          summary: r.duties.join(', '),
        },
      });
    }
  }

  async update(
    user: RequestUser,
    id: string,
    dto: UpdateAssistantDto,
    meta?: RequestMeta,
  ): Promise<TeamDto> {
    const m = await this.own(user, id);
    const diff = dto.duties
      ? liabilityDiff(m.duties, dto.duties)
      : { granted: [], revoked: [] };
    assertLiability(diff.granted, dto.acceptLiability);
    await this.prisma.assistantMembership.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { display_name: dto.name || null } : {}),
        ...(dto.duties ? { duties: dto.duties } : {}),
      },
    });
    await this.recordLiability(user, id, diff.granted, diff.revoked, meta);
    await this.context.invalidate(m.assistant_user_id);
    return this.team(user);
  }

  /** Removed: their access ends at once (the cache is dropped). */
  async remove(user: RequestUser, id: string): Promise<TeamDto> {
    const m = await this.own(user, id);
    await this.prisma.assistantMembership.update({
      where: { id },
      data: { status: 'removed', removed_at: new Date() },
    });
    await this.context.invalidate(m.assistant_user_id);
    return this.team(user);
  }

  private async own(user: RequestUser, id: string) {
    const m = await this.prisma.assistantMembership.findFirst({
      where: { id, attorney_id: user.sub, status: { not: 'removed' } },
    });
    if (!m) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Assistant not found.',
      });
    }
    return m;
  }

  /** Assistants that ring for the attorney's calls (duty "calls"). */
  async callAssistants(attorneyId: string): Promise<string[]> {
    const rows = await this.prisma.assistantMembership.findMany({
      where: {
        attorney_id: attorneyId,
        status: 'active',
        duties: { has: 'calls' },
        assistant_user_id: { not: null },
      },
      select: { assistant_user_id: true },
    });
    return rows.flatMap((r) =>
      r.assistant_user_id ? [r.assistant_user_id] : [],
    );
  }

  // --- activity -------------------------------------------------------

  async log(
    user: RequestUser,
    action: string,
    target?: { type?: string; id?: string; summary?: string },
  ): Promise<void> {
    const a = user.assistant;
    if (!a) return;
    await this.prisma.assistantActivity.create({
      data: {
        attorney_id: user.sub,
        membership_id: a.membershipId,
        action,
        target_type: target?.type ?? null,
        target_id: target?.id ?? null,
        summary: target?.summary?.slice(0, 300) ?? null,
      },
    });
  }

  async activity(
    user: RequestUser,
    membershipId?: string,
    cursor?: string,
  ): Promise<{ items: ActivityDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.assistantActivity.findMany({
      where: {
        attorney_id: user.sub,
        ...(membershipId ? { membership_id: membershipId } : {}),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        membership: {
          select: {
            display_name: true,
            phone_e164: true,
            assistant_user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        membershipId: r.membership_id,
        assistantName: nameOf(r.membership),
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        summary: r.summary,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  // --- approval requests ------------------------------------------------

  async createRequest(
    user: RequestUser,
    dto: CreateAssistantRequestDto,
  ): Promise<AssistantRequestDto> {
    const a = user.assistant;
    if (!a) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only assistants send approval requests.',
      });
    }
    const duty =
      dto.kind === 'profile_edit'
        ? 'profile'
        : dto.kind === 'post'
          ? 'posts'
          : dto.kind === 'case_comment'
            ? 'cases'
            : 'posts';
    if (!a.duties.includes(duty)) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty },
      });
    }
    validatePayload(dto);
    const r = await this.prisma.assistantRequest.create({
      data: {
        attorney_id: user.sub,
        membership_id: a.membershipId,
        kind: dto.kind,
        payload: dto.payload as Prisma.InputJsonObject,
      },
    });
    await this.log(user, `request.${dto.kind}`, {
      type: 'request',
      id: r.id,
      summary: summaryOf(dto),
    });
    await this.notifications.emit({
      type: 'assistant_request',
      recipientId: user.sub,
      payload: { requestId: r.id, kind: dto.kind },
    });
    return (await this.presentRequests([r.id]))[0];
  }

  async requests(
    user: RequestUser,
    status?: 'pending' | 'approved' | 'rejected',
    cursor?: string,
  ): Promise<{ items: AssistantRequestDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.assistantRequest.findMany({
      where: {
        attorney_id: user.sub,
        // An assistant sees their own requests and the answers.
        ...(user.assistant
          ? { membership_id: user.assistant.membershipId }
          : {}),
        ...(status ? { status } : {}),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      select: { id: true, created_at: true },
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.presentRequests(page.map((r) => r.id)),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** The attorney approves → it is published / applied as the attorney. */
  async approve(
    user: RequestUser,
    id: string,
    note?: string,
  ): Promise<AssistantRequestDto> {
    const r = await this.pendingRequest(user, id);
    const p = r.payload as Record<string, unknown>;
    let resultId: string | null = null;
    if (r.kind === 'post') {
      const post = await this.posts.create(user, p as unknown as CreatePostDto);
      resultId = post.id;
    } else if (r.kind === 'comment') {
      const c = await this.comments.create(
        user.sub,
        String(p.postId),
        String(p.body),
        typeof p.parentId === 'string' ? p.parentId : undefined,
      );
      resultId = c.id;
    } else if (r.kind === 'case_comment') {
      const c = await this.caseComments.create(
        user,
        String(p.caseId),
        String(p.body),
        typeof p.parentId === 'string' ? p.parentId : undefined,
      );
      resultId = c.id;
    } else {
      await this.profiles.updateOwn(user.sub, p);
      resultId = user.sub;
    }
    await this.prisma.assistantRequest.update({
      where: { id },
      data: {
        status: 'approved',
        result_id: resultId,
        note: note ?? null,
        decided_at: new Date(),
      },
    });
    await this.tellAssistant(r.membership_id, {
      requestId: id,
      decision: 'approved',
    });
    return (await this.presentRequests([id]))[0];
  }

  /** OQ-048: the assistant hears back (push + their Results section). */
  async tellAssistant(
    membershipId: string | null,
    payload: Record<string, string>,
  ): Promise<void> {
    if (!membershipId) return;
    const m = await this.prisma.assistantMembership.findUnique({
      where: { id: membershipId },
      select: { assistant_user_id: true, status: true },
    });
    if (!m?.assistant_user_id || m.status !== 'active') return;
    await this.notifications.emit({
      type: 'assistant_result',
      recipientId: m.assistant_user_id,
      payload,
    });
  }

  async reject(
    user: RequestUser,
    id: string,
    note?: string,
  ): Promise<AssistantRequestDto> {
    const r = await this.pendingRequest(user, id);
    await this.prisma.assistantRequest.update({
      where: { id },
      data: { status: 'rejected', note: note ?? null, decided_at: new Date() },
    });
    await this.tellAssistant(r.membership_id, {
      requestId: id,
      decision: 'rejected',
    });
    return (await this.presentRequests([id]))[0];
  }

  private async pendingRequest(user: RequestUser, id: string) {
    const r = await this.prisma.assistantRequest.findFirst({
      where: { id, attorney_id: user.sub, status: 'pending' },
    });
    if (!r) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Request not found.',
      });
    }
    return r;
  }

  private async presentRequests(ids: string[]): Promise<AssistantRequestDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.assistantRequest.findMany({
      where: { id: { in: ids } },
      include: {
        membership: {
          select: {
            display_name: true,
            phone_e164: true,
            assistant_user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = byId.get(id);
      if (!r) return [];
      return [
        {
          id: r.id,
          membershipId: r.membership_id,
          assistantName: nameOf(r.membership),
          kind: r.kind,
          payload: r.payload as Record<string, unknown>,
          status: r.status,
          resultId: r.result_id,
          note: r.note,
          createdAt: r.created_at.toISOString(),
          decidedAt: r.decided_at?.toISOString() ?? null,
        },
      ];
    });
  }
}

export function nameOf(m: MemberNames): string {
  return (
    m.display_name ??
    ([m.assistant_user?.first_name, m.assistant_user?.last_name]
      .filter(Boolean)
      .join(' ') ||
      m.phone_e164)
  );
}

function memberDto(
  m: AssistantMembership & {
    assistant_user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  },
): AssistantMemberDto {
  const named =
    [m.assistant_user?.first_name, m.assistant_user?.last_name]
      .filter(Boolean)
      .join(' ') || null;
  return {
    id: m.id,
    phone: m.phone_e164,
    name: m.display_name ?? named,
    status: m.status,
    approval: m.approval,
    duties: m.duties,
    joinedAt: m.joined_at?.toISOString() ?? null,
    createdAt: m.created_at.toISOString(),
    liabilityAcceptedAt: null,
  };
}

function validatePayload(dto: CreateAssistantRequestDto): void {
  const p = dto.payload ?? {};
  const str = (k: string, max: number) =>
    typeof p[k] === 'string' && p[k].trim().length > 0 && p[k].length <= max;
  const ok =
    dto.kind === 'post'
      ? str('title', 120) && str('body', 2200) && str('practiceCode', 120)
      : dto.kind === 'comment'
        ? str('postId', 64) && str('body', 1000)
        : dto.kind === 'case_comment'
          ? str('caseId', 64) && str('body', 1000)
          : Object.keys(p).length > 0;
  if (!ok) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The request is incomplete.',
      details: { field: 'payload' },
    });
  }
}

function summaryOf(dto: CreateAssistantRequestDto): string {
  const p = dto.payload;
  const s = (k: string) => (typeof p[k] === 'string' ? p[k] : '');
  return dto.kind === 'post' ? s('title') : s('body') || dto.kind;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Which responsibility duties a change grants or withdraws. */
function liabilityDiff(
  before: readonly string[],
  after: readonly string[],
): { granted: string[]; revoked: string[] } {
  const L = LIABILITY_DUTIES as readonly string[];
  return {
    granted: after.filter((d) => L.includes(d) && !before.includes(d)),
    revoked: before.filter((d) => L.includes(d) && !after.includes(d)),
  };
}

/** OQ-049: "bids" / "publish" only with the attorney's explicit consent. */
function assertLiability(granted: string[], accepted?: boolean): void {
  if (granted.length > 0 && accepted !== true) {
    throw new BadRequestException({
      code: ErrorCode.ASSISTANT_LIABILITY_REQUIRED,
      message:
        "Accept full responsibility for the assistant's bids, negotiations and publications to grant this.",
      details: { duties: granted },
    });
  }
}
