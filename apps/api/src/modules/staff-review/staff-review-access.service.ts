import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminWorkspace } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { ROLE_ITEM_KINDS } from '../staff-rating/staff-sampling.service';

/** Trust tier (staff_member_states.trust_tier) from which a worker is «senior». */
export const SENIOR_TIER = 3;

export type ReviewLevel = 'owner' | 'head' | 'senior';

export interface ReviewAccess {
  level: ReviewLevel;
  /** null = every workspace (the owner). */
  workspace: AdminWorkspace | null;
  /** Decision kinds a senior may re-check (null = any: owner and head). */
  kinds: readonly string[] | null;
}

export const reviewNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

/**
 * Staff package T9: who may re-check, and the switches the re-check lives
 * behind. The owner and a workspace head re-check their scope; a worker
 * only as a senior (trust tier 3, active). The head is read from the
 * database, never from the guard flag (the guard sets `workspaceHead` only
 * while the workspace switches are on). Everyone else — and every request
 * while the re-check is off — gets «not found», like a section that is not
 * theirs.
 */
@Injectable()
export class StaffReviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
  ) {}

  /** The re-check exists only with the rating and the sampling on. */
  async assertOn(): Promise<void> {
    const s = await this.settings.get();
    if (
      !s.switches['staff.rating_enabled'] ||
      !s.switches['staff.sampling_enabled']
    ) {
      throw reviewNotFound();
    }
  }

  async resolve(
    admin: Pick<RequestAdmin, 'id' | 'adminRole' | 'manageAdmins' | 'partner'>,
  ): Promise<ReviewAccess | null> {
    if (admin.adminRole === 'super_admin') {
      return { level: 'owner', workspace: null, kinds: null };
    }
    const me = await this.prisma.adminProfile.findUnique({
      where: { user_id: admin.id },
      select: { workspace: true, is_workspace_head: true, admin_role: true },
    });
    if (!me) return null;
    if (me.workspace === 'owner') {
      return { level: 'owner', workspace: null, kinds: null };
    }
    if (me.is_workspace_head && !admin.manageAdmins && !admin.partner) {
      return { level: 'head', workspace: me.workspace, kinds: null };
    }
    const st = await this.prisma.staffMemberState.findUnique({
      where: { admin_id: admin.id },
      select: { trust_tier: true, state: true },
    });
    if (st && st.state === 'active' && st.trust_tier >= SENIOR_TIER) {
      return {
        level: 'senior',
        workspace: me.workspace,
        kinds: ROLE_ITEM_KINDS[me.admin_role],
      };
    }
    return null;
  }

  /** The switches are on and the admin may re-check; else «not found». */
  async require(
    admin: Pick<RequestAdmin, 'id' | 'adminRole' | 'manageAdmins' | 'partner'>,
  ): Promise<ReviewAccess> {
    await this.assertOn();
    const a = await this.resolve(admin);
    if (!a) throw reviewNotFound();
    return a;
  }

  /** Owner or head only (golden marking, team, stats). */
  async requireHead(
    admin: Pick<RequestAdmin, 'id' | 'adminRole' | 'manageAdmins' | 'partner'>,
  ): Promise<ReviewAccess> {
    const a = await this.require(admin);
    if (a.level === 'senior') throw reviewNotFound();
    return a;
  }
}
