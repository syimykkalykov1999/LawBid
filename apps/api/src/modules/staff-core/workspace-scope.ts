import type { AdminRole, AdminWorkspace } from '@prisma/client';

/**
 * Staff package T1 (plan C3, «Пространства»): the most a staff member of
 * each workspace can reach, ON TOP of their own area toggles. Applied by
 * AdminAuthGuard only while `staff.workspaces_enabled` is on; an area
 * outside the list answers 404 (+ an audit row), like any section the
 * admin has no right to — the server denies by default.
 *  - owner: everything (the super admin is always the owner);
 *  - mass: queues and people (verification, moderation, support, …) — no
 *    money, keys, settings, audit, exports, legal requests;
 *  - finance: money, payroll, economy, budget caps.
 * The trusted deputy (manage_admins) and a country partner's team stay
 * outside the workspaces (plan question 1, «Партнёр страны НЕ трогаем»).
 * T2 refines the ceilings (WORKSPACE_MAX in admin-permissions.ts).
 */
export const WORKSPACE_AREAS: Readonly<
  Record<Exclude<AdminWorkspace, 'owner'>, readonly string[]>
> = {
  mass: [
    'dashboard',
    'users',
    'verification',
    'moderation',
    'content',
    'media',
    'cases',
    'support',
    'chats',
    'outreach',
    'sanctions',
    'teams',
    'on_call',
  ],
  finance: [
    'dashboard',
    'money',
    'economy',
    'budget_limits',
    'payroll',
    'on_call',
  ],
};

/** Route areas every signed-in admin keeps (sign-in, own workspace page). */
const ALWAYS_OPEN = new Set(['auth', 'workspace']);

/** The workspace an admin works in: the super admin is always the owner. */
export function effectiveWorkspace(
  role: AdminRole,
  stored: AdminWorkspace | null | undefined,
): AdminWorkspace {
  if (role === 'super_admin') return 'owner';
  return stored ?? 'mass';
}

export interface WorkspaceSubject {
  role: AdminRole;
  workspace: AdminWorkspace;
  /** The trusted deputy (manage_admins): outside the workspaces. */
  deputy: boolean;
  /** A country partner's team member: outside the workspaces. */
  partner: boolean;
}

/** True when [area] (routeArea of the request; null = not an admin
 * route) lies inside the admin's workspace. Pure, no I/O. */
export function workspaceAllows(
  who: WorkspaceSubject,
  area: string | null,
): boolean {
  if (who.role === 'super_admin' || who.deputy || who.partner) return true;
  if (who.workspace === 'owner') return true;
  if (area === null || ALWAYS_OPEN.has(area)) return true;
  return WORKSPACE_AREAS[who.workspace].includes(area);
}
