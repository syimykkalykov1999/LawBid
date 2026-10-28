import type { AdminRole, AdminWorkspace } from './rbac';
import { moderationReviewHref, supportReviewHref, verificationReviewHref } from './review-flow';
import { navModeFor } from './rbac';

/**
 * Staff package T8 (plan C1, docs/dev/ADMIN_IA_AND_ROUTING_RESEARCH §3): the
 * one-page desk of a worker. Pure rules only (who may open which desk, which
 * tabs a desk has, which pages stay reachable) — no data, no React — so the
 * shell, the pages and the tests share one source.
 */
export type DeskRole = 'verifier' | 'moderator' | 'support' | 'finance';

export const DESK_ROLES: readonly DeskRole[] = ['verifier', 'moderator', 'support', 'finance'];

export const DESK_ROLE_LABEL: Record<DeskRole, string> = {
  verifier: 'Стол проверки',
  moderator: 'Стол модерации',
  support: 'Стол поддержки',
  finance: 'Стол финансов',
};

export const DESK_ROLE_SHORT: Record<DeskRole, string> = {
  verifier: 'Проверка',
  moderator: 'Модерация',
  support: 'Поддержка',
  finance: 'Финансы',
};

export function isDeskRole(v: string): v is DeskRole {
  return (DESK_ROLES as readonly string[]).includes(v);
}

export interface DeskTab {
  key: string;
  label: string;
}

/** The tabs on top of each desk (owner's list for T8). */
export const DESK_TABS: Readonly<Record<DeskRole, readonly DeskTab[]>> = {
  verifier: [
    { key: 'queue', label: 'Очередь' },
    { key: 'mine', label: 'Мои' },
    { key: 'checked', label: 'Проверено' },
    { key: 'rating', label: 'Мой рейтинг' },
  ],
  moderator: [
    { key: 'reports', label: 'Жалобы' },
    { key: 'appeals', label: 'Обжалования' },
    { key: 'mine', label: 'Мои' },
    { key: 'rating', label: 'Мой рейтинг' },
  ],
  support: [
    { key: 'tickets', label: 'Обращения' },
    { key: 'chats', label: 'Чаты' },
    { key: 'mine', label: 'Мои' },
    { key: 'rating', label: 'Мой рейтинг' },
  ],
  finance: [
    { key: 'payouts', label: 'Выплаты' },
    { key: 'refunds', label: 'Возвраты' },
    { key: 'reports', label: 'Отчёты' },
    { key: 'tasks', label: 'Мои задачи' },
  ],
};

/** Tabs that are about the worker personally: not shown to a head / owner who only looks. */
export const PERSONAL_TABS: readonly string[] = ['mine', 'rating', 'checked', 'tasks'];

/** The tabs a viewer sees: the worker all of them, the head / owner the queues and «Команда». */
export function tabsFor(role: DeskRole, mode: 'own' | 'view'): readonly DeskTab[] {
  if (mode === 'own') return DESK_TABS[role];
  return [...DESK_TABS[role].filter((t) => !PERSONAL_TABS.includes(t.key)), { key: 'team', label: 'Команда' }];
}

export function tabKeyOrFirst(role: DeskRole, key: string | null | undefined, mode: 'own' | 'view' = 'own'): string {
  const tabs = tabsFor(role, mode);
  return tabs.find((t) => t.key === key)?.key ?? tabs[0].key;
}

/** Item kinds of the lease engine (T3, `WorkLeaseKind`) each desk works. */
export type LeaseKind =
  | 'support_ticket'
  | 'verification'
  | 'report'
  | 'media_report'
  | 'mod_appeal'
  | 'review_appeal'
  | 'trust_case'
  | 'refund'
  | 'payout'
  | 'review_sample';

export const DESK_KINDS: Readonly<Record<DeskRole, readonly LeaseKind[]>> = {
  verifier: ['verification'],
  moderator: ['report', 'media_report', 'mod_appeal', 'review_appeal'],
  support: ['support_ticket'],
  finance: ['refund', 'payout'],
};

