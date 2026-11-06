/**
 * Owner 2026-11-04 (R-374): «удали всё, я заново зарегаюсь, и контенты тоже
 * удали» — removes the app users and everything they made from production
 * while the admin panel, its staff and the launch configuration stay.
 * Pure data + helpers (unit-tested); the I/O is in src/cli/purge-test-data.ts.
 *
 * The table lists are NOT new: they are the pre-launch wipe lists
 * (prelaunch-wipe.plan.ts, every table of the schema classified once, a
 * spec fails when a migration adds an unclassified table) with two
 * adjustments the owner asked for on 2026-11-04 — the admin panel's own
 * history and staff work are never touched:
 *  - PURGE_ALSO_KEEP: tables the pre-launch wipe empties but this purge keeps;
 *  - USER_ROW_TABLES: tables that also hold the admins' own rows (sign-in),
 *    so only the rows of deleted users go, not the whole table.
 */
import {
  classOf,
  FILTERED_TABLES,
  KEEP_TABLES,
  RESET_SQL,
  WIPE_TABLES,
} from './prelaunch-wipe.plan';

export const CONFIRM_KEEP_PHONES = 'DELETE-TEST-DATA';
export const CONFIRM_ALL_USERS = 'DELETE-ALL-USERS';

/** Admin panel history, staff work, demo registry and ops records: kept. */
export const PURGE_ALSO_KEEP: Readonly<Record<string, string>> = {
  audit_log: 'admin actions trail (admin panel history)',
  admin_approvals: 'admin approvals (admin panel)',
  admin_appeals: 'complaints against heads (staff)',
  admin_broadcasts: 'pushes the admins sent (admin panel)',
  infra_change_requests: 'cloud change requests (admin panel)',
  work_leases: 'staff work items',
  work_lease_events: 'staff lease history',
  staff_member_states: 'staff queue states',
  staff_quality_signals: 'staff quality signals',
  staff_review_samples: 'staff second looks',
  staff_daily_stats: 'staff daily numbers',
  staff_rating_snapshots: 'staff ratings',
  staff_suggestions: 'staff suggestions',
  staff_actions: 'staff warnings / removals',
  staff_case_appeals: 'staff case appeals',
  staff_retaliation_flags: 'staff retaliation marks',
  staff_head_snapshots: 'head scores',
  staff_piecework_days: 'staff piecework days (payroll)',
  staff_anomalies: 'staff anomaly reports',
  staff_digests: 'weekly owner digests',
  experiments: 'A/B test setup (admin configuration)',
  experiment_results: 'A/B test reports',
  demo_accounts: 'demo world registry (demo configuration)',
  system_incidents: 'status board history',
};

/** Emptied by the pre-launch wipe, but the admins sign in through them:
 * only the rows of deleted users go (every user-id foreign key column). */
export const USER_ROW_TABLES: readonly string[] = [
  'sessions',
  'auth_events',
  'user_identifiers',
];

/** RESET_SQL of the pre-launch wipe minus the audit chain head: the audit
 * log is kept, so its hash chain must stay as it is. */
export const PURGE_RESET_SQL: readonly string[] = RESET_SQL.filter(
  (s) => !s.includes('audit_log_chain_head'),
);

export type PurgeClass = 'keep' | 'filtered' | 'user_rows' | 'wipe';

export function purgeClassOf(table: string): PurgeClass | null {
  const base = /^ranking_events_(p\d{8}|default)$/.test(table)
    ? 'ranking_events'
    : table;
  if (base in PURGE_ALSO_KEEP) return 'keep';
  if (USER_ROW_TABLES.includes(base)) return 'user_rows';
  return classOf(table);
}

export interface PurgePlan {
  wipe: string[];
  keep: string[];
  filtered: string[];
  userRows: string[];
  /** In the database but in no list: the run stops. */
  unknown: string[];
}

export function purgePlanFor(dbTables: readonly string[]): PurgePlan {
  const plan: PurgePlan = {
    wipe: [],
    keep: [],
    filtered: [],
    userRows: [],
    unknown: [],
  };
  for (const t of [...new Set(dbTables)].sort()) {
    const c = purgeClassOf(t);
    if (c === null) plan.unknown.push(t);
    else if (c === 'user_rows') plan.userRows.push(t);
    else plan[c].push(t);
  }
  return plan;
}

/** Every table of the three source lists plus the overrides (for specs). */
export function listedTables(): string[] {
  return [
    ...Object.keys(KEEP_TABLES),
    ...Object.keys(FILTERED_TABLES),
    ...Object.keys(WIPE_TABLES),
  ];
}

// --- arguments ---------------------------------------------------------------

export const PURGE_PHASES = ['bunny', 'db', 's3', 'redis'] as const;
export type PurgePhase = (typeof PURGE_PHASES)[number];

