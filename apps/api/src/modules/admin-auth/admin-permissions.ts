import type { AdminRole, AdminWorkspace } from '@prisma/client';
import { WORKSPACE_AREAS } from '../staff-core/workspace-scope';

/**
 * Per-area access for admins other than the super admin (owner
 * 2026-10-02). The super admin toggles each area to `view` (GET only) or
 * `manage`. API keys, admin management, admin sessions and rewards are never
 * grantable (SUPER_ONLY_AREAS). Owner 2026-10-16: money, economy, budget
 * limits and the audit log are now grantable — but only the super admin
 * hands them out (SUPER_GRANT_ONLY_AREAS).
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
  // Owner 2026-10-16: grantable money (subscriptions, billing, promotions,
  // referrals, partners, treasury, analytics) for an accountant.
  'money',
  // …the «Экономика» card (revenue vs third-party spend); the area key is
  // registered here, its routes live under /admin/economy.
  'economy',
  // …the provider budget caps in Настройки (/admin/config/budgets).
  'budget_limits',
  // …support conversations (/admin/chats).
  'chats',
  // …the audit log: everybody's rows instead of only one's own.
  'audit',
  // Owner 2026-10-22: «Дежурный» — gets the system alerts (push + e-mail)
  // from the watchdog; each admin can still switch it off in Профиль.
  'on_call',
  // Owner 2026-10-27: «Продвижение» — SEO switches, store/channel checklist
  // (/admin/promotion). Hand out like any other area; nobody has it by default.
  'promotion',
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

export const ACCESS_LEVELS = ['view', 'manage'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type AdminPermissions = Partial<Record<AdminArea, AccessLevel>>;

/** Sections only the super admin ever reaches. */
export const SUPER_ONLY_AREAS = [
  'keys', // integrations: Stripe, FCM, Bunny, SES, Sentry, ...
  'admins', // accounts, roles, passwords
  'sessions', // everyone's sessions
  'rewards', // owner 2026-10-05: «Лучший сотрудник» (prizes, bonuses)
] as const;
export type SuperOnlyArea = (typeof SUPER_ONLY_AREAS)[number];

/** Grantable, but only the super admin may hand them out (a deputy who
 * manages admins cannot give money or the audit log to anyone). */
export const SUPER_GRANT_ONLY_AREAS: readonly AdminArea[] = [
  'money',
  'economy',
  'budget_limits',
  'audit',
];

/** True when [perms] holds an area only the super admin may grant. */
export function hasSuperGrantOnly(perms: AdminPermissions): boolean {
  return SUPER_GRANT_ONLY_AREAS.some((a) => perms[a] !== undefined);
}

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
  // Owner 2026-10-28: the only admin read path for private chats, calls
  // and case files (reason code + audit + 2FA step-up; see AdminPrivateContent).
  'private-content': 'moderation',
  'review-appeals': 'moderation',
  // Owner 2026-10-20: group chats (remove members, close groups).
  'group-chats': 'moderation',
  overview: 'content',
  content: 'content',
  'practice-areas': 'content',
  'document-templates': 'content',
  media: 'media',
  // Owner 2026-10-15: Поиск → Синонимы, запросы без результатов.
  search: 'content',
  // Owner 2026-10-15: the app's own crash reports.
  crashes: 'settings',
  // Owner 2026-10-15: own analytics shows what was bought: money area.
  analytics: 'money',
  // Owner 2026-10-16: revenue vs third-party spend card.
  economy: 'economy',
  // …support conversations.
  chats: 'chats',
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
  // Stripe robustness 2026-10-27: «Проверки Stripe» (super admin only).
  'stripe-review': 'money',
  // Owner 2026-10-05: «Прибыль и резерв» (the monthly split of the balance).
  treasury: 'money',
  integrations: 'keys',
  admins: 'admins',
  'audit-log': 'audit',
  sessions: 'sessions',
  sanctions: 'sanctions',
  // Staff package T11: reveal of masked contacts and the watermark text; the
  // route checks the admin's own rights itself (like the workspace page).
  pii: 'workspace',
  outreach: 'outreach',
  payroll: 'payroll',
  rewards: 'rewards',
  // Owner 2026-10-27: «Продвижение» (SEO switches, channel checklist).
  promotion: 'promotion',
  // Owner 2026-10-05: every admin's own workspace (it lists only what the
  // admin's areas allow).
  workspace: 'workspace',
  // Staff package T3: the desk (`admin/desk/*`: «Следующий», leases, status)
  // is every staff member's own page like `workspace`; the right to each
  // queue is checked per kind in work-lease (canWorkQueue).
  desk: 'workspace',
  // Staff package T4: `admin/staff/*` (own progress, the head's people and
  // suggestions, the owner's settings) is reached through the workspace
  // area so that heads and workers get past the area gate; WHO may use each
  // route is the controller's own @AdminEndpoint roles (the owner-only
  // ones list `super_admin` alone) plus the head / own-team checks inside.
  staff: 'workspace',
};

