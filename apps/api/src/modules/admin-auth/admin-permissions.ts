import type { AdminRole } from '@prisma/client';

/**
 * Per-area access for admins other than the super admin (owner
 * 2026-10-02). The super admin toggles each area to `view` (GET only) or
 * `manage`. Money and API keys are never grantable: those routes answer 403
 * to everyone but the super admin, whatever the toggles say.
 */
export const ADMIN_AREAS = [
  'dashboard',
  'users',
  'verification',
  'moderation',
  'content',
  'media',
  'cases',
  'support',
  'email_templates',
  'broadcasts',
  'localization',
  'settings',
  'legal',
  'data_requests',
  'teams',
  'exports',
  'sanctions',
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

export const ACCESS_LEVELS = ['view', 'manage'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type AdminPermissions = Partial<Record<AdminArea, AccessLevel>>;

/** Sections only the super admin ever reaches. */
export const SUPER_ONLY_AREAS = [
  'money', // billing, subscriptions, promotions, referrals (payouts, refunds)
  'keys', // integrations: Stripe, FCM, Bunny, SES, Sentry, ...
  'admins', // accounts, roles, passwords
  'audit', // audit log
  'sessions', // everyone's sessions
] as const;
export type SuperOnlyArea = (typeof SUPER_ONLY_AREAS)[number];

type RouteArea = AdminArea | SuperOnlyArea | 'auth' | 'unknown';

/** First path segment after `/admin/` → area. Unknown segments map to
 * `unknown`, which only the super admin reaches, so a new controller is
 * closed by default. */
const SEGMENT_AREA: Record<string, RouteArea> = {
  auth: 'auth',
  dashboard: 'dashboard',
  users: 'users',
  verification: 'verification',
  'client-badges': 'verification',
  moderation: 'moderation',
  'review-appeals': 'moderation',
  overview: 'content',
  content: 'content',
  'practice-areas': 'content',
  media: 'media',
  bids: 'cases',
  cases: 'cases',
  'case-disputes': 'cases',
  support: 'support',
  'contact-issues': 'cases',
  'email-templates': 'email_templates',
  broadcasts: 'broadcasts',
  i18n: 'localization',
  'feature-flags': 'settings',
  config: 'settings',
  'legal-documents': 'legal',
  'data-requests': 'data_requests',
  teams: 'teams',
  export: 'exports',
  billing: 'money',
  subscriptions: 'money',
  promotions: 'money',
  referrals: 'money',
  integrations: 'keys',
  admins: 'admins',
  'audit-log': 'audit',
  sessions: 'sessions',
  sanctions: 'sanctions',
};

/** `/api/v1/admin/users/123?x=1` → `users`; null when not an admin route. */
export function routeArea(path: string): RouteArea | null {
  const m = /\/admin\/([^/?#]+)/.exec(path);
  if (!m) return null;
  return SEGMENT_AREA[m[1]] ?? 'unknown';
}

export function isSuperOnlyArea(a: RouteArea): a is SuperOnlyArea {
  return (SUPER_ONLY_AREAS as readonly string[]).includes(a);
}

/** Key inside `admin_profiles.permissions` for the right to manage other
 * admins (owner 2026-10-02). Only the super admin hands it out, and it is
 * never grantable by an admin who holds it. */
export const MANAGE_ADMINS_KEY = 'manage_admins';

export function readManageAdmins(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)[MANAGE_ADMINS_KEY] === true;
}

/** The JSON stored in `admin_profiles.permissions`. */
export function storePermissions(
  areas: AdminPermissions,
  manageAdmins: boolean,
): Record<string, string | boolean> {
  return manageAdmins ? { ...areas, [MANAGE_ADMINS_KEY]: true } : { ...areas };
}

const LEVEL_RANK: Record<AccessLevel, number> = { view: 1, manage: 2 };

/** True when `inner` asks for nothing `outer` does not already hold. */
export function covers(
  outer: AdminPermissions,
  inner: AdminPermissions,
): boolean {
  return ADMIN_AREAS.every((area) => {
    const want = inner[area];
    if (!want) return true;
    const have = outer[area];
    return have !== undefined && LEVEL_RANK[have] >= LEVEL_RANK[want];
  });
}

/** `inner` limited to what `outer` holds (levels capped). */
export function intersect(
  outer: AdminPermissions,
  inner: AdminPermissions,
): AdminPermissions {
  const out: AdminPermissions = {};
  for (const area of ADMIN_AREAS) {
    const want = inner[area];
    const have = outer[area];
    if (!want || !have) continue;
    out[area] = LEVEL_RANK[want] <= LEVEL_RANK[have] ? want : have;
  }
  return out;
}

export function levelForMethod(method: string): AccessLevel {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
    ? 'view'
    : 'manage';
}

/** Stored JSON → clean map (unknown areas and levels dropped). */
export function parsePermissions(raw: unknown): AdminPermissions {
  const out: AdminPermissions = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const area of ADMIN_AREAS) {
    const v = (raw as Record<string, unknown>)[area];
    if (v === 'view' || v === 'manage') out[area] = v;
  }
  return out;
}

export function grants(
  perms: AdminPermissions,
  area: AdminArea,
  need: AccessLevel,
): boolean {
  const have = perms[area];
  return have === 'manage' || (have === 'view' && need === 'view');
}

/**
 * The one access decision. The super admin passes everywhere. Anyone else
 * needs a toggle for the route's area at the right level; `auth` routes
 * (own session) are open to every admin; `admins` needs the
 * manage-admins right; the other super-only areas are closed.
 */
export function canAccess(
  role: AdminRole,
  perms: AdminPermissions,
  path: string,
  method: string,
  manageAdmins = false,
): boolean {
  if (role === 'super_admin') return true;
  const area = routeArea(path);
  if (!area || area === 'unknown') return false;
  if (area === 'auth') return true;
  // Admin management: only an admin the super admin gave that right; the
  // service narrows it further (what they may grant or touch).
  if (area === 'admins') return manageAdmins;
  if (isSuperOnlyArea(area)) return false;
  return grants(perms, area, levelForMethod(method));
}

/** Starting toggles for a new admin of a given role (same as the
 * migration backfill); the super admin can change every one afterwards. */
export function defaultPermissionsForRole(role: AdminRole): AdminPermissions {
  switch (role) {
    case 'moderator':
      return {
        dashboard: 'view',
        moderation: 'manage',
        content: 'manage',
        media: 'manage',
        users: 'view',
      };
    case 'verifier':
      return { dashboard: 'view', verification: 'manage', users: 'view' };
    case 'support':
      return { dashboard: 'view', support: 'manage', users: 'view' };
    case 'finance':
      return { dashboard: 'view', support: 'view', users: 'view' };
    default:
      return {};
  }
}
