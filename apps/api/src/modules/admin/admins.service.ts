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
import {
  covers,
  defaultPermissionsForRole,
  intersect,
  parsePermissions,
  readCountries,
  readManageAdmins,
  readPartner,
  storePermissions,
} from '../admin-auth/admin-permissions';
import type { AdminAccountDto, AdminRoleName } from './admin.dto';

export const ADMINS_AUDIT = {
  create: 'admins.create',
  setRole: 'admins.set_role',
  disable: 'admins.disable',
  enable: 'admins.enable',
  resetTotp: 'admins.reset_2fa',
  setPermissions: 'admins.set_permissions',
  setCountries: 'admins.set_countries',
  remove: 'admins.delete',
} as const;

const ADMIN_SELECT = {
  id: true,
  email: true,
  status: true,
  created_at: true,
  admin_profile: { select: { admin_role: true, permissions: true } },
  admin_credential: {
    select: {
      totp_enabled_at: true,
      last_login_at: true,
      login: true,
      password_hash: true,
    },
  },
} as const;

type AdminRow = Prisma.UserGetPayload<{ select: typeof ADMIN_SELECT }>;

/**
 * docs/06 §2.3 item 13 "Администраторы: создание, назначение роли,
 * отключение, сброс 2FA". Owner 2026-10-02: the super admin can give one
 * admin the right to manage others. That admin (a "manager") may only grant
 * areas they hold themselves, only touch admins whose access fits inside
 * their own, and never grant or touch money, keys, audit log, sessions or the
 * manager right itself — all enforced here, not only in the panel. No self-service
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

  async list(actor: AdminActor): Promise<AdminAccountDto[]> {
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
    // Owner 2026-10-06: a country partner sees only their own team.
    const visible = actor.partner
      ? rows.filter(
          (r) =>
            readPartner(r.admin_profile?.permissions)?.partnerId ===
            actor.partner?.partnerId,
        )
      : rows;
    // A manager never reads the login of an admin outside their reach.
    return visible.map((r) => {
      const dto = present(r);
      return reaches(actor, r) ? dto : { ...dto, login: null };
    });
  }

  /** Loads the target and refuses unless [actor] may touch it. */
  async assertCanManage(actor: AdminActor, id: string): Promise<void> {
    if (id === actor.id && !isSuper(actor)) throw cannotTargetSelf();
    this.assertManageable(actor, await this.load(this.prisma, id));
  }

  private assertManageable(actor: AdminActor, target: AdminRow): void {
    if (!reaches(actor, target)) throw outsideReach();
  }

  async create(
    actor: AdminActor,
    email: string,
    role: AdminRoleName,
    permissions?: Record<string, string>,
    canManageAdmins?: boolean,
  ): Promise<AdminAccountDto> {
    const own = actor.permissions ?? {};
    if (!isSuper(actor)) {
      if (role === 'super_admin' || canManageAdmins) throw outsideReach();
      if (permissions && !covers(own, parsePermissions(permissions))) {
        throw outsideReach();
      }
    }
    // Owner 2026-10-06: a country partner hires into their own team, up to
    // the limit the owner set, only while the partnership is active.
    const team = actor.partner?.lead
      ? await this.assertPartnerSeat(actor.partner.partnerId)
      : null;
    const asked =
      role === 'super_admin'
        ? {}
        : permissions
          ? parsePermissions(permissions)
          : partnerDefaults(role, team !== null);
    // A manager's role defaults are capped at what they hold themselves.
    const perms = isSuper(actor) ? asked : intersect(own, asked);
    const stored = storePermissions(
      perms,
      isSuper(actor) && role !== 'super_admin' && canManageAdmins === true,
      // A manager who works with some countries hires for those.
      team
        ? [team.country_code]
        : isSuper(actor)
          ? []
          : (actor.assignedCountries ?? []),
      team ? { partnerId: team.id, lead: false } : null,
    );
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
          admin_profile: { create: { admin_role: role, permissions: stored } },
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.create,
          targetType: 'admin',
          targetId: user.id,
          after: { email: normalized, role, permissions: stored },
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
      if (before.admin_profile?.admin_role === 'super_admin') {
        await assertNotLastSuperAdmin(tx, id);
      }
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
      this.assertManageable(actor, before);
      if (before.status === status) return before;
      if (!enabled && before.admin_profile?.admin_role === 'super_admin') {
        await assertNotLastSuperAdmin(tx, id);
      }
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

  /** Toggles areas for another admin. The super admin can set anything
   * (and the manager right); a manager only what they hold themselves.
   * Read live on each request, so it applies at once. */
  async setPermissions(
    actor: AdminActor,
    id: string,
    input: Record<string, string>,
    canManageAdmins?: boolean,
  ): Promise<AdminAccountDto> {
    if (id === actor.id) throw cannotTargetSelf();
    const next = parsePermissions(input);
    if (!isSuper(actor)) {
      if (canManageAdmins !== undefined) throw outsideReach();
      if (!covers(actor.permissions ?? {}, next)) throw outsideReach();
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      if (before.admin_profile?.admin_role === 'super_admin') {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'The super admin already has access to everything.',
        });
      }
      this.assertManageable(actor, before);
      const manager = isSuper(actor)
        ? (canManageAdmins ??
          readManageAdmins(before.admin_profile?.permissions))
        : false;
      const stored = storePermissions(
        next,
        manager,
        readCountries(before.admin_profile?.permissions),
        readPartner(before.admin_profile?.permissions),
      );
      const after = await tx.user.update({
        where: { id },
        data: { admin_profile: { update: { permissions: stored } } },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.setPermissions,
          targetType: 'admin',
          targetId: id,
          before: before.admin_profile?.permissions ?? {},
          after: stored,
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    return present(updated);
  }

  /** Owner 2026-10-05: the countries an employee works with (empty =
   * every country). A manager limited to some countries can only hand out
   * those. Read live on each request, so it applies at once. */
  async setCountries(
    actor: AdminActor,
    id: string,
    countries: string[],
  ): Promise<AdminAccountDto> {
    if (id === actor.id) throw cannotTargetSelf();
    const next = [...new Set(countries.map((c) => c.toUpperCase()))].sort();
    const own = isSuper(actor) ? [] : (actor.assignedCountries ?? []);
    if (
      own.length > 0 &&
      (next.length === 0 || next.some((c) => !own.includes(c)))
    ) {
      throw outsideReach();
    }
    if (next.length > 0) {
      const known = await this.prisma.country.count({
        where: { code: { in: next } },
      });
      if (known !== next.length) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Unknown country code.',
        });
      }
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      if (before.admin_profile?.admin_role === 'super_admin') {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'The super admin already works with every country.',
        });
      }
      this.assertManageable(actor, before);
      const raw = before.admin_profile?.permissions;
      // A partner's team always works in the partner's country only.
      if (readPartner(raw)) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: "A country partner's team works in the partner's country.",
        });
      }
      const stored = storePermissions(
        parsePermissions(raw),
        readManageAdmins(raw),
        next,
      );
      const after = await tx.user.update({
        where: { id },
        data: { admin_profile: { update: { permissions: stored } } },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.setCountries,
          targetType: 'admin',
          targetId: id,
          before: { countries: readCountries(raw) },
          after: { countries: next },
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    return present(updated);
  }

  /** Removes an admin for good from the panel: the account is closed, the
   * login and password are wiped, the email is freed and every session ends. */
  async remove(actor: AdminActor, id: string): Promise<void> {
    if (id === actor.id) throw cannotTargetSelf();
    await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      this.assertManageable(actor, before);
      if (before.admin_profile?.admin_role === 'super_admin') {
        await assertNotLastSuperAdmin(tx, id);
      }
      await tx.adminCredential.updateMany({
        where: { user_id: id },
        data: {
          login: null,
          password_hash: null,
          security_answer_hash: null,
          totp_enabled_at: null,
          recovery_codes_hash: [],
        },
      });
      await tx.user.update({
        where: { id },
        data: {
          status: 'suspended',
          deleted_at: new Date(),
          email: `deleted-${id}@deleted.invalid`,
        },
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.remove,
          targetType: 'admin',
          targetId: id,
          before: {
            email: before.email,
            role: before.admin_profile?.admin_role ?? null,
          },
          ip: actor.ip,
        },
        tx,
      );
    });
    await this.sessions.revokeAllForUser(id);
  }

  /** The partner's row when the lead may hire one more person; 403
   * otherwise (paused or disabled partnership, or the team is full). */
  private async assertPartnerSeat(
    partnerId: string,
  ): Promise<{ id: string; country_code: string }> {
    const partner = await this.prisma.countryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, country_code: true, status: true, max_admins: true },
    });
    if (!partner || partner.status !== 'active') throw outsideReach();
    const team = await this.prisma.adminProfile.findMany({
      where: {
        permissions: { path: ['country_partner'], equals: partnerId },
        user: { deleted_at: null },
      },
      select: { permissions: true },
    });
    const staff = team.filter((t) => !readPartner(t.permissions)?.lead).length;
    if (staff >= partner.max_admins) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `Your team is full (${partner.max_admins} people). Ask LawBid to raise the limit.`,
      });
    }
    return partner;
  }

  /** Reload one account for the response after a credentials change. */
  async get(id: string): Promise<AdminAccountDto> {
    return present(await this.load(this.prisma, id));
  }

  /** Drops the authenticator binding and recovery codes: the next sign-in
   * enrolls again. Every session of that admin ends now. */
  async resetTotp(actor: AdminActor, id: string): Promise<AdminAccountDto> {
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      this.assertManageable(actor, before);
      // Keep login/password/security question: only the authenticator
      // binding and recovery codes go.
      await tx.adminCredential.updateMany({
        where: { user_id: id },
        data: { totp_enabled_at: null, recovery_codes_hash: [] },
      });
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
    tx: Prisma.TransactionClient | PrismaService,
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
    login: u.admin_credential?.login ?? null,
    hasPassword: Boolean(u.admin_credential?.password_hash),
    permissions: parsePermissions(u.admin_profile?.permissions),
    canManageAdmins: readManageAdmins(u.admin_profile?.permissions),
    countries: readCountries(u.admin_profile?.permissions),
    countryPartnerId:
      readPartner(u.admin_profile?.permissions)?.partnerId ?? null,
    partnerLead: readPartner(u.admin_profile?.permissions)?.lead ?? false,
    lastLoginAt: u.admin_credential?.last_login_at?.toISOString() ?? null,
    createdAt: u.created_at.toISOString(),
  };
}

