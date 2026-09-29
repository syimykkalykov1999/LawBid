import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import type { AdminAccountDto, AdminRoleName } from './admin.dto';

export const ADMINS_AUDIT = {
  create: 'admins.create',
  setRole: 'admins.set_role',
  disable: 'admins.disable',
  enable: 'admins.enable',
  resetTotp: 'admins.reset_2fa',
} as const;

const ADMIN_SELECT = {
  id: true,
  email: true,
  status: true,
  created_at: true,
  admin_profile: { select: { admin_role: true } },
  admin_credential: { select: { totp_enabled_at: true, last_login_at: true } },
} as const;

type AdminRow = Prisma.UserGetPayload<{ select: typeof ADMIN_SELECT }>;

/**
 * docs/06 §2.3 item 13 "Администраторы: создание, назначение роли,
 * отключение (только super_admin), сброс 2FA". No self-service
 * registration (§2.1); an admin account is a `users` row with role
 * `admin` + `admin_profiles`. Disabling = `users.status = suspended`
 * (AdminAuthGuard refuses on the next request) plus every admin session
 * revoked at once. Each action writes its own audit_log row with
 * before/after.
 */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly sessions: AdminSessionService,
  ) {}

  async list(): Promise<AdminAccountDto[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        deleted_at: null,
        admin_profile: { isNot: null },
      },
      select: ADMIN_SELECT,
      orderBy: { created_at: 'asc' },
      take: 500,
    });
    return rows.map(present);
  }

  async create(
    actor: AdminActor,
    email: string,
    role: AdminRoleName,
  ): Promise<AdminAccountDto> {
    const normalized = email.trim().toLowerCase();
    const created = await withTxRetry(this.prisma, async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: normalized },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: ErrorCode.ADMIN_EMAIL_TAKEN,
          message: 'An account with this email already exists.',
        });
      }
      const user = await tx.user.create({
        data: {
          role: 'admin',
          status: 'active',
          email: normalized,
          // Sign-in is by a code to this very address (§2.1), so the
          // address is verified by the first successful sign-in; marking
          // it now keeps the account out of "unverified email" flows.
          email_verified_at: new Date(),
          ui_language: 'en',
          admin_profile: { create: { admin_role: role } },
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.create,
          targetType: 'admin',
          targetId: user.id,
          after: { email: normalized, role },
          ip: actor.ip,
        },
        tx,
      );
      return user;
    });
    return present(created);
  }

  async setRole(
    actor: AdminActor,
    id: string,
    role: AdminRoleName,
  ): Promise<AdminAccountDto> {
    if (id === actor.id) throw cannotTargetSelf();
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      if (before.admin_profile?.admin_role === role) return before;
      const after = await tx.user.update({
        where: { id },
        data: { admin_profile: { update: { admin_role: role } } },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.setRole,
          targetType: 'admin',
          targetId: id,
          before: { role: before.admin_profile?.admin_role ?? null },
          after: { role },
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    // The old role may have allowed more than the new one.
    await this.sessions.revokeAllForUser(id);
    return present(updated);
  }

  async setEnabled(
    actor: AdminActor,
    id: string,
    enabled: boolean,
  ): Promise<AdminAccountDto> {
    if (id === actor.id) throw cannotTargetSelf();
    const status = enabled ? 'active' : 'suspended';
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      if (before.status === status) return before;
      const after = await tx.user.update({
        where: { id },
        data: { status },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: enabled ? ADMINS_AUDIT.enable : ADMINS_AUDIT.disable,
          targetType: 'admin',
          targetId: id,
          before: { status: before.status },
          after: { status },
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    if (!enabled) await this.sessions.revokeAllForUser(id);
    return present(updated);
  }

  /** Drops the authenticator binding and recovery codes: the next sign-in
   * enrolls again. Every session of that admin ends now. */
  async resetTotp(actor: AdminActor, id: string): Promise<AdminAccountDto> {
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      await tx.adminCredential.deleteMany({ where: { user_id: id } });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.resetTotp,
          targetType: 'admin',
          targetId: id,
          before: {
            totpEnabled: Boolean(before.admin_credential?.totp_enabled_at),
          },
          after: { totpEnabled: false },
          ip: actor.ip,
        },
        tx,
      );
      return this.load(tx, id);
    });
    await this.sessions.revokeAllForUser(id);
    return present(updated);
  }

  private async load(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<AdminRow> {
    const user = await tx.user.findFirst({
      where: { id, role: 'admin', deleted_at: null },
      select: ADMIN_SELECT,
    });
    if (!user?.admin_profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Administrator not found.',
      });
    }
    return user;
  }
}

function present(u: AdminRow): AdminAccountDto {
  return {
    id: u.id,
    email: u.email ?? '',
    role: u.admin_profile?.admin_role ?? 'support',
    status: u.status === 'active' ? 'active' : 'disabled',
    totpEnabled: Boolean(u.admin_credential?.totp_enabled_at),
    lastLoginAt: u.admin_credential?.last_login_at?.toISOString() ?? null,
    createdAt: u.created_at.toISOString(),
  };
}

const cannotTargetSelf = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'You cannot change your own admin account.',
  });
