/**
 * Admin access, navigation side only. Every check that matters happens on
 * the server (AdminAuthGuard, deny by default); the panel just hides what an
 * admin can't open. The super admin reaches everything; any other admin
 * reaches the areas the super admin toggled on for them. Money and API keys
 * are never grantable (the API answers 404 whatever the toggles say).
 * Owner 2026-10-05: the trusted deputy (the admin the super admin let
 * manage admins) reads every section except the keys and runs payroll.
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

export type AccessLevel = 'view' | 'manage';
export type Permissions = Partial<Record<string, AccessLevel>>;

/** Areas the super admin can toggle for another admin (same list as the API). */
export const GRANTABLE_AREAS: readonly { key: string; label: string; hint: string }[] = [
  { key: 'dashboard', label: 'Дашборд', hint: 'цифры и очереди (без денег)' },
  { key: 'users', label: 'Пользователи', hint: 'поиск, карточки; управление = санкции' },
  { key: 'verification', label: 'Верификация', hint: 'лицензии адвокатов и галочки клиентов' },
  { key: 'moderation', label: 'Жалобы и обжалования', hint: 'очередь модерации' },
  { key: 'content', label: 'Посты и отзывы', hint: 'публикации, комментарии, отзывы, квалификации' },
  { key: 'media', label: 'Рилсы и стикеры', hint: 'видео и наборы стикеров' },
  { key: 'cases', label: 'Кейсы и ставки', hint: 'кейсы, споры, «не могу связаться»' },
  { key: 'support', label: 'Поддержка', hint: 'обращения пользователей' },
  { key: 'teams', label: 'Команды адвокатов', hint: 'помощники и места' },
  { key: 'broadcasts', label: 'Рассылки', hint: 'пуш всем или сегменту' },
  { key: 'email_templates', label: 'Шаблоны писем', hint: 'тексты писем и пушей' },
  { key: 'localization', label: 'Локализация', hint: 'языки и переводы' },
  { key: 'settings', label: 'Функции и настройки', hint: 'флаги, лимиты, версии приложения' },
  { key: 'legal', label: 'Юр. документы', hint: 'версии документов' },
  { key: 'data_requests', label: 'Запросы госорганов', hint: 'обращения и ответы' },
  { key: 'exports', label: 'Выгрузки CSV', hint: 'кроме платежей' },
  { key: 'sanctions', label: 'Санкции', hint: 'блокировки и баны по телефону, e-mail, устройству' },
  { key: 'payroll', label: 'Зарплаты', hint: 'сотрудники, выплаты за период' },
];

/** Never grantable — shown locked so nobody wonders where they are. */
export const LOCKED_AREAS: readonly { label: string; hint: string }[] = [
  { label: 'Деньги', hint: 'подписки, платежи, возвраты, промокоды, рефералы, договоры; доверенный заместитель только смотрит' },
  { label: 'Ключи и сервисы', hint: 'Stripe, Firebase, Bunny, SES, Sentry… только супер-админ' },
  { label: 'Журнал аудита и сессии админов', hint: 'кто что сделал и кто сейчас в админке; заместитель только смотрит' },
  { label: 'Право «Доверенный заместитель»', hint: 'его выдаёт только супер-админ' },
];

interface AccessSubject {
  role: AdminRole;
  permissions?: Permissions;
  /** The super admin gave this admin the right to manage other admins. */
  canManageAdmins?: boolean;
}

/** Can this admin open [area] at [level]? Super admin: always. */
export function can(
  me: AccessSubject | undefined,
  area: string,
  level: AccessLevel = 'view',
): boolean {
  if (!me) return false;
  if (me.role === 'super_admin') return true;
  // The trusted deputy: reads everything but the keys, runs payroll.
  if (me.canManageAdmins && area !== 'keys' && (level === 'view' || area === 'payroll')) return true;
  const have = me.permissions?.[area];
  return have === 'manage' || (have === 'view' && level === 'view');
}

/** True when [inner] asks for nothing [outer] does not already hold. */
export function covers(outer: Permissions, inner: Permissions): boolean {
  const rank = { view: 1, manage: 2 } as const;
  return Object.entries(inner).every(([area, want]) => {
    if (!want) return true;
    const have = outer[area];
    return !!have && rank[have] >= rank[want];
  });
}

/** Sidebar badge sources (see shell/use-nav-counts). */
export type CountKey = 'verification' | 'reports' | 'support' | 'appeals';

/** An area key, `super` for sections only the super admin opens,
 * `money` for money/audit sections the deputy may read, or `admins` for
 * admin management (super admin or a granted manager). */
export type SectionArea = string;

export interface Section {
  href: string;
  label: string;
  /** Phosphor icon name, resolved in shell/icons.ts. */
  icon: string;
  area: SectionArea;
  count?: CountKey;
  /** Short hint for the command palette. */
  hint?: string;
}

export interface SectionGroup {
  label: string;
  items: readonly Section[];
}