export interface PurgeArgs {
  mode: 'keep_phones' | 'all_users';
  /** E.164 numbers whose accounts stay (keep_phones mode). */
  keepPhones: string[];
  apply: boolean;
  confirm: string | null;
  phases: Set<PurgePhase>;
  purgeVersions: boolean;
}

/**
 * US numbers are typed in many shapes: `7739935153`, `17739935153`,
 * `+1 (773) 993-5153`. Ten digits are a US number; eleven starting with 1
 * too; anything with a leading `+` keeps its country code. Null when the
 * input cannot be a phone number.
 */
export function normalisePhone(raw: string): string | null {
  const s = raw.trim();
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!plus && digits.length === 10) return `+1${digits}`;
  if (!plus && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (plus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** `+17739935153` → `+*******5153` (only the last four digits are shown). */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '-';
  const tail = e164.slice(-4);
  return `+${'*'.repeat(Math.max(0, e164.length - 5))}${tail}`;
}

export function parsePurgeArgs(argv: readonly string[]): PurgeArgs {
  let keepRaw: string | null = null;
  let all = false;
  const args: PurgeArgs = {
    mode: 'all_users',
    keepPhones: [],
    apply: false,
    confirm: null,
    phases: new Set(PURGE_PHASES),
    purgeVersions: false,
  };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--all-users') all = true;
    else if (a === '--purge-versions') args.purgeVersions = true;
    else if (a.startsWith('--keep-phones=')) {
      keepRaw = a.slice('--keep-phones='.length);
    } else if (a.startsWith('--confirm=')) {
      args.confirm = a.slice('--confirm='.length);
    } else if (a.startsWith('--only=')) {
      const list = a.slice('--only='.length).split(',').filter(Boolean);
      for (const p of list) {
        if (!(PURGE_PHASES as readonly string[]).includes(p)) {
          throw new Error(
            `unknown phase "${p}" (use ${PURGE_PHASES.join(',')})`,
          );
        }
      }
      args.phases = new Set(list as PurgePhase[]);
    } else throw new Error(`unknown argument "${a}"`);
  }
  if (all && keepRaw !== null) {
    throw new Error(
      'refused: use either --all-users or --keep-phones, not both',
    );
  }
  if (!all && keepRaw === null) {
    throw new Error(
      'refused: say who stays — --keep-phones=<n1,n2,…> or --all-users',
    );
  }
  if (all) {
    args.mode = 'all_users';
  } else {
    args.mode = 'keep_phones';
    const parts = (keepRaw ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new Error('refused: --keep-phones is empty');
    }
    const phones: string[] = [];
    for (const p of parts) {
      const n = normalisePhone(p);
      if (!n) throw new Error(`refused: "${p}" is not a phone number`);
      phones.push(n);
    }
    args.keepPhones = [...new Set(phones)];
  }
  if (args.apply) {
    const need =
      args.mode === 'all_users' ? CONFIRM_ALL_USERS : CONFIRM_KEEP_PHONES;
    if (args.confirm !== need) {
      throw new Error(`refused: --apply needs --confirm=${need}`);
    }
  }
  return args;
}

// --- who stays ----------------------------------------------------------------

export interface UserRow {
  id: string;
  role: string | null;
  phone: string | null;
  /** Phone numbers of the user's sign-in identifiers. */
  idPhones: string[];
  username: string | null;
  created: Date | string | null;
  /** Has an admin_profiles row (an admin panel account). */
  isAdmin: boolean;
  /** users.status (`deleted` once the erasure service ran). */
  status?: string | null;
}

export type KeepReason = 'admin' | 'phone' | 'referenced';

export interface UserSplit {
  keep: { user: UserRow; reason: KeepReason }[];
  remove: UserRow[];
}

/**
 * KEEP: admin panel accounts (role admin or an admin_profiles row) always;
 * users a kept table still points at (partners, payroll …); in keep_phones
 * mode the accounts on the listed numbers. Everyone else is removed.
 */
export function splitUsers(
  users: readonly UserRow[],
  keepPhones: readonly string[] | null,
  referenced: ReadonlySet<string>,
): UserSplit {
  const phones = new Set((keepPhones ?? []).map((p) => normalisePhone(p) ?? p));
  const split: UserSplit = { keep: [], remove: [] };
  for (const u of users) {
    if (u.role === 'admin' || u.isAdmin) {
      split.keep.push({ user: u, reason: 'admin' });
      continue;
    }
    const own = [u.phone, ...u.idPhones]
      .filter((p): p is string => !!p)
      .map((p) => normalisePhone(p) ?? p);
    if (own.some((p) => phones.has(p))) {
      split.keep.push({ user: u, reason: 'phone' });
      continue;
    }
    if (referenced.has(u.id)) {
      split.keep.push({ user: u, reason: 'referenced' });
      continue;
    }
    split.remove.push(u);
  }
  return split;
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
