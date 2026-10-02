/**
 * docs/06 §2.2 RBAC matrix — for the navigation only. Every check that
 * matters happens on the server (AdminAuthGuard, deny by default); the
 * panel just hides what a role can't open.
 */
export type AdminRole =
  | 'super_admin'
  | 'moderator'
  | 'verifier'
  | 'support'
  | 'finance';

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Супер-админ',
  moderator: 'Модератор',
  verifier: 'Верификатор',
  support: 'Поддержка',
  finance: 'Финансы',
};

/** Sidebar badge sources (see shell/use-nav-counts). */
export type CountKey = 'verification' | 'reports' | 'support' | 'appeals';

export interface Section {
  href: string;
  label: string;
  /** Phosphor icon name, resolved in shell/icons.ts. */
  icon: string;
  roles: readonly AdminRole[];
  count?: CountKey;
  /** Short hint for the command palette. */
  hint?: string;
}

export interface SectionGroup {
  label: string;
  items: readonly Section[];
}

const ALL: readonly AdminRole[] = ['super_admin', 'moderator', 'verifier', 'support', 'finance'];
const MONEY: readonly AdminRole[] = ['super_admin', 'finance', 'support'];

export const GROUPS: readonly SectionGroup[] = [
  {
    label: 'Обзор',
    items: [{ href: '/', label: 'Дашборд', icon: 'gauge', roles: ALL, hint: 'цифры и очереди' }],
  },
  {
    label: 'Люди',
    items: [
      { href: '/users', label: 'Пользователи', icon: 'users', roles: ['super_admin', 'moderator', 'support', 'finance'], hint: 'поиск, санкции, сессии' },
      { href: '/verification', label: 'Верификация', icon: 'seal-check', roles: ['super_admin', 'verifier'], count: 'verification', hint: 'лицензии адвокатов' },
      { href: '/teams', label: 'Команды адвокатов', icon: 'users-three', roles: ['super_admin', 'moderator', 'support'], hint: 'помощники и места' },
    ],
  },
  {
    label: 'Модерация',
    items: [
      { href: '/moderation', label: 'Жалобы', icon: 'flag', roles: ['super_admin', 'moderator'], count: 'reports', hint: 'очередь модерации' },
      { href: '/review-appeals', label: 'Обжалования отзывов', icon: 'scales', roles: ['super_admin', 'moderator'], count: 'appeals' },
      { href: '/content', label: 'Посты и отзывы', icon: 'article', roles: ['super_admin', 'moderator'], hint: 'посты, комментарии, отзывы' },
      { href: '/media', label: 'Рилсы и стикеры', icon: 'film-strip', roles: ['super_admin', 'moderator'], hint: 'видео, наборы стикеров' },
    ],
  },
  {
    label: 'Кейсы',
    items: [
      { href: '/cases', label: 'Кейсы', icon: 'briefcase', roles: ['super_admin', 'support', 'moderator'], hint: 'кейсы, споры, «не могу связаться»' },
      { href: '/bids', label: 'Ставки', icon: 'gavel', roles: ['super_admin', 'support'] },
      { href: '/promotions', label: 'Продвижение кейсов', icon: 'rocket-launch', roles: ['super_admin', 'finance', 'support', 'moderator'], hint: 'платный буст ~$10/день' },
    ],
  },
  {
    label: 'Деньги',
    items: [
      { href: '/subscriptions', label: 'Подписки', icon: 'crown-simple', roles: MONEY, hint: 'тарифы адвокатов' },
      { href: '/contracts', label: 'По договору', icon: 'handshake', roles: MONEY, hint: 'бесплатно блогерам 3–12 мес.' },
      { href: '/payments', label: 'Платежи и возвраты', icon: 'receipt', roles: MONEY },
      { href: '/promo-codes', label: 'Промокоды', icon: 'ticket', roles: MONEY },
      { href: '/referrals', label: 'Рефералы', icon: 'share-network', roles: MONEY, hint: 'скидки за приглашения' },
    ],
  },
  {
    label: 'Связь',
    items: [
      { href: '/support', label: 'Поддержка', icon: 'lifebuoy', roles: ['super_admin', 'support', 'moderator'], count: 'support', hint: 'обращения пользователей' },
      { href: '/broadcasts', label: 'Рассылки', icon: 'megaphone', roles: ['super_admin'], hint: 'пуш всем или сегменту' },
      { href: '/email-templates', label: 'Шаблоны писем', icon: 'envelope-simple', roles: ['super_admin'] },
    ],
  },
  {
    label: 'Система',
    items: [
      { href: '/flags', label: 'Функции', icon: 'toggle-right', roles: ['super_admin'], hint: 'флаги, скрытые функции' },
      { href: '/integrations', label: 'Ключи и сервисы', icon: 'key', roles: ['super_admin'], hint: 'API-ключи, ротация' },
      { href: '/config', label: 'Настройки', icon: 'sliders-horizontal', roles: ['super_admin'], hint: 'лимиты, версии приложения' },
      { href: '/practice-areas', label: 'Квалификации', icon: 'books', roles: ['super_admin'] },
      { href: '/i18n', label: 'Локализация', icon: 'translate', roles: ['super_admin'] },
      { href: '/legal', label: 'Юр. документы', icon: 'file-text', roles: ['super_admin'] },
      { href: '/data-requests', label: 'Запросы госорганов', icon: 'bank', roles: ['super_admin'] },
      { href: '/exports', label: 'Выгрузки CSV', icon: 'download-simple', roles: ['super_admin', 'support', 'finance'] },
      { href: '/audit-log', label: 'Журнал аудита', icon: 'clock-counter-clockwise', roles: ALL },
      { href: '/admins', label: 'Администраторы', icon: 'shield-check', roles: ['super_admin'] },
    ],
  },
];

export const SECTIONS: readonly Section[] = GROUPS.flatMap((g) => g.items);

export function groupsFor(role: AdminRole): SectionGroup[] {
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => s.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
}

export function sectionsFor(role: AdminRole): Section[] {
  return SECTIONS.filter((s) => s.roles.includes(role));
}

export function sectionFor(pathname: string): Section | undefined {
  return [...SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => (s.href === '/' ? pathname === '/' : pathname === s.href || pathname.startsWith(`${s.href}/`)));
}

export function canOpen(role: AdminRole | undefined, href: string): boolean {
  if (!role) return false;
  const s = sectionFor(href);
  return !!s && s.roles.includes(role);
}
