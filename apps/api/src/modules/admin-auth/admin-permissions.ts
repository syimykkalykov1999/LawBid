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
  'outreach',
  // Owner 2026-10-05: staff salaries (finance admin); the super admin and
  // the deputy who manages admins always have it.
  'payroll',
  // Owner 2026-10-06: a country partner's accountant — their country's
  // revenue report and settlements, read only. Only inside a partner team.
  'partner_report',
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
  'rewards', // owner 2026-10-05: «Лучший сотрудник» (prizes, bonuses)
] as const;
export type SuperOnlyArea = (typeof SUPER_ONLY_AREAS)[number];

type RouteArea =
  | AdminArea
  | SuperOnlyArea
  | 'auth'
  | 'workspace'
  | 'partner_portal'
  | 'unknown';

/** Sections whose every view is written to the audit log (who looked at
 * money). Exports are audited by the export endpoint itself. */
export const VIEW_AUDITED_AREAS: ReadonlySet<RouteArea> = new Set([
  'money',
  'payroll',
]);

/** First path segment after `/admin/` → area. Unknown segments map to
 * `unknown`, which only the super admin reaches, so a new controller is
 * closed by default. */
const SEGMENT_AREA: Record<string, RouteArea> = {
  auth: 'auth',
  dashboard: 'dashboard',
  users: 'users',
  verification: 'verification',
  'client-badges': 'verification',
  // Owner 2026-10-05: attorney trust levels.
  trust: 'verification',
  // Owner 2026-10-05: repeat accounts of blocked fraudsters (clients).
  fraud: 'verification',
  moderation: 'moderation',
  'review-appeals': 'moderation',
  overview: 'content',
  content: 'content',
  'practice-areas': 'content',
  'document-templates': 'content',
  media: 'media',
  bids: 'cases',
  cases: 'cases',
  'case-disputes': 'cases',
  support: 'support',
  'contact-issues': 'support',
  'email-templates': 'email_templates',
  broadcasts: 'broadcasts',
  i18n: 'localization',
  // Owner 2026-10-05: Система → Страны.
  countries: 'localization',
  'feature-flags': 'settings',
  config: 'settings',
  // Owner 2026-10-05: Система → Хранилище.
  storage: 'settings',
  'legal-documents': 'legal',
  // Owner 2026-10-05 (legal): DMCA notices, disclaimers, incident contact.
  legal: 'legal',
  'data-requests': 'data_requests',
  teams: 'teams',
  export: 'exports',
  billing: 'money',
  subscriptions: 'money',
  promotions: 'money',
  referrals: 'money',
  partners: 'money',
  // Owner 2026-10-06: the owner's page of country partners.
  'country-partners': 'money',
  // …and the partner team's own page (report, goals, contract).
  'country-partner': 'partner_portal',
  'case-payments': 'money', // client → attorney payments (Stripe Connect)
  // Owner 2026-10-05: «Прибыль и резерв» (the monthly split of the balance).
  treasury: 'money',
  integrations: 'keys',
  admins: 'admins',
  'audit-log': 'audit',
  sessions: 'sessions',
  sanctions: 'sanctions',
  outreach: 'outreach',
  payroll: 'payroll',
  rewards: 'rewards',
  // Owner 2026-10-05: every admin's own workspace (it lists only what the
  // admin's areas allow).
  workspace: 'workspace',
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

/** Key inside `admin_profiles.permissions` for the countries an employee
 * works with (owner 2026-10-05): a verifier hired for Canada sees only
 * Canadian people, cases and tickets. Absent or empty = every country. */
export const COUNTRIES_KEY = 'countries';

/** Stored JSON → the assigned country codes (empty = every country). */
export function readCountries(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const v = (raw as Record<string, unknown>)[COUNTRIES_KEY];
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.filter(
        (c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c),
      ),
    ),
  ].sort();
}

/** Owner 2026-10-06: keys inside `admin_profiles.permissions` of a
 * country partner's team. `country_partner` = the partner's id (every
 * member, the lead included); `partner_lead` = the partner themself, who
 * hires and manages their own team only. */