/** The kinds the server hands out today (refunds and payouts are made by finance themselves: no queue to lease). */
export const LEASE_SERVED: readonly LeaseKind[] = ['support_ticket', 'verification', 'report', 'mod_appeal', 'review_appeal'];

/** The kind a tab's «Следующий» takes (null = the tab has no queue of its own). */
export const TAB_KIND: Readonly<Record<DeskRole, Readonly<Record<string, LeaseKind | null>>>> = {
  verifier: { queue: 'verification' },
  moderator: { reports: 'report', appeals: 'mod_appeal' },
  support: { tickets: 'support_ticket', chats: 'support_ticket' },
  finance: { payouts: 'payout', refunds: 'refund' },
};

export const KIND_LABEL: Record<LeaseKind, string> = {
  support_ticket: 'Обращение',
  verification: 'Заявка адвоката',
  report: 'Жалоба',
  media_report: 'Фото или видео',
  mod_appeal: 'Обжалование решения',
  review_appeal: 'Обжалование отзыва',
  trust_case: 'Проверка на мошенничество',
  refund: 'Возврат',
  payout: 'Выплата',
  review_sample: 'Перепроверка',
};

/** The settings number (minutes) that limits one item of each kind. */
export const KIND_TTL_KEY: Readonly<Record<LeaseKind, string>> = {
  support_ticket: 'staff.lease.ttl_ticket_min',
  verification: 'staff.lease.ttl_verification_min',
  trust_case: 'staff.lease.ttl_verification_min',
  report: 'staff.lease.ttl_report_min',
  media_report: 'staff.lease.ttl_report_min',
  mod_appeal: 'staff.lease.ttl_appeal_min',
  review_appeal: 'staff.lease.ttl_appeal_min',
  refund: 'staff.lease.ttl_finance_min',
  payout: 'staff.lease.ttl_finance_min',
  review_sample: 'staff.lease.ttl_report_min',
};

/** The per-queue switch of T3 (works only under `staff.lease_enabled`). */
export const KIND_SWITCH: Readonly<Record<LeaseKind, string>> = {
  support_ticket: 'staff.lease_support_enabled',
  verification: 'staff.lease_verification_enabled',
  trust_case: 'staff.lease_verification_enabled',
  report: 'staff.lease_report_enabled',
  media_report: 'staff.lease_report_enabled',
  mod_appeal: 'staff.lease_appeal_enabled',
  review_appeal: 'staff.lease_appeal_enabled',
  refund: 'staff.lease_finance_enabled',
  payout: 'staff.lease_finance_enabled',
  review_sample: 'staff.lease_report_enabled',
};

/**
 * Where the card of a leased item opens. A support ticket, a verification request and a report open the review screen of their
 * queue (a report's object kind comes with the lease); the appeals are worked right in the
 * desk tab (their lists are the card). null = no page for the kind.
 */
export function itemHref(kind: string, id: string, targetType?: string | null): string | null {
  if (kind === 'support_ticket') return supportReviewHref(id);
  // Owner 2026-10-28: requests and complaints open on their «…и дальше» review screens.
  if (kind === 'verification') return verificationReviewHref(id);
  if (kind === 'report') return targetType ? moderationReviewHref(targetType, id) : deskPath('moderator', 'reports');
  if (kind === 'mod_appeal' || kind === 'review_appeal') return deskPath('moderator', 'appeals');
  return null;
}

/** The reasons of «Пропустить» (the server's list, SKIP_REASONS). */
export const SKIP_REASONS: readonly { value: string; label: string }[] = [
  { value: 'not_my_language', label: 'Не мой язык' },
  { value: 'conflict_of_interest', label: 'Конфликт интересов' },
  { value: 'not_my_topic', label: 'Не моя тема' },
  { value: 'too_hard', label: 'Слишком сложно' },
  { value: 'other', label: 'Другое' },
];

