import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { AdminWorkspace, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import {
  capToWorkspace,
  covers,
  defaultPermissionsForRole,
  hasSuperGrantOnly,
  intersect,
  outsideWorkspace,
  parsePermissions,
  readCountries,
  readManageAdmins,
  readNoPii,
  readPartner,
  storePermissions,
  workspaceCeiling,
  type AdminPermissions,
} from '../admin-auth/admin-permissions';
import {
  RETALIATION_PORT,
  type RetaliationAction,
  type RetaliationPort,
} from '../staff-core/retaliation.port';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { effectiveWorkspace } from '../staff-core/workspace-scope';
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
  // Staff package T2: the workspace an admin works in and the head flag.
  setWorkspace: 'admins.set_workspace',
  setHead: 'admins.set_head',
} as const;

const ADMIN_SELECT = {
  id: true,
  email: true,
  status: true,
  created_at: true,
  admin_profile: {
    select: {
      admin_role: true,
      permissions: true,
      workspace: true,
      is_workspace_head: true,
    },
  },
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
    // Staff package T2: the switches and the head's seat limit. Absent in
    // unit tests that build the service by hand = everything off.
    @Optional() private readonly staff?: StaffSettingsService,
    // Staff package T6 binds this; until then nothing is flagged.
    @Optional()
    @Inject(RETALIATION_PORT)
    private readonly retaliation?: RetaliationPort,
  ) {}

  /** Staff package T2: workspaces are switched on (`staff.workspaces_enabled`). */
  private async workspacesOn(): Promise<boolean> {
    return (await this.staff?.isOn('staff.workspaces_enabled')) === true;
  }

  /** The ceiling that applies to [target] now, or null (switch off, the
   * owner workspace, the owner's deputy and a partner's team have none). */
  private async ceilingFor(
    role: AdminRoleName,
    stored: AdminWorkspace | null | undefined,
    rawPermissions: unknown,
  ): Promise<AdminWorkspace | null> {
    if (!(await this.workspacesOn())) return null;
    if (role === 'super_admin') return null;
    if (readManageAdmins(rawPermissions) || readPartner(rawPermissions)) {
      return null;
    }
    const ws = effectiveWorkspace(role, stored);
    return workspaceCeiling(ws) ? ws : null;
  }

  /** Before a head pulls, offboards or cuts the rights of someone the
   * retaliation port (T6) may flag it; the action itself never stops. */
  private async checkRetaliation(
    actor: AdminActor,
    subjectId: string,
    action: RetaliationAction,
  ): Promise<void> {
    if (!isHead(actor) || !this.retaliation) return;
    await this.retaliation
      .check(subjectId, actor.id, action)
      .catch(() => undefined);
  }

  async list(
    actor: AdminActor,
    workspace?: AdminWorkspace,
  ): Promise<AdminAccountDto[]> {
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
    // Staff package T2: a head sees their own workspace only, never the
    // owner, the deputy or a partner team.
    const inSpace = isHead(actor)
      ? visible.filter((r) => inHeadSpace(actor, r) || r.id === actor.id)
      : visible;
    const byWorkspace = workspace
      ? inSpace.filter((r) => workspaceOfRow(r) === workspace)
      : inSpace;
    // A manager never reads the login of an admin outside their reach.
    return byWorkspace.map((r) => {
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
    noPii?: boolean,
    // The rights come from a ready-made preset, not typed by hand.
    fromPreset = false,
  ): Promise<AdminAccountDto> {
    const own = actor.permissions ?? {};
    const head = isHead(actor);
    // Staff package T2: where the new admin will work. A head hires into
    // their own workspace only; the owner's choice follows the role (as
    // the migration backfill did) and is changed on the Администраторы page.
    const workspace: AdminWorkspace = head
      ? (actor.workspace as AdminWorkspace)
      : workspaceForRole(role, null);
    if (!isSuper(actor)) {
      if (role === 'super_admin' || canManageAdmins) throw outsideReach();
      // A head hires inside the ceiling of their workspace (and never a
      // finance role into the mass workspace); the others only what they
      // hold themselves.
      if (head) {
        if (role === 'finance') throw outsideReach();
        if (permissions && !fromPreset) {
          this.assertInsideWorkspace(workspace, parsePermissions(permissions));
        }
      } else if (permissions && !covers(own, parsePermissions(permissions))) {
        throw outsideReach();
      }
      // Money, economy, budget caps and the audit log: the owner hands
      // them out himself.
      if (permissions && hasSuperGrantOnly(parsePermissions(permissions))) {
        throw outsideReach();
      }
    }
    // Owner 2026-10-06: a country partner hires into their own team, up to
    // the limit the owner set, only while the partnership is active.
    const team = actor.partner?.lead
      ? await this.assertPartnerSeat(actor.partner.partnerId)
      : null;
    if (head) await this.assertHeadSeat(workspace);
    const asked =
      role === 'super_admin'
        ? {}
        : permissions
          ? parsePermissions(permissions)
          : partnerDefaults(role, team !== null);
    // A manager's role defaults are capped at what they hold themselves.
    let perms = isSuper(actor) ? asked : head ? asked : intersect(own, asked);
    // Staff package T2: nobody is created with a section outside their
    // workspace. A grant spelled out by hand is refused (below, for the
    // owner too); defaults and presets are cut to the ceiling.
    const ceilingWs =
      team === null && (await this.workspacesOn()) && role !== 'super_admin'
        ? workspace
        : null;
    if (ceilingWs && workspaceCeiling(ceilingWs)) {
      if (permissions && !fromPreset) {
        this.assertInsideWorkspace(ceilingWs, perms);
      } else {
        perms = capToWorkspace(ceilingWs, perms);
      }
    }
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
      // Only the owner chooses the flag; a no-PII manager hires no-PII staff.
      role !== 'super_admin' &&
        (isSuper(actor) ? noPii === true : actor.noPii === true),
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
          admin_profile: {
            create: { admin_role: role, permissions: stored, workspace },
          },
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.create,
          targetType: 'admin',
          targetId: user.id,
          after: { email: normalized, role, permissions: stored, workspace },
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
      // Staff package T2: the workspace follows the role, as the migration
      // backfill did (finance -> finance, super admin -> owner); a head
      // whose workspace changes stops being head.
      const oldWs = workspaceOfRow(before);
      const newWs = workspaceForRole(role, oldWs);
      const after = await tx.user.update({
        where: { id },
        data: {
          admin_profile: {
            update: {
              admin_role: role,
              ...(newWs !== oldWs
                ? { workspace: newWs, is_workspace_head: false }
                : {}),
            },
          },
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.setRole,
          targetType: 'admin',
          targetId: id,
          before: {
            role: before.admin_profile?.admin_role ?? null,
            workspace: oldWs,
          },
          after: { role, workspace: newWs },
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
      if (!enabled) await this.checkRetaliation(actor, id, 'offboard');
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
    noPii?: boolean,
  ): Promise<AdminAccountDto> {
    if (id === actor.id) throw cannotTargetSelf();
    const next = parsePermissions(input);
    if (!isSuper(actor)) {
      if (canManageAdmins !== undefined || noPii !== undefined) {
        throw outsideReach();
      }
      // A head grants up to the ceiling of their workspace (checked against
      // the target's workspace below); the others what they hold.
      if (!isHead(actor) && !covers(actor.permissions ?? {}, next)) {
        throw outsideReach();
      }
      if (hasSuperGrantOnly(next)) throw outsideReach();
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
      // Staff package T2: nobody holds a section outside their workspace,
      // whoever hands it out (the owner moves the admin to the other
      // workspace first). The owner's deputy and a partner's team are
      // outside the workspaces.
      const ceilingWs = await this.ceilingFor(
        before.admin_profile?.admin_role ?? 'support',
        before.admin_profile?.workspace,
        before.admin_profile?.permissions,
      );
      if (ceilingWs) this.assertInsideWorkspace(ceilingWs, next);
      const cut = parsePermissions(before.admin_profile?.permissions);
      if (!covers(next, cut)) {
        await this.checkRetaliation(actor, id, 'rights_cut');
      }
      const manager = isSuper(actor)
        ? (canManageAdmins ??
          readManageAdmins(before.admin_profile?.permissions))
        : false;
      const stored = storePermissions(
        next,
        manager,
        readCountries(before.admin_profile?.permissions),
        readPartner(before.admin_profile?.permissions),
        isSuper(actor)
          ? (noPii ?? readNoPii(before.admin_profile?.permissions))
          : readNoPii(before.admin_profile?.permissions),
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
        null,
        readNoPii(raw),
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
    // Staff package T2: a head switches people off; deleting an account
    // for good stays with the owner and the deputy.
    if (isHead(actor)) throw outsideReach();
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

  /** Staff package T2 (owner only): moves an admin to another workspace.
   * The new workspace's ceiling must already fit their sections (while the
   * switch is on); a head who moves stops being head. Audited; the guard
   * reads the workspace live, so it applies at once. */
  async setWorkspace(
    actor: AdminActor,
    id: string,
    workspace: AdminWorkspace,
  ): Promise<AdminAccountDto> {
    if (!isSuper(actor)) throw outsideReach();
    if (id === actor.id) throw cannotTargetSelf();
    const on = await this.workspacesOn();
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.load(tx, id);
      const prof = before.admin_profile;
      const role = prof?.admin_role ?? 'support';
      const oldWs = workspaceOfRow(before);
      if (role === 'super_admin') {
        if (workspace !== 'owner') {
          throw workspaceConflict(
            'The super admin always works in the owner workspace.',
          );
        }
        return before;
      }
      if (readPartner(prof?.permissions)) {
        throw workspaceConflict(
          "A country partner's team stays outside the workspaces.",
        );
      }
      if (oldWs === workspace) return before;
      if (on) {
        const out = outsideWorkspace(
          workspace,
          parsePermissions(prof?.permissions),
        );
        // The deputy (manage_admins) is outside the workspaces: no ceiling.
        if (out.length > 0 && !readManageAdmins(prof?.permissions)) {
          throw workspaceConflict(
            `First close these sections: ${out.join(', ')}. They do not fit the «${workspace}» workspace.`,
          );
        }
      }
      const droppedHead = prof?.is_workspace_head === true;
      const after = await tx.user.update({
        where: { id },
        data: {
          admin_profile: {
            update: {
              workspace,
              ...(droppedHead ? { is_workspace_head: false } : {}),
            },
          },
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: ADMINS_AUDIT.setWorkspace,
          targetType: 'admin',
          targetId: id,
          before: { workspace: oldWs, workspaceHead: droppedHead },
          after: { workspace, workspaceHead: false },
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    return present(updated);
  }

  /** Staff package T2 (owner only): makes an admin the head of their
   * workspace, or clears it. One head per workspace (a partial unique
   * index in the database; 409 with a clear message), none in finance and
   * none in the owner workspace; never the deputy or a partner's team. */
  async setHead(
    actor: AdminActor,
    id: string,
    head: boolean,
  ): Promise<AdminAccountDto> {
    if (!isSuper(actor)) throw outsideReach();
    if (id === actor.id) throw cannotTargetSelf();
    try {
      const updated = await withTxRetry(this.prisma, async (tx) => {
        const before = await this.load(tx, id);
        const prof = before.admin_profile;
        const ws = workspaceOfRow(before);
        if ((prof?.is_workspace_head === true) === head) return before;
        if (head) {
          if (prof?.admin_role === 'super_admin') {
            throw workspaceConflict('The owner cannot be a workspace head.');
          }
          if (ws === 'finance') {
            throw workspaceConflict('The finance workspace has no head.');
          }
          if (ws === 'owner') {
            throw workspaceConflict(
              'The owner workspace has no head. Move the admin to the mass workspace first.',
            );
          }
          if (
            readManageAdmins(prof?.permissions) ||
            readPartner(prof?.permissions)
          ) {
            throw workspaceConflict(
              "The owner's deputy and a partner's team cannot be a workspace head.",
            );
          }
          if (before.status !== 'active') {
            throw workspaceConflict('A disabled admin cannot be a head.');
          }
          const other = await tx.adminProfile.findFirst({
            where: {
              workspace: ws,
              is_workspace_head: true,
              user_id: { not: id },
            },
            select: { user_id: true },
          });
          if (other) throw headTaken(ws);
        }
        const after = await tx.user.update({
          where: { id },
          data: { admin_profile: { update: { is_workspace_head: head } } },
          select: ADMIN_SELECT,
        });
        await this.audit.record(
          {
            adminId: actor.id,
            action: ADMINS_AUDIT.setHead,
            targetType: 'admin',
            targetId: id,
            before: { workspace: ws, workspaceHead: !head },
            after: { workspace: ws, workspaceHead: head },
            ip: actor.ip,
          },
          tx,
        );
        return after;
      });
      return present(updated);
    } catch (e) {
      // Two owners racing for the same seat: the partial unique index wins.
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw headTaken(null);
      }
      throw e;
    }
  }

  /** 403 unless every section of [perms] fits [workspace]'s ceiling. */
  private assertInsideWorkspace(
    workspace: AdminWorkspace,
    perms: AdminPermissions,
  ): void {
    const out = outsideWorkspace(workspace, perms);
    if (out.length === 0) return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: `These sections are outside the «${workspace}» workspace and cannot be granted: ${out.join(', ')}.`,
    });
  }

  /** 403 when the head's team already holds `staff.head.max_admins` people
   * (the owner sets the number; the head and the partner/deputy accounts
   * that default into the same workspace do not count). */
  private async assertHeadSeat(workspace: AdminWorkspace): Promise<void> {
    if (!this.staff) return;
    const max = await this.staff.number('staff.head.max_admins');
    const team = await this.prisma.adminProfile.findMany({
      where: {
        workspace,
        is_workspace_head: false,
        admin_role: { not: 'super_admin' },
        user: { deleted_at: null },
      },
      select: { permissions: true },
      take: max + 1000,
    });
    const staff = team.filter(
      (t) => !readPartner(t.permissions) && !readManageAdmins(t.permissions),
    ).length;
    if (staff >= max) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `Your team is full (${max} people). Ask the owner to raise the limit.`,
      });
    }
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
    noPii: readNoPii(u.admin_profile?.permissions),
    countries: readCountries(u.admin_profile?.permissions),
    workspace: workspaceOfRow(u),
    workspaceHead: u.admin_profile?.is_workspace_head === true,
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

/** Staff package T2: [actor] is the head of a workspace right now (the
 * guard sets `workspaceHead` only while workspaces and the head role are
 * on, and never for the owner, the deputy or a partner's team). */
const isHead = (actor: AdminActor): boolean =>
  !isSuper(actor) &&
  actor.workspaceHead === true &&
  !!actor.workspace &&
  actor.workspace !== 'owner';

/** The workspace an admin works in (the super admin is always the owner). */
function workspaceOfRow(u: AdminRow): AdminWorkspace {
  return effectiveWorkspace(
    u.admin_profile?.admin_role ?? 'support',
    u.admin_profile?.workspace,
  );
}

/** The workspace a role belongs to, as the migration backfill did; an
 * admin who stays on a staff role keeps the workspace they have. */
function workspaceForRole(
  role: AdminRoleName,
  current: AdminWorkspace | null,
): AdminWorkspace {
  if (role === 'super_admin') return 'owner';
  if (role === 'finance') return 'finance';
  return current === null || current === 'owner' || current === 'finance'
    ? 'mass'
    : current;
}

/** A head's whole reach: staff of the head's own workspace, not the owner,
 * not the deputy, not a partner's team, not another head. */
function inHeadSpace(actor: AdminActor, target: AdminRow): boolean {
  const prof = target.admin_profile;
  if (!prof || prof.admin_role === 'super_admin') return false;
  if (readManageAdmins(prof.permissions) || readPartner(prof.permissions)) {
    return false;
  }
  return workspaceOfRow(target) === actor.workspace;
}

/** May [actor] touch this admin? The super admin: anyone. A manager: only a
 * non-super, non-manager admin whose access fits inside the manager's own. */
function reaches(actor: AdminActor, target: AdminRow): boolean {
  if (isSuper(actor)) return true;
  const prof = target.admin_profile;
  if (!prof || prof.admin_role === 'super_admin') return false;
  if (readManageAdmins(prof.permissions)) return false;
  // Owner 2026-10-16: an admin holding money, economy, budget caps or the
  // audit log, or masked from personal data by the owner, is the owner's
  // to change; a masked manager may only touch masked staff.
  if (hasSuperGrantOnly(parsePermissions(prof.permissions))) return false;
  if (readNoPii(prof.permissions) && !actor.noPii) return false;
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
  // Staff package T2: a head reaches the workers of their own workspace
  // (never another head), whose sections fit the workspace ceiling.
  if (isHead(actor)) {
    return (
      inHeadSpace(actor, target) &&
      !prof.is_workspace_head &&
      outsideWorkspace(
        workspaceOfRow(target),
        parsePermissions(prof.permissions),
      ).length === 0
    );
  }
  return covers(actor.permissions ?? {}, parsePermissions(prof.permissions));
}

const outsideReach = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message:
      'You can only grant or change access you hold yourself, and only for admins within it.',
  });

/** 409: the workspace rules refuse this (second head, finance head, …). */
const workspaceConflict = (message: string) =>
  new ConflictException({ code: ErrorCode.ADMIN_WORKSPACE_CONFLICT, message });

const headTaken = (workspace: AdminWorkspace | null) =>
  workspaceConflict(
    workspace
      ? `The «${workspace}» workspace already has a head. Clear the current one first.`
      : 'This workspace already has a head. Clear the current one first.',
  );

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