/** `/api/v1/admin/users/123?x=1` → `users`; null when not an admin route. */
export function routeArea(path: string): RouteArea | null {
  const m = /\/admin\/([^/?#]+)/.exec(path);
  if (!m) return null;
  // Owner 2026-10-16: the provider budget caps sit under /admin/config but
  // have their own switch.
  if (/\/admin\/config\/budgets(?:[/?#]|$)/.test(path)) return 'budget_limits';
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

/** Key inside `admin_profiles.permissions` (owner 2026-10-16): «без
 * персональных данных» — the admin (an accountant) works with the numbers
 * but every person's phone, email and name comes back masked, and the
 * sections that dump personal data (CSV exports, government requests) stay
 * closed. Only the super admin sets or clears it. */
export const NO_PII_KEY = 'no_pii';

export function readNoPii(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)[NO_PII_KEY] === true;
}

/** Sections that carry personal data in bulk: closed to a no-PII admin. */
export const PII_CLOSED_AREAS: readonly AdminArea[] = [
  'exports',
  'data_requests',
];

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

/**
 * Staff package T2 (plan C3, «Пространства»): the most an admin of each
 * workspace can ever be granted, whoever hands it out and whatever was
 * stored. Built from the same area lists the guard answers 404 for
 * (workspace-scope.ts), so a grant the API accepts is always reachable and
 * a reachable area is always grantable: the two cannot drift apart (the
 * parity test fails if they do).
 *  - mass: queues and people; the people list and the dashboard are read
 *    only, everything else of the list may be `manage`;
 *  - finance: money, economy, budget limits and payroll (+ dashboard).
 * Never inside any workspace: keys, admin management, sessions, rewards,
 * settings, legal texts, exports, government requests, translations,
 * broadcasts, e-mail templates, the audit log, the partner report and the
 * promotion page — those are the owner's. The owner (super admin and the
 * owner workspace) has no ceiling.
 */
export type SeatWorkspace = Exclude<AdminWorkspace, 'owner'>;

const WORKSPACE_LEVEL_CAP: Partial<Record<AdminArea, AccessLevel>> = {
  dashboard: 'view',
  users: 'view',
};

function buildWorkspaceMax(ws: SeatWorkspace): AdminPermissions {
  const out: AdminPermissions = {};
  for (const area of WORKSPACE_AREAS[ws]) {
    if (!(ADMIN_AREAS as readonly string[]).includes(area)) continue;
    const a = area as AdminArea;
    out[a] = WORKSPACE_LEVEL_CAP[a] ?? 'manage';
  }
  return out;
}

export const WORKSPACE_MAX: Readonly<
  Record<SeatWorkspace, Readonly<AdminPermissions>>
> = {
  mass: buildWorkspaceMax('mass'),
  finance: buildWorkspaceMax('finance'),
};

/** The ceiling of [workspace]; null = none (the owner workspace). */
export function workspaceCeiling(
  workspace: AdminWorkspace,
): AdminPermissions | null {
  return workspace === 'owner' ? null : { ...WORKSPACE_MAX[workspace] };
}

/** The areas of [perms] that lie outside [workspace]'s ceiling (empty =
 * the grant fits). The level counts: `manage` of a read-only area is out. */
export function outsideWorkspace(
  workspace: AdminWorkspace,
  perms: AdminPermissions,
): AdminArea[] {
  const ceiling = workspaceCeiling(workspace);
  if (!ceiling) return [];
  return ADMIN_AREAS.filter((a) => {
    const want = perms[a];
    if (!want) return false;
    const have = ceiling[a];
    return !have || LEVEL_RANK[have] < LEVEL_RANK[want];
  });
}

/** [perms] cut down to [workspace]'s ceiling (levels capped). */
export function capToWorkspace(
  workspace: AdminWorkspace,
  perms: AdminPermissions,
): AdminPermissions {
  const ceiling = workspaceCeiling(workspace);
  return ceiling ? intersect(ceiling, perms) : perms;
}

/** The JSON stored in `admin_profiles.permissions`. */
export function storePermissions(
  areas: AdminPermissions,
  manageAdmins: boolean,
  countries: readonly string[] = [],
  partner: PartnerMembership | null = null,
  noPii = false,
): Record<string, string | boolean | string[]> {
  const out: Record<string, string | boolean | string[]> = {
    ...(partner ? intersect(PARTNER_TEAM_MAX, areas) : areas),
  };
  // A partner's team never gets the owner's deputy right.
  if (manageAdmins && !partner) out[MANAGE_ADMINS_KEY] = true;
  if (countries.length > 0) out[COUNTRIES_KEY] = [...countries];
  if (noPii) out[NO_PII_KEY] = true;
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
  noPii = false,
  workspaceHead = false,
): boolean {
  if (role === 'super_admin') return true;
  const area = routeArea(path);
  if (!area || area === 'unknown') return false;
  if (area === 'auth' || area === 'workspace') return true;
  if (
    noPii &&
    ((PII_CLOSED_AREAS as readonly string[]).includes(area) ||
      // CSV downloads dump people in bulk (e.g. partner commissions).
      /\.csv(?:[?#]|$)/i.test(path))
  ) {
    return false;
  }
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
  // Admin management: only an admin the super admin gave that right (or,
  // staff package T2, the head of a workspace while the head role is on);
  // the service narrows it further (what they may grant or touch).
  if (area === 'admins') return manageAdmins || workspaceHead;
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

/** Owner 2026-10-16: ready-made rights for the people the owner hires. The
 * panel shows them as one-click presets (the owner can still fine-tune each
 * toggle afterwards); the real check stays in AdminsService. */
export interface AdminPreset {
  key: string;
  label: string;
  description: string;
  /** Label of the account; the toggles are what actually decide. */
  role: AdminRole;
  permissions: AdminPermissions;
  noPii: boolean;
  /** Creates another owner: the panel asks for confirmation. */
  dangerous?: boolean;
}

/** Every toggle the owner may hand out, at [level]. */
function allAreas(level: AccessLevel): AdminPermissions {
  const out: AdminPermissions = {};
  for (const a of ADMIN_AREAS) {
    // The partner portal report belongs to a partner's team only.
    if (a === 'partner_report') continue;
    out[a] = level;
  }
  return out;
}

export const ADMIN_PRESETS: readonly AdminPreset[] = [
  {
    key: 'owner',
    label: 'Владелец',
    description:
      'Полный доступ ко всему, включая ключи и администраторов. Второй владелец — выдавайте осторожно.',
    role: 'super_admin',
    permissions: {},
    noPii: false,
    dangerous: true,
  },
  {
    key: 'accountant',
    label: 'Бухгалтер',
    description:
      'Деньги, экономика и лимиты расходов; лимиты можно менять. Люди без телефонов, почты и имён.',
    role: 'finance',
    permissions: {
      dashboard: 'view',
      users: 'view',
      money: 'view',
      economy: 'view',
      budget_limits: 'manage',
    },
    noPii: true,
  },
  {
    key: 'moderator',
    label: 'Модератор',
    description: 'Жалобы, обжалования и проверка адвокатов.',
    role: 'moderator',
    permissions: {
      dashboard: 'view',
      users: 'view',
      moderation: 'manage',
      verification: 'manage',
    },
    noPii: false,
  },
  {
    key: 'support',
    label: 'Поддержка',
    description: 'Обращения и чаты поддержки; пользователей — только смотреть.',
    role: 'support',
    permissions: {
      dashboard: 'view',
      users: 'view',
      support: 'manage',
      chats: 'manage',
    },
    noPii: false,
  },
  {
    key: 'viewer',
    label: 'Только просмотр',
    description:
      'Видит все разделы, которые можно выдать, но ничего не меняет.',
    role: 'support',
    permissions: allAreas('view'),
    noPii: false,
  },
];

/** The preset behind [key], or undefined. */
export function findPreset(key: string): AdminPreset | undefined {
  return ADMIN_PRESETS.find((p) => p.key === key);
}
