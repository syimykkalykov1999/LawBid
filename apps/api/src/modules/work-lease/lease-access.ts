import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { canAccess, routeArea } from '../admin-auth/admin-permissions';
import { workspaceAllows } from '../staff-core/workspace-scope';
import { leaseSourceFor } from './lease-queue-sources';

/**
 * Staff package T3: may this admin work this queue? The desk routes
 * (`admin/desk/*`) are open to every signed-in staff member, so the right
 * to the queue itself is checked here with the very same rule the queue's
 * own admin routes use (area toggle + country partner cap + no-PII + the
 * workspace ceiling while `staff.workspaces_enabled` is on).
 */
export function canWorkQueue(
  admin: AdminActor,
  kind: string,
  workspacesOn: boolean,
): boolean {
  const src = leaseSourceFor(kind);
  if (!src) return false;
  const allowed = canAccess(
    admin.adminRole,
    admin.permissions ?? {},
    src.routePath,
    'POST',
    admin.manageAdmins ?? false,
    admin.partner ?? null,
    admin.noPii ?? false,
  );
  if (!allowed) return false;
  if (!workspacesOn) return true;
  return workspaceAllows(
    {
      role: admin.adminRole,
      workspace: admin.workspace ?? 'mass',
      deputy: admin.manageAdmins ?? false,
      partner: !!admin.partner,
    },
    routeArea(src.routePath),
  );
}
