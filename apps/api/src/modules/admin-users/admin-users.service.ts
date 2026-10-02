import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { OtpService } from '../auth/services/otp.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import { CaseLifecycleService } from '../cases/lifecycle/case-lifecycle.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VerificationAdminService } from '../verification/services/verification-admin.service';
import type {
  AdminUserCardDto,
  AdminUserContactsDto,
  AdminUserListItemDto,
  AdminUsersPage,
  AdminUsersQueryDto,
  SanctionResultDto,
  PhoneChangedDto,
} from './admin-users.dto';

export const USERS_AUDIT = {
  sessionsRevoked: 'users.sessions_revoked',
  warn: 'users.warn',
  suspend: 'users.suspend',
  restore: 'users.restore',
  phoneChanged: 'users.phone_changed',
} as const;

const LIST_DEFAULT = 20;
const PHONE_CHANGES_PER_ADMIN_PER_DAY = 10;
const CARD_LIST = 20;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UserQuery =
  | { kind: 'id'; id: string }
  | { kind: 'email'; email: string }
  | { kind: 'phone'; e164: string }
  | { kind: 'username'; usernameLower: string }
  | { kind: 'name'; needle: string }
  | { kind: 'none' };

/** docs/06 §2.3 item 3 search: one query, five shapes. Exact matches hit
 * unique indexes (id, email, phone_e164, username_lower); a name uses the
 * trigram index on users.full_name_lower. */
export function parseUserQuery(raw: string | undefined): UserQuery {
  const q = (raw ?? '').trim();
  if (!q) return { kind: 'none' };
  if (UUID_RE.test(q)) return { kind: 'id', id: q.toLowerCase() };
  if (q.startsWith('@')) {
    return { kind: 'username', usernameLower: q.slice(1).toLowerCase() };
  }
  if (q.includes('@')) return { kind: 'email', email: q.toLowerCase() };
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 7 && /^[\d\s()+.-]+$/.test(q)) {
    const e164 =
      digits.length === 10
        ? `+1${digits}`
        : digits.length === 11 && digits.startsWith('1')
          ? `+${digits}`
          : `+${digits}`;
    return { kind: 'phone', e164 };
  }
  return { kind: 'name', needle: q.toLowerCase() };
}

const LIST_SELECT = {
  id: true,
  role: true,
  status: true,
  first_name: true,
  last_name: true,
  avatar_file_id: true,
  created_at: true,
  attorney_profile: { select: { username: true, verification_status: true } },
} as const;
type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;
type Avatars = Awaited<ReturnType<FilesService['avatarUrlsMany']>>;

