/**
 * Staff package T2 (plan C2, docs/dev/ADMIN_IA_AND_ROUTING_RESEARCH_2026-10-26
 * §4): the owner's menu in eight groups, by how often it is opened, top to
 * bottom. Nothing is removed — every page keeps its URL and its own right;
 * only the group titles and the order change. rbac.ts builds the groups
 * from this table while `staff.workspaces_enabled` is on; with the switch
 * off the menu is the old one (GROUPS in rbac.ts).
 *
 * A page that is not listed here (a new one nobody placed yet) is appended
 * to «Система», so it is never lost from the owner's menu (the parity test
 * fails until somebody places it on purpose).
 */
export type NavGroupKey = 'today' | 'queues' | 'people' | 'content' | 'money' | 'team' | 'system' | 'launch';

export const NAV_GROUP_META: readonly { key: NavGroupKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Сегодня', icon: 'gauge' },
  { key: 'queues', label: 'Очереди', icon: 'flag' },
  { key: 'people', label: 'Люди и кейсы', icon: 'users' },
  { key: 'content', label: 'Контент и тексты', icon: 'article' },
  { key: 'money', label: 'Деньги', icon: 'wallet' },
  { key: 'team', label: 'Команда и контроль', icon: 'shield-check' },
  { key: 'system', label: 'Система', icon: 'sliders-horizontal' },
  { key: 'launch', label: 'Запуск и право', icon: 'rocket-launch' },
];

/** Page → group, in the order the pages appear inside the group. */
export const NAV_GROUP_PAGES: Readonly<Record<NavGroupKey, readonly string[]>> = {
  today: ['/today', '/', '/workspace', '/partner'],
  queues: [
    '/verification',
    '/verification/trust',
    '/client-badges',
    '/support',
    '/moderation',
    '/media-moderation',
    '/review-appeals',
    '/moderation-appeals',
    '/moderation-auto',
    '/legal-qa',
    '/group-chats',
    '/private-content',
  ],
  people: ['/users', '/cases', '/bids', '/deadlines', '/teams', '/sanctions', '/outreach'],
  content: [
    '/content',
    '/media',
    '/broadcasts',
    '/practice-areas',
    '/document-templates',
    '/form-templates',
    '/email-templates',
    '/i18n',
    '/countries',
  ],
  money: [
    '/payments',
    '/stripe-review',
    '/subscriptions',
    '/case-payments',
    '/payroll',
    '/treasury',
    '/promo-codes',
    '/referrals',
    '/promotions',
    '/partners',
    '/country-partners',
    '/contracts',
    '/stars',
    '/prices',
    '/plans',
    '/economy',
    '/pnl',
    '/spend',
    '/analytics',
  ],
  team: ['/staff', '/staff/appeals', '/staff/rates', '/admins', '/rewards', '/sessions', '/audit-log', '/moderation-journal'],
  system: [
    '/system-health',
    '/scale',
    '/status-page',
    '/crashes',
    '/config',
    '/flags',
    '/integrations',
    '/storage',
    '/uploads',
    '/search',
    '/experiments',
    '/exports',
  ],
  launch: [
    '/launch',
    '/guides',
    '/growth-plan',
    '/promotion',
    '/legal-documents',
    '/legal-settings',
    '/attorney-ads',
    '/data-requests',
  ],
};

/** href → { group, order } for every placed page. */
export const NAV_PLACE: Readonly<Record<string, { group: NavGroupKey; order: number }>> = Object.fromEntries(
  (Object.entries(NAV_GROUP_PAGES) as [NavGroupKey, readonly string[]][]).flatMap(([group, pages]) =>
    pages.map((href, order) => [href, { group, order }] as const),
  ),
);