export const COUNTRY_PARTNER_KEY = 'country_partner';
export const PARTNER_LEAD_KEY = 'partner_lead';

export interface PartnerMembership {
  partnerId: string;
  lead: boolean;
}

/** Stored JSON → the partner team this admin belongs to (null = staff of
 * the owner). */
export function readPartner(raw: unknown): PartnerMembership | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = r[COUNTRY_PARTNER_KEY];
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { partnerId: id, lead: r[PARTNER_LEAD_KEY] === true };
}

/**
 * The most a country partner's team can ever hold (owner 2026-10-06):
 * the simple day-to-day work in their own country. Prices, payouts,
 * keys, legal texts, flags, settings, translations of every language,
 * broadcasts, admins of the owner and other countries stay closed; user
 * accounts are read only (no deleting people or money).
 */
export const PARTNER_TEAM_MAX: AdminPermissions = {
  dashboard: 'view',
  users: 'view',
  verification: 'manage',
  moderation: 'manage',
  content: 'manage',
  media: 'manage',
  cases: 'manage',
  support: 'manage',
  outreach: 'manage',
  partner_report: 'view',
};

/** The JSON stored in `admin_profiles.permissions`. */
export function storePermissions(
  areas: AdminPermissions,
  manageAdmins: boolean,
  countries: readonly string[] = [],
  partner: PartnerMembership | null = null,
): Record<string, string | boolean | string[]> {
  const out: Record<string, string | boolean | string[]> = {
    ...(partner ? intersect(PARTNER_TEAM_MAX, areas) : areas),
  };
  // A partner's team never gets the owner's deputy right.
  if (manageAdmins && !partner) out[MANAGE_ADMINS_KEY] = true;
  if (countries.length > 0) out[COUNTRIES_KEY] = [...countries];
  if (partner) {
    out[COUNTRY_PARTNER_KEY] = partner.partnerId;
    if (partner.lead) out[PARTNER_LEAD_KEY] = true;
  }
  return out;
}

/**
 * The countries an admin's lists are limited to on this request, or null
 * for every country. The super admin works everywhere; anyone else in
 * the countries assigned to them (none assigned = everywhere). The
 * country tab picked in the panel (`X-Admin-Country`) narrows it further
 * when it is one of those.
 */
export function effectiveCountries(
  isSuper: boolean,
  assigned: readonly string[],
  picked: string | undefined,
): string[] | null {
  const base = isSuper || assigned.length === 0 ? null : [...assigned];
  const tab = (picked ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(tab)) return base;
  if (base === null || base.includes(tab)) return [tab];
  return base;
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
  partner: PartnerMembership | null = null,
): boolean {
  if (role === 'super_admin') return true;
  const area = routeArea(path);
  if (!area || area === 'unknown') return false;
  if (area === 'auth' || area === 'workspace') return true;
  // Owner 2026-10-06: a country partner's team works only inside the
  // partner limits, whatever was stored; the lead manages their own team
  // (AdminsService narrows it to that team).
  if (partner) {
    if (area === 'partner_portal') return true;
    if (area === 'admins') return partner.lead;
    if (isSuperOnlyArea(area)) return false;
    const capped = intersect(PARTNER_TEAM_MAX, perms);
    return grants(capped, area, levelForMethod(method));
  }
  if (area === 'partner_portal') return false;
  // Admin management: only an admin the super admin gave that right; the
  // service narrows it further (what they may grant or touch).
  if (area === 'admins') return manageAdmins;
  // Owner 2026-10-05: the trusted deputy (the admin who manages admins)
  // reads every section — money, audit, sessions included — but never the
  // keys, runs payroll alongside the super admin, and changes other
  // sections only where a toggle says so.
  if (manageAdmins && area === 'payroll') return true;
  if (manageAdmins && area !== 'keys' && levelForMethod(method) === 'view')
    return true;
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
      return {
        dashboard: 'view',
        support: 'view',
        users: 'view',
        payroll: 'manage',
      };
    default:
      return {};
  }
}
