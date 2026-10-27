import type { AppealDecision } from './staff-appeals.logic';

/**
 * Staff package T6: what the owner's decision on an appeal asks the
 * admin-management side to do. The decision itself only records itself
 * (appeal row + audit row); the person is then taken off the work by the
 * EXISTING admin-management calls, named in `FOLLOW_UP`:
 *  - fire_head   -> POST admin/admins/:id/disable (AdminsController.disable)
 *  - fire_worker -> POST admin/staff/actions/offboard/:adminId (T2, plan B3)
 *
 * TODO(T2 merged): bind STAFF_ADMIN_ACTIONS to an adapter that calls
 * AdminsService.setEnabled / the offboard service. Until then the default
 * `PendingAdminActions` runs nothing, so the answer carries
 * `followUp.applied = false` and the owner presses the named call himself
 * in the administrators list (never a silent firing).
 */
export const STAFF_ADMIN_ACTIONS = Symbol('STAFF_ADMIN_ACTIONS');

export const FOLLOW_UP: Readonly<
  Record<
    Exclude<AppealDecision, 'nothing'>,
    { call: string; target: 'head' | 'author' }
  >
> = {
  fire_head: { call: 'POST admin/admins/{id}/disable', target: 'head' },
  fire_worker: {
    call: 'POST admin/staff/actions/offboard/{adminId}',
    target: 'author',
  },
};

export interface AdminActionRequest {
  decision: Exclude<AppealDecision, 'nothing'>;
  appealId: string;
  /** The person to act on; resolved on the server, never sent to the client
   * for an anonymous author. */
  targetAdminId: string;
  ownerId: string;
}

export interface StaffAdminActionsPort {
  apply(req: AdminActionRequest): Promise<{ applied: boolean }>;
}

export class PendingAdminActions implements StaffAdminActionsPort {
  apply(): Promise<{ applied: boolean }> {
    return Promise.resolve({ applied: false });
  }
}
