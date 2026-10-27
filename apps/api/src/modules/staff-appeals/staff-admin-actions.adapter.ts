import { Injectable } from '@nestjs/common';
import { AdminsService } from '../admin/admins.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type {
  AdminActionRequest,
  StaffAdminActionsPort,
} from './staff-admin-actions.port';

/**
 * Staff package T10: the real binding of STAFF_ADMIN_ACTIONS (T6 left it as
 * «runs nothing»). Both follow-ups of an appeal decision — fire the head, fire
 * the worker — and «replace» on a suggestion are the same existing call that
 * the administrators' page makes: `POST admin/admins/:id/disable`
 * (AdminsService.setEnabled(false): status suspended, every session closed,
 * audit row). The owner's fresh 2FA step-up was already checked by the
 * controller that led here.
 */
@Injectable()
export class StaffAdminActionsAdapter implements StaffAdminActionsPort {
  constructor(private readonly admins: AdminsService) {}

  async disable(actor: AdminActor, targetAdminId: string): Promise<void> {
    await this.admins.setEnabled(actor, targetAdminId, false);
  }

  async apply(req: AdminActionRequest): Promise<{ applied: boolean }> {
    // Without the acting owner the call cannot be made as them: report it
    // as not applied, the owner then presses the named call himself.
    if (!req.actor) return { applied: false };
    await this.disable(req.actor, req.targetAdminId);
    return { applied: true };
  }
}