/**
 * docs/06 §2.3 item 3 + §3.4: search, card, contacts (justified) and the
 * sanctions — revoke sessions, warn (`moderation_notice`), suspend /
 * restore. Every sanction writes `moderation_actions` and an audit row
 * with before/after; suspension revokes sessions, and for a client
 * archives `open` cases (CaseLifecycleService), for an attorney applies
 * the file-03 §2.5 effects (VerificationAdminService).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly sessions: SessionRevocationService,
    private readonly lifecycle: CaseLifecycleService,
    private readonly verification: VerificationAdminService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly otp: OtpService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async search(q: AdminUsersQueryDto): Promise<AdminUsersPage> {
    const limit = q.limit ?? LIST_DEFAULT;
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const parsed = parseUserQuery(q.q);
    const byQuery: Prisma.UserWhereInput =
      parsed.kind === 'id'
        ? { id: parsed.id }
        : parsed.kind === 'email'
          ? { email: parsed.email }
          : parsed.kind === 'phone'
            ? { phone_e164: parsed.e164 }
            : parsed.kind === 'username'
              ? {
                  attorney_profile: {
                    username_lower: { startsWith: parsed.usernameLower },
                  },
                }
              : parsed.kind === 'name'
                ? { full_name_lower: { contains: parsed.needle } }
                : {};
    const where: Prisma.UserWhereInput = {
      ...byQuery,
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const avatars = await this.files.avatarUrlsMany(
      page.map((r) => r.avatar_file_id),
    );
    const last = page[page.length - 1];
    return {
      items: page.map((r) => presentListItem(r, avatars)),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async card(id: string): Promise<AdminUserCardDto> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        suspended_reason: true,
        ui_language: true,
        email: true,
        phone_e164: true,
        deleted_at: true,
        attorney_profile: {
          select: {
            username: true,
            firm_name: true,
            verification_status: true,
            verified_at: true,
            rating_avg: true,
            rating_count: true,
            followers_count: true,
            posts_count: true,
            licenses: {
              select: { state_code: true, license_status: true },
              orderBy: { state_code: 'asc' },
            },
          },
        },
        client_profile: {
          select: {
            state_code: true,
            preferred_contact_method: true,
            preferred_languages: true,
          },
        },
        subscription: {
          select: {
            status: true,
            trial_ends_at: true,
            current_period_end: true,
            cancel_at_period_end: true,
            grace_ends_at: true,
          },
        },
      },
    });
    if (!u) throw notFound();
    const [sessions, cases, bids, warnings] = await Promise.all([
      this.prisma.session.findMany({
        where: { user_id: id, revoked_at: null },
        orderBy: { last_used_at: 'desc' },
        distinct: ['session_chain_id'],
        take: CARD_LIST,
        select: {
          session_chain_id: true,
          device_name: true,
          platform: true,
          app_version: true,
          ip: true,
          last_used_at: true,
          created_at: true,
          _count: { select: { push_tokens: true } },
        },
      }),
      u.role === 'client'
        ? this.prisma.case.findMany({
            where: { client_id: id },
            orderBy: { created_at: 'desc' },
            take: CARD_LIST,
            select: {
              id: true,
              title: true,
              status: true,
              primary_state_code: true,
              created_at: true,
            },
          })
        : [],
      u.role === 'attorney'
        ? this.prisma.bid.findMany({
            where: { attorney_id: id },
            orderBy: { created_at: 'desc' },
            take: CARD_LIST,
            select: {
              id: true,
              case_id: true,
              status: true,
              fee_type: true,
              amount_cents: true,
              created_at: true,
              case: { select: { title: true } },
            },
          })
        : [],
      this.prisma.moderationAction.count({
        where: { target_type: 'user', target_id: id, action: 'warn' },
      }),
    ]);
    const avatars = await this.files.avatarUrlsMany([u.avatar_file_id]);
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      suspendedReason: u.suspended_reason,
      firstName: u.first_name,
      lastName: u.last_name,
      avatarUrl: avatarOf(u.avatar_file_id, avatars),
      uiLanguage: u.ui_language,
      hasEmail: Boolean(u.email),
      hasPhone: Boolean(u.phone_e164),
      createdAt: u.created_at.toISOString(),
      deletedAt: u.deleted_at?.toISOString() ?? null,
      attorney: u.attorney_profile
        ? {
            username: u.attorney_profile.username,
            firmName: u.attorney_profile.firm_name,
            verificationStatus: u.attorney_profile.verification_status,
            verifiedAt: u.attorney_profile.verified_at?.toISOString() ?? null,
            ratingAvg: Number(u.attorney_profile.rating_avg),
            ratingCount: u.attorney_profile.rating_count,
            followersCount: u.attorney_profile.followers_count,
            postsCount: u.attorney_profile.posts_count,
            licenses: u.attorney_profile.licenses.map(
              (l) => `${l.state_code}:${l.license_status}`,
            ),
            subscription: u.subscription
              ? {
                  status: u.subscription.status,
                  trialEndsAt:
                    u.subscription.trial_ends_at?.toISOString() ?? null,
                  currentPeriodEnd:
                    u.subscription.current_period_end?.toISOString() ?? null,
                  cancelAtPeriodEnd: u.subscription.cancel_at_period_end,
                  graceEndsAt:
                    u.subscription.grace_ends_at?.toISOString() ?? null,
                }
              : null,
          }
        : null,
      client: u.client_profile
        ? {
            stateCode: u.client_profile.state_code,
            preferredContactMethod: u.client_profile.preferred_contact_method,
            preferredLanguages: u.client_profile.preferred_languages,
          }
        : null,
      sessions: sessions.map((s) => ({
        sessionChainId: s.session_chain_id,
        deviceName: s.device_name,
        platform: s.platform,
        appVersion: s.app_version,
        ip: s.ip,
        lastUsedAt: s.last_used_at?.toISOString() ?? null,
        createdAt: s.created_at.toISOString(),
        pushTokens: s._count.push_tokens,
      })),
      cases: cases.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        stateCode: c.primary_state_code,
        createdAt: c.created_at.toISOString(),
      })),
      bids: bids.map((b) => ({
        id: b.id,
        caseId: b.case_id,
        caseTitle: b.case.title,
        status: b.status,
        feeType: b.fee_type,
        amountCents: b.amount_cents,
        createdAt: b.created_at.toISOString(),
      })),
      warnings,
    };
  }

  /** The justified view (the interceptor writes the audit row). */
  async contacts(id: string): Promise<AdminUserContactsDto> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        email_verified_at: true,
        phone_e164: true,
        phone_verified_at: true,
        client_profile: { select: { preferred_contact_note: true } },
      },
    });
    if (!u) throw notFound();
    return {
      email: u.email,
      emailVerifiedAt: u.email_verified_at?.toISOString() ?? null,
      phone: u.phone_e164,
      phoneVerifiedAt: u.phone_verified_at?.toISOString() ?? null,
      preferredContactNote: u.client_profile?.preferred_contact_note ?? null,
    };
  }

  async revokeSessions(
    admin: AdminActor,
    id: string,
  ): Promise<SanctionResultDto> {
    const u = await this.target(id);
    const chains = await this.sessions.revokeAllChainsForUser(
      id,
      'admin_block',
    );
    await this.audit.record({
      adminId: admin.id,
      action: USERS_AUDIT.sessionsRevoked,
      targetType: 'user',
      targetId: id,
      after: { revokedSessions: chains.length },
      ip: admin.ip,
    });
    return {
      userId: id,
      status: u.status,
      revokedSessions: chains.length,
      archivedCases: 0,
      withdrawnBids: 0,
    };
  }

  /**
   * Owner 2026-10-01: support changes the phone on the user's request
   * (lost the old phone, new number). The phone identifier moves to the
   * new number, every session is signed out (the next sign-in goes to the
   * new phone), the change is audited with the reason and the user is
   * told (push + email).
   */
  async changePhone(
    admin: AdminActor,
    id: string,
    phone: string,
    reason: string,
  ): Promise<PhoneChangedDto> {
    await this.target(id);
    // Security audit 2026-10-01: a phone change is an account takeover
    // path — a real US mobile only (like sign-in) and at most 10 changes
    // a day per admin.
    await this.otp.assertSmsDestinationAllowed(phone);
    const budget = await this.rateLimit.consumeFixedWindow(
      ['admin-phone-change', admin.id],
      PHONE_CHANGES_PER_ADMIN_PER_DAY,
      86_400,
    );
    if (!budget.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many phone changes today.',
          details: { retryAfterSeconds: budget.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const taken = await this.prisma.userIdentifier.findUnique({
      where: {
        provider_provider_uid: { provider: 'phone', provider_uid: phone },
      },
      select: { user_id: true },
    });
    if (taken && taken.user_id !== id) {
      throw new ConflictException({
        code: ErrorCode.IDENTIFIER_ALREADY_LINKED,
        message: 'This phone number belongs to another account.',
      });
    }
    const before = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { phone_e164: true },
    });
    let revoked = 0;
    await withTxRetry(this.prisma, async (tx) => {
      const now = new Date();
      await tx.userIdentifier.deleteMany({
        where: { user_id: id, provider: 'phone', NOT: { provider_uid: phone } },
      });
      await tx.userIdentifier.upsert({
        where: {
          provider_provider_uid: { provider: 'phone', provider_uid: phone },
        },
        create: {
          user_id: id,
          provider: 'phone',
          provider_uid: phone,
          verified_at: now,
        },
        update: { verified_at: now },
      });
      await tx.user.update({
        where: { id },
        data: { phone_e164: phone, phone_verified_at: now },
      });
      const chains = await this.sessions.revokeAllChainsForUser(
        id,
        'admin_block',
        tx,
      );
      revoked = chains.length;
      await this.notifications.emit(
        {
          type: 'security_phone_changed',
          recipientId: id,
          payload: {},
        },
        tx,
      );
    });
    await this.audit.record({
      adminId: admin.id,
      action: USERS_AUDIT.phoneChanged,
      targetType: 'user',
      targetId: id,
      // Only the last digits: no full numbers in the audit log.
      before: { phone: mask(before.phone_e164) },
      after: { phone: mask(phone), reason, revokedSessions: revoked },
      ip: admin.ip,
    });
    return { userId: id, phone, revokedSessions: revoked };
  }

  /** §3.4 "Предупреждение: уведомление moderation_notice". */
  async warn(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<SanctionResultDto> {
    const u = await this.target(id);
    await withTxRetry(this.prisma, async (tx) => {
      const action = await tx.moderationAction.create({
        data: {
          admin_id: admin.id,
          target_type: 'user',
          target_id: id,
          action: 'warn',
          reason,
        },
      });
      await this.notifications.emit(
        {
          type: 'moderation_notice',
          recipientId: id,
          payload: { moderationActionId: action.id, reason },
        },
        tx,
      );
      await this.audit.record(
        {
          adminId: admin.id,
          action: USERS_AUDIT.warn,
          targetType: 'user',
          targetId: id,
          after: { reason, moderationActionId: action.id },
          ip: admin.ip,
        },
        tx,
      );
    });
    return {
      userId: id,
      status: u.status,
      revokedSessions: 0,
      archivedCases: 0,
      withdrawnBids: 0,
    };
  }

  /** §3.4 suspension. */
  async suspend(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<SanctionResultDto> {
    const u = await this.target(id);
    if (u.status === 'suspended') {
      throw new ConflictException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'The account is already suspended.',
      });
    }
    let withdrawnBids = 0;
    let revokedSessions = 0;
    await withTxRetry(this.prisma, async (tx) => {
      withdrawnBids = 0;
      await tx.user.update({
        where: { id },
        data: { status: 'suspended', suspended_reason: reason },
      });
      await tx.moderationAction.create({
        data: {
          admin_id: admin.id,
          target_type: 'user',
          target_id: id,
          action: 'suspend',
          reason,
        },
      });
      if (u.role === 'attorney') {
        const r = await this.verification.suspendInTx(tx, admin, id, reason);
        withdrawnBids = r?.withdrawnBids ?? 0;
      }
      const chains = await this.sessions.revokeAllChainsForUser(
        id,
        'admin_block',
        tx,
      );
      revokedSessions = chains.length;
      await this.audit.record(
        {
          adminId: admin.id,
          action: USERS_AUDIT.suspend,
          targetType: 'user',
          targetId: id,
          before: { status: u.status },
          after: {
            status: 'suspended',
            reason,
            revokedSessions,
            withdrawnBids,
          },
          ip: admin.ip,
        },
        tx,
      );
    });
    // Client: open cases → archived (one transaction per case, after the
    // status flip committed so a retry never leaves a half-suspended user).
    const archivedCases =
      u.role === 'client'
        ? (await this.lifecycle.archiveOpenCasesOfClient(id)).length
        : 0;
    return {
      userId: id,
      status: 'suspended',
      revokedSessions,
      archivedCases,
      withdrawnBids,
    };
  }

  /** §3.4 restore: `active`; a client's archived cases stay archived. */
  async restore(admin: AdminActor, id: string): Promise<SanctionResultDto> {
    const u = await this.target(id);
    if (u.status !== 'suspended') {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The account is not suspended.',
        details: { status: u.status },
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: 'active', suspended_reason: null },
      });
      await tx.moderationAction.create({
        data: {
          admin_id: admin.id,
          target_type: 'user',
          target_id: id,
          action: 'restore',
        },
      });
      if (u.role === 'attorney') {
        await this.verification.restoreInTx(tx, admin, id);
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: USERS_AUDIT.restore,
          targetType: 'user',
          targetId: id,
          before: { status: 'suspended', reason: u.suspended_reason },
          after: { status: 'active' },
          ip: admin.ip,
        },
        tx,
      );
    });
    return {
      userId: id,
      status: 'active',
      revokedSessions: 0,
      archivedCases: 0,
      withdrawnBids: 0,
    };
  }

  /** Sanctions apply to clients and attorneys; admins are managed in
   * /admin/admins; deleted accounts are out of reach. */
  private async target(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        deleted_at: true,
        suspended_reason: true,
      },
    });
    if (!u || u.deleted_at || u.status === 'deleted') throw notFound();
    if (u.role === 'admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Administrators are managed in the Administrators section.',
      });
    }
    return u;
  }
}

function avatarOf(fileId: string | null, avatars: Avatars): string | null {
  return fileId ? (avatars.get(fileId)?.url256 ?? null) : null;
}

function presentListItem(r: ListRow, avatars: Avatars): AdminUserListItemDto {
  return {
    id: r.id,
    role: r.role,
    status: r.status,
    firstName: r.first_name,
    lastName: r.last_name,
    username: r.attorney_profile?.username ?? null,
    verificationStatus: r.attorney_profile?.verification_status ?? null,
    avatarUrl: avatarOf(r.avatar_file_id, avatars),
    createdAt: r.created_at.toISOString(),
  };
}

const notFound = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'User not found.',
  });

function mask(phone: string | null): string | null {
  return phone ? `•••${phone.slice(-4)}` : null;
}