type DeskSubject = {
  role: AdminRole;
  workspace?: AdminWorkspace;
  workspaceHead?: boolean;
  workspacesEnabled?: boolean;
  canManageAdmins?: boolean;
  countryPartnerId?: string | null;
};

/** The desk of a worker's own role (null = the role has none, e.g. the owner). */
export function ownDeskRole(me: DeskSubject | undefined): DeskRole | null {
  if (!me) return null;
  if (me.role === 'verifier' || me.role === 'moderator' || me.role === 'support') {
    return me.workspace === 'finance' ? null : me.role;
  }
  if (me.role === 'finance') return me.workspace === 'mass' ? null : 'finance';
  return null;
}

/**
 * May [me] open the desk of [role]?
 *  - `own`: the worker (or the head, working as one) at their own desk;
 *  - `view`: read-only look — the owner at every desk, the head of mass at
 *    the other mass desks (never finance: no head there);
 *  - null: the page does not exist for them («Такой страницы нет»).
 * Everything is off (null) while the workspaces or the desk switch are off.
 */
export function deskAccess(me: DeskSubject | undefined, role: DeskRole, deskOn: boolean): 'own' | 'view' | null {
  if (!me || !me.workspacesEnabled || !deskOn) return null;
  if (me.role === 'super_admin' || me.workspace === 'owner') return 'view';
  if (navModeFor(me) !== 'desk') return null;
  if (ownDeskRole(me) === role) return 'own';
  if (me.workspaceHead && me.workspace === 'mass' && role !== 'finance') return 'view';
  return null;
}

/** The desks [me] may look at (own first). */
export function desksFor(me: DeskSubject | undefined, deskOn: boolean): { role: DeskRole; mode: 'own' | 'view' }[] {
  const out: { role: DeskRole; mode: 'own' | 'view' }[] = [];
  for (const role of DESK_ROLES) {
    const mode = deskAccess(me, role, deskOn);
    if (mode) out.push({ role, mode });
  }
  return out.sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'own' ? -1 : 1));
}

export function deskPath(role: DeskRole, tab?: string): string {
  return tab ? `/desk/${role}?tab=${tab}` : `/desk/${role}`;
}

/** Where a desk-mode admin lands instead of the dashboard (null = nowhere). */
export function deskHome(me: DeskSubject | undefined, deskOn: boolean): string | null {
  const own = desksFor(me, deskOn).find((d) => d.mode === 'own');
  return own ? deskPath(own.role) : null;
}

/**
 * The pages (besides the desk itself) that stay open to a worker while the
 * desk is on: the queues the desk shows and their cards, and the people /
 * cases those cards link to. Everything else of the workspace is hidden
 * from the worker (owner: «одна страница с вкладками, больше ничего»).
 */
export const DESK_PAGES: Readonly<Record<DeskRole, readonly string[]>> = {
  verifier: ['/verification', '/client-badges', '/users'],
  moderator: ['/moderation', '/media-moderation', '/review-appeals', '/moderation-appeals', '/moderation-journal', '/legal-qa', '/group-chats', '/private-content', '/content', '/users'],
  support: ['/support', '/users', '/cases'],
  finance: ['/payroll', '/payments', '/treasury', '/subscriptions'],
};

/** Pages every desk-mode admin keeps (their profile, the head's team page). */
const ALWAYS_PAGES = ['/profile', '/admins'];

/** Is [pathname] outside the desk of a desk-mode admin (so it answers «такой страницы нет»)? */
export function outsideDesk(me: DeskSubject | undefined, pathname: string, deskOn: boolean): boolean {
  if (!me || !deskOn || !me.workspacesEnabled || navModeFor(me) !== 'desk') return false;
  if (pathname === '/' || pathname === '/workspace' || pathname === '/desk' || pathname.startsWith('/desk/')) return false;
  const role = ownDeskRole(me);
  if (!role) return false;
  const keep = [...DESK_PAGES[role], ...ALWAYS_PAGES];
  return !keep.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
