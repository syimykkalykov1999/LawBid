import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { LEASE_REASON } from '../../common/staff-events';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  canAccess,
  parsePermissions,
  readManageAdmins,
  readNoPii,
  readPartner,
} from '../admin-auth/admin-permissions';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { LeaseService } from './lease.service';
import { StaffPresenceService } from './staff-presence.service';
import type {
  LeaseDto,
  TeamReassignDto,
  TeamReleaseDto,
  TeamViewDto,
} from './work-lease.dto';
import { leaseSourceFor } from './lease-queue-sources';

const TEAM_LIMIT = 500;

/**
 * Staff package T3 (plan B1, «Стол команды»): what the workspace head and
 * the owner see and may do — who holds what, and force release / reassign.
 * Rights: the owner (super admin) over everyone; a head only over staff of
 * their own workspace (and only while `staff.head_enabled` is on). Every
 * change is audited; the route also demands a fresh 2FA code (no
 * second admin, ever).
 */
@Injectable()
export class LeaseTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeaseService,
    private readonly presence: StaffPresenceService,
    private readonly staff: StaffSettingsService,
    private readonly audit: AuditLogService,
  ) {}

  /** Throws unless [actor] may manage [targetId]; returns the target's workspace. */
  async assertMayManage(actor: AdminActor, targetId: string): Promise<string> {
    const target = await this.prisma.adminProfile.findUnique({
      where: { user_id: targetId },
      select: { workspace: true, admin_role: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    if (actor.adminRole === 'super_admin') return target.workspace;
    const headOn = await this.staff.isOn('staff.head_enabled');
    if (
      !headOn ||
      !actor.workspaceHead ||
      target.admin_role === 'super_admin' ||
      (actor.workspace ?? 'mass') !== target.workspace
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the owner or the head of this workspace may do this.',
      });
    }
    return target.workspace;
  }

  private async assertCanWork(adminId: string, kind: string): Promise<void> {
    const src = leaseSourceFor(kind);
    const to = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: {
        status: true,
        deleted_at: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
      },
    });
    const p = to?.admin_profile;
    if (
      !src ||
      !to ||
      to.status !== 'active' ||
      to.deleted_at ||
      !p ||
      !canAccess(
        p.admin_role,
        parsePermissions(p.permissions),
        src.routePath,
        'POST',
        readManageAdmins(p.permissions),
        readPartner(p.permissions),
        readNoPii(p.permissions),
      )
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'The receiver cannot work this queue.',
      });
    }
  }

  /** The team tiles: status, what each person holds, how many they closed today. */
  async tiles(actor: AdminActor): Promise<TeamViewDto> {
    const headOn = await this.staff.isOn('staff.head_enabled');
    if (actor.adminRole !== 'super_admin' && !(headOn && actor.workspaceHead)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the owner or a workspace head sees the team.',
      });
    }
    const profiles = await this.prisma.adminProfile.findMany({
      where: {
        admin_role: { not: 'super_admin' },
        ...(actor.adminRole === 'super_admin'
          ? {}
          : { workspace: actor.workspace ?? 'mass' }),
      },
      select: { user_id: true, admin_role: true },
      orderBy: { user_id: 'asc' },
      take: TEAM_LIMIT,
    });
    const ids = profiles.map((p) => p.user_id);
    if (ids.length === 0) return { tiles: [] };
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [users, held, done, readings, cfg] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, first_name: true, last_name: true },
      }),
      this.prisma.workLease.findMany({
        where: { admin_id: { in: ids } },
        orderBy: { taken_at: 'asc' },
      }),
      this.prisma.workLeaseEvent.groupBy({
        by: ['admin_id'],
        where: {
          admin_id: { in: ids },
          event: 'done',
          created_at: { gte: dayStart },
        },
        _count: { _all: true },
      }),
      this.presence.readMany(ids),
      this.staff.get(),
    ]);
    const name = new Map(
      users.map((u) => [
        u.id,
        [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
      ]),
    );
    const doneBy = new Map(done.map((d) => [d.admin_id, d._count._all]));
    const now = Date.now();
    return {
      tiles: profiles.map((p) => {
        const reading = readings.get(p.user_id);
        return {
          adminId: p.user_id,
          name: name.get(p.user_id) ?? null,
          role: p.admin_role,
          status: reading
            ? this.presence.statusOf(
                reading,
                now,
                cfg.numbers['staff.presence.active_window_sec'],
              )
            : 'offline',
          items: held
            .filter((h) => h.admin_id === p.user_id)
            .map((h) => ({
              kind: h.kind,
              itemId: h.item_id,
              takenAt: h.taken_at?.toISOString() ?? null,
              leasedUntil: h.leased_until?.toISOString() ?? null,
              heldMinutes: h.taken_at
                ? Math.max(0, Math.round((now - h.taken_at.getTime()) / 60_000))
                : 0,
            })),
          doneToday: doneBy.get(p.user_id) ?? 0,
        };
      }),
    };
  }

  /** Takes one item (or everything) away from [targetId]; it goes to the next person in line. */
  async release(
    actor: AdminActor,
    targetId: string,
    dto: TeamReleaseDto,
  ): Promise<number> {
    await this.assertMayManage(actor, targetId);
    let released = 0;
    if (dto.kind && dto.itemId) {
      if (!leaseSourceFor(dto.kind)) return 0;
      released = (await this.leases.forceRelease(
        dto.kind,
        dto.itemId,
        targetId,
      ))
        ? 1
        : 0;
    } else {
      released = await this.leases.releaseAllFor(targetId, LEASE_REASON.forced);
    }
    await this.audit.record({
      adminId: actor.id,
      action: 'staff.lease_force_release',
      targetType: 'admin',
      targetId,
      before: { kind: dto.kind ?? 'all', itemId: dto.itemId ?? null },
      after: { released },
      ip: actor.ip,
      justification: dto.reason ?? null,
    });
    return released;
  }

  /** Hands one held item from [fromId] to [dto.toAdminId]. */
  async reassign(
    actor: AdminActor,
    fromId: string,
    dto: TeamReassignDto,
  ): Promise<LeaseDto> {
    await this.assertMayManage(actor, fromId);
    // The receiver must be inside the same limits as the giver's head and
    // be allowed to work this queue themselves.
    await this.assertMayManage(actor, dto.toAdminId);
    await this.assertCanWork(dto.toAdminId, dto.kind);
    const lease = await this.leases.reassign(
      dto.kind,
      dto.itemId,
      fromId,
      dto.toAdminId,
    );
    if (!lease) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message:
          'That item is not held by this person, or cannot go to the receiver.',
      });
    }
    await this.audit.record({
      adminId: actor.id,
      action: 'staff.lease_reassign',
      targetType: 'admin',
      targetId: fromId,
      before: { kind: dto.kind, itemId: dto.itemId, from: fromId },
      after: { to: dto.toAdminId },
      ip: actor.ip,
      justification: dto.reason ?? null,
    });
    return {
      kind: lease.kind,
      itemId: lease.itemId,
      takenAt: lease.takenAt.toISOString(),
      leasedUntil: lease.leasedUntil.toISOString(),
      attempt: lease.attempt,
    };
  }
}