/** Role defaults; inside a partner team the accountant (finance) reads
 * the country's revenue report instead of payroll. */
function partnerDefaults(role: AdminRoleName, partnerTeam: boolean) {
  const base = defaultPermissionsForRole(role);
  if (!partnerTeam) return base;
  if (role === 'finance')
    return { dashboard: 'view', partner_report: 'view' } as const;
  return base;
}

const isSuper = (actor: AdminActor): boolean =>
  actor.adminRole === 'super_admin';

/** May [actor] touch this admin? The super admin: anyone. A manager: only a
 * non-super, non-manager admin whose access fits inside the manager's own. */
function reaches(actor: AdminActor, target: AdminRow): boolean {
  if (isSuper(actor)) return true;
  const prof = target.admin_profile;
  if (!prof || prof.admin_role === 'super_admin') return false;
  if (readManageAdmins(prof.permissions)) return false;
  // Owner 2026-10-06: a country partner reaches only their own staff; the
  // owner's deputy never touches a partner's team (the owner does).
  const theirTeam = readPartner(prof.permissions);
  if (actor.partner) {
    if (!actor.partner.lead) return false;
    if (theirTeam?.partnerId !== actor.partner.partnerId) return false;
    if (theirTeam.lead) return false;
  } else if (theirTeam) {
    return false;
  }
  // A manager limited to some countries reaches only staff of those.
  const own = actor.assignedCountries ?? [];
  if (own.length > 0) {
    const theirs = readCountries(prof.permissions);
    if (theirs.length === 0 || theirs.some((c) => !own.includes(c))) {
      return false;
    }
  }
  return covers(actor.permissions ?? {}, parsePermissions(prof.permissions));
}

const outsideReach = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message:
      'You can only grant or change access you hold yourself, and only for admins within it.',
  });

const cannotTargetSelf = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'You cannot change your own admin account.',
  });

/** Security review: the last active super_admin can be neither demoted
 * nor disabled — otherwise nobody could manage admins any more. */
const lastSuperAdmin = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'This is the last active super_admin.',
  });

async function assertNotLastSuperAdmin(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  const others = await tx.user.count({
    where: {
      id: { not: id },
      role: 'admin',
      status: 'active',
      deleted_at: null,
      admin_profile: { admin_role: 'super_admin' },
    },
  });
  if (others === 0) throw lastSuperAdmin();
}