export const GROUPS: readonly SectionGroup[] = [
  {
    label: 'Обзор',
    items: [{ href: '/', label: 'Дашборд', icon: 'gauge', area: 'dashboard', hint: 'цифры и очереди' }],
  },
  {
    label: 'Люди',
    items: [
      { href: '/users', label: 'Пользователи', icon: 'users', area: 'users', hint: 'поиск, санкции, сессии' },
      { href: '/verification', label: 'Верификация', icon: 'seal-check', area: 'verification', count: 'verification', hint: 'лицензии адвокатов' },
      { href: '/client-badges', label: 'Галочки клиентов', icon: 'shield-check', area: 'verification', hint: 'платная золотая галочка' },
      { href: '/teams', label: 'Команды адвокатов', icon: 'users-three', area: 'teams', hint: 'помощники и места' },
    ],
  },
  {
    label: 'Модерация',
    items: [
      { href: '/moderation', label: 'Жалобы', icon: 'flag', area: 'moderation', count: 'reports', hint: 'очередь модерации' },
      { href: '/sanctions', label: 'Санкции', icon: 'prohibit', area: 'sanctions', hint: 'блокировки и баны' },
      { href: '/review-appeals', label: 'Обжалования отзывов', icon: 'scales', area: 'moderation', count: 'appeals' },
      { href: '/content', label: 'Посты и отзывы', icon: 'article', area: 'content', hint: 'посты, комментарии, отзывы' },
      { href: '/media', label: 'Рилсы и стикеры', icon: 'film-strip', area: 'media', hint: 'видео, наборы стикеров' },
    ],
  },
  {
    label: 'Кейсы',
    items: [
      { href: '/cases', label: 'Кейсы', icon: 'briefcase', area: 'cases', hint: 'кейсы, споры, «не могу связаться»' },
      { href: '/bids', label: 'Ставки', icon: 'gavel', area: 'cases' },
      { href: '/promotions', label: 'Продвижение кейсов', icon: 'rocket-launch', area: 'money', hint: 'платный буст ~$10/день' },
    ],
  },
  {
    label: 'Деньги',
    items: [
      { href: '/prices', label: 'Цены', icon: 'tag', area: 'money', hint: 'стоимость тарифов и галочки' },
      { href: '/plans', label: 'Планы', icon: 'stack', area: 'money', hint: 'планы подписок и их возможности' },
      { href: '/subscriptions', label: 'Подписки', icon: 'crown-simple', area: 'money', hint: 'тарифы адвокатов' },
      { href: '/contracts', label: 'По договору', icon: 'handshake', area: 'money', hint: 'бесплатно блогерам 3–12 мес.' },
      { href: '/payments', label: 'Платежи и возвраты', icon: 'receipt', area: 'money' },
      { href: '/promo-codes', label: 'Промокоды', icon: 'ticket', area: 'money' },
      { href: '/referrals', label: 'Рефералы', icon: 'share-network', area: 'money', hint: 'скидки за приглашения' },
      { href: '/payroll', label: 'Зарплаты', icon: 'wallet', area: 'payroll', hint: 'сотрудники, массовая выплата' },
      { href: '/partners', label: 'Партнёры', icon: 'handshake', area: 'money', hint: 'блогеры и агенты: плата за адвокатов и клиентов' },
    ],
  },
  {
    label: 'Связь',
    items: [
      { href: '/support', label: 'Поддержка', icon: 'lifebuoy', area: 'support', count: 'support', hint: 'обращения пользователей' },
      { href: '/broadcasts', label: 'Рассылки', icon: 'megaphone', area: 'broadcasts', hint: 'пуш всем или сегменту' },
      { href: '/email-templates', label: 'Шаблоны писем', icon: 'envelope-simple', area: 'email_templates' },
    ],
  },
  {
    label: 'Система',
    items: [
      { href: '/flags', label: 'Функции', icon: 'toggle-right', area: 'settings', hint: 'флаги, скрытые функции' },
      { href: '/integrations', label: 'Ключи и сервисы', icon: 'key', area: 'super', hint: 'API-ключи, ротация' },
      { href: '/config', label: 'Настройки', icon: 'sliders-horizontal', area: 'settings', hint: 'лимиты, версии приложения' },
      { href: '/practice-areas', label: 'Квалификации', icon: 'books', area: 'content' },
      { href: '/i18n', label: 'Локализация', icon: 'translate', area: 'localization' },
      { href: '/legal', label: 'Юр. документы', icon: 'file-text', area: 'legal' },
      { href: '/data-requests', label: 'Запросы госорганов', icon: 'bank', area: 'data_requests' },
      { href: '/exports', label: 'Выгрузки CSV', icon: 'download-simple', area: 'exports' },
      { href: '/audit-log', label: 'Журнал аудита', icon: 'clock-counter-clockwise', area: 'money', hint: 'кто что сделал' },
      { href: '/sessions', label: 'Сессии админов', icon: 'devices', area: 'money', hint: 'кто сейчас в админке' },
      { href: '/admins', label: 'Администраторы', icon: 'shield-check', area: 'admins', hint: 'сотрудники, права, пароли' },
    ],
  },
];

export const SECTIONS: readonly Section[] = GROUPS.flatMap((g) => g.items);

function opens(me: AccessSubject, s: Section): boolean {
  if (s.area === 'super') return me.role === 'super_admin';
  if (s.area === 'money') return me.role === 'super_admin' || me.canManageAdmins === true;
  // Admin management: the super admin, or an admin given that right.
  if (s.area === 'admins') return me.role === 'super_admin' || me.canManageAdmins === true;
  return can(me, s.area);
}

export function groupsFor(me: AccessSubject): SectionGroup[] {
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => opens(me, s)) })).filter((g) => g.items.length > 0);
}

export function sectionsFor(me: AccessSubject): Section[] {
  return SECTIONS.filter((s) => opens(me, s));
}

export function sectionFor(pathname: string): Section | undefined {
  return [...SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => (s.href === '/' ? pathname === '/' : pathname === s.href || pathname.startsWith(`${s.href}/`)));
}

export function canOpen(me: AccessSubject | undefined, href: string): boolean {
  if (!me) return false;
  const s = sectionFor(href);
  return !!s && opens(me, s);
}
