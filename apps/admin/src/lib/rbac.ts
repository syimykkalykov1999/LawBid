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
  verifier: 'Проверка',
  support: 'Поддержка',
  finance: 'Финансы',
};

export type AccessLevel = 'view' | 'manage';
export type Permissions = Partial<Record<string, AccessLevel>>;

/** Areas the super admin can toggle for another admin (same list as the API). */
export const GRANTABLE_AREAS: readonly { key: string; label: string; hint: string; ownerGrants?: boolean }[] = [
  { key: 'dashboard', label: 'Дашборд', hint: 'цифры и очереди (без денег)' },
  { key: 'users', label: 'Пользователи', hint: 'поиск, карточки; управление = санкции' },
  { key: 'verification', label: 'Верификация и проверка', hint: 'лицензии адвокатов, борьба с мошенниками (очередь проверки), галочки клиентов' },
  { key: 'moderation', label: 'Жалобы и обжалования', hint: 'очередь модерации' },
  { key: 'content', label: 'Посты и отзывы', hint: 'публикации, комментарии, отзывы, квалификации' },
  { key: 'media', label: 'Рилсы и стикеры', hint: 'видео и наборы стикеров' },
  { key: 'cases', label: 'Кейсы и ставки', hint: 'кейсы, споры, «не могу связаться»' },
  { key: 'support', label: 'Поддержка', hint: 'обращения пользователей' },
  { key: 'teams', label: 'Команды адвокатов', hint: 'помощники и места' },
  { key: 'broadcasts', label: 'Рассылки', hint: 'пуш всем или сегменту' },
  { key: 'email_templates', label: 'Шаблоны писем', hint: 'тексты писем и пушей' },
  { key: 'localization', label: 'Локализация', hint: 'языки, переводы и страны' },
  { key: 'settings', label: 'Функции и настройки', hint: 'флаги, лимиты, версии приложения' },
  { key: 'legal', label: 'Юр. документы', hint: 'версии документов; право и жалобы (DMCA, дисклеймеры)' },
  { key: 'data_requests', label: 'Запросы госорганов', hint: 'обращения и ответы' },
  { key: 'exports', label: 'Выгрузки CSV', hint: 'кроме платежей' },
  { key: 'sanctions', label: 'Санкции', hint: 'блокировки и баны по телефону, e-mail, устройству' },
  { key: 'outreach', label: 'Привлечение', hint: 'база контактов, холодные звонки и письма; сотрудник видит только своих' },
  { key: 'payroll', label: 'Зарплаты', hint: 'сотрудники, выплаты за период' },
  // Owner 2026-10-16: grantable by the owner only (a deputy cannot hand them out).
  { key: 'money', label: 'Деньги', hint: 'платежи, подписки, промокоды, рефералы, партнёры, прибыль и резерв. «Смотреть» безопасно; «управлять» даёт возвраты, выплаты партнёрам и промокоды. Цены, планы и аналитика остаются только у вас', ownerGrants: true },
  { key: 'economy', label: 'Экономика', hint: 'доход против расходов на SMS, видео и AWS', ownerGrants: true },
  { key: 'budget_limits', label: 'Лимиты расходов', hint: 'потолки на SMS, видео, хранилище и переводы в Настройках', ownerGrants: true },
  { key: 'audit', label: 'Журнал аудита', hint: 'кто что сделал; без этого права админ видит только свои действия', ownerGrants: true },
  { key: 'chats', label: 'Чаты поддержки', hint: 'переписки с пользователями в поддержке' },
];

/** Never grantable — shown locked so nobody wonders where they are. */
export const LOCKED_AREAS: readonly { label: string; hint: string }[] = [
  { label: 'Ключи и сервисы', hint: 'Stripe, Firebase, Bunny, SES, Sentry… только супер-админ' },
  { label: 'Администраторы и сессии админов', hint: 'аккаунты, права, пароли и кто сейчас в админке; заместитель только смотрит' },
  { label: 'Цены, планы, аналитика, оплаты адвокатам, партнёры стран', hint: 'только супер-админ (заместитель смотрит)' },
  { label: 'Право «Доверенный заместитель»', hint: 'его выдаёт только супер-админ' },
];

interface AccessSubject {
  role: AdminRole;
  permissions?: Permissions;
  /** The super admin gave this admin the right to manage other admins. */
  canManageAdmins?: boolean;
  /** Owner 2026-10-06: member of a country partner's team. */
  countryPartnerId?: string | null;
  /** …and the partner themself (hires their own team). */
  partnerLead?: boolean;
}

/** Owner 2026-10-06: the most a country partner's team can hold (same
 * list as the API). The partner hires only for these. */
export const PARTNER_TEAM_AREAS: readonly { key: string; label: string; hint: string; max: AccessLevel }[] = [
  { key: 'dashboard', label: 'Дашборд', hint: 'цифры и очереди своей страны', max: 'view' },
  { key: 'users', label: 'Пользователи', hint: 'только просмотр', max: 'view' },
  { key: 'verification', label: 'Проверка адвокатов и мошенники', hint: 'документы, галочки, борьба с мошенниками', max: 'manage' },
  { key: 'moderation', label: 'Жалобы', hint: 'очередь модерации', max: 'manage' },
  { key: 'content', label: 'Посты и отзывы', hint: 'публикации, комментарии, отзывы', max: 'manage' },
  { key: 'media', label: 'Рилсы и стикеры', hint: 'видео', max: 'manage' },
  { key: 'cases', label: 'Кейсы и ставки', hint: 'кейсы, споры', max: 'manage' },
  { key: 'support', label: 'Поддержка', hint: 'обращения людей своей страны', max: 'manage' },
  { key: 'outreach', label: 'Привлечение', hint: 'база контактов, звонки, письма', max: 'manage' },
  { key: 'partner_report', label: 'Бухгалтер (отчёт)', hint: 'доход страны и начисления, только просмотр', max: 'view' },
];

/** Can this admin open [area] at [level]? Super admin: always. */
export function can(
  me: AccessSubject | undefined,
  area: string,
  level: AccessLevel = 'view',
): boolean {
  if (!me) return false;
  if (me.role === 'super_admin') return true;
  // A country partner's team: only inside the partner limits.
  if (me.countryPartnerId) {
    const max = PARTNER_TEAM_AREAS.find((a) => a.key === area)?.max;
    if (!max) return false;
    const have = me.permissions?.[area];
    const capped = have === 'manage' && max === 'view' ? 'view' : have;
    return capped === 'manage' || (capped === 'view' && level === 'view');
  }
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
export type CountKey = 'verification' | 'reports' | 'support' | 'appeals' | 'trust';

/** An area key, `everyone` for the personal workspace, `super` for
 * sections only the super admin opens, `moneyOwner` for owner-only money
 * pages the deputy may read, `config` for Настройки (settings or budget
 * caps), or `admins` for admin management (super admin or a granted manager). */
type SectionArea = string;

interface Section {
  href: string;
  label: string;
  /** Phosphor icon name, resolved in shell/icons.ts. */
  icon: string;
  area: SectionArea;
  count?: CountKey;
  /** Short hint for the command palette. */
  hint?: string;
}

/** Owner 2026-10-05: the menu is 9 sections; each opens on its first
 * allowed tab and shows the rest as tabs. Rights stay per tab (per page):
 * a tab without the right is not shown, a section with no allowed tab is
 * not in the menu, and its URLs answer 404 — exactly as before. */
interface SectionGroup {
  key: string;
  label: string;
  /** Phosphor icon name for the section itself. */
  icon: string;
  items: readonly Section[];
}

export const GROUPS: readonly SectionGroup[] = [
  {
    key: 'home',
    label: 'Дашборд',
    icon: 'gauge',
    items: [
      { href: '/', label: 'Дашборд', icon: 'gauge', area: 'dashboard', hint: 'цифры и очереди' },
      { href: '/workspace', label: 'Рабочее место', icon: 'briefcase-metal', area: 'everyone', hint: 'моя очередь: открыть, проверить, решить, следующий' },
      { href: '/partner', label: 'Кабинет партнёра', icon: 'handshake', area: 'partner', hint: 'договор, цели, отчёт по стране' },
    ],
  },
  {
    key: 'people',
    label: 'Люди',
    icon: 'users',
    items: [
      { href: '/users', label: 'Пользователи', icon: 'users', area: 'users', hint: 'поиск, санкции, сессии' },
      { href: '/teams', label: 'Команды адвокатов', icon: 'users-three', area: 'teams', hint: 'помощники и места' },
      { href: '/admins', label: 'Администраторы', icon: 'shield-check', area: 'admins', hint: 'сотрудники, права, пароли' },
      { href: '/rewards', label: 'Поощрения', icon: 'trophy', area: 'super', hint: 'лучший сотрудник по отделам, призы' },
    ],
  },
  {
    key: 'badges',
    label: 'Галочки',
    icon: 'seal-check',
    items: [
      { href: '/verification', label: 'Адвокаты', icon: 'seal-check', area: 'verification', count: 'verification', hint: 'лицензии и галочки адвокатов' },
      { href: '/verification/trust', label: 'Борьба с мошенниками', icon: 'shield-check', area: 'verification', count: 'trust', hint: 'что требовать от адвокатов и очередь проверки' },
      { href: '/client-badges', label: 'Клиенты', icon: 'shield-check', area: 'verification', hint: 'платная золотая галочка' },
    ],
  },
  {
    key: 'moderation',
    label: 'Модерация',
    icon: 'flag',
    items: [
      { href: '/moderation', label: 'Жалобы', icon: 'flag', area: 'moderation', count: 'reports', hint: 'очередь модерации' },
      { href: '/review-appeals', label: 'Обжалования отзывов', icon: 'scales', area: 'moderation', count: 'appeals' },
      { href: '/moderation-appeals', label: 'Обжалования решений', icon: 'scales', area: 'moderation', hint: 'автор просит вернуть скрытый пост, комментарий или сообщение' },
      { href: '/moderation-journal', label: 'Журнал решений', icon: 'article', area: 'moderation', hint: 'кто, когда и почему скрыл, удалил, предупредил' },
      { href: '/group-chats', label: 'Группы', icon: 'users-three', area: 'moderation', hint: 'групповые чаты, участники' },
      { href: '/sanctions', label: 'Санкции', icon: 'prohibit', area: 'sanctions', hint: 'блокировки и баны' },
      { href: '/content', label: 'Посты и отзывы', icon: 'article', area: 'content', hint: 'посты, комментарии, отзывы' },
      { href: '/media', label: 'Рилсы и стикеры', icon: 'film-strip', area: 'media', hint: 'видео, наборы стикеров' },
      { href: '/document-templates', label: 'Шаблоны документов', icon: 'file-text', area: 'content', hint: 'PDF и Word для приложения' },
      { href: '/search', label: 'Поиск', icon: 'magnifying-glass', area: 'content', hint: 'синонимы, что не нашлось, чему научился' },
    ],
  },
  {
    key: 'cases',
    label: 'Кейсы',
    icon: 'briefcase',
    items: [
      { href: '/cases', label: 'Кейсы', icon: 'briefcase', area: 'cases', hint: 'кейсы, споры, «не могу связаться»' },
      { href: '/bids', label: 'Ставки', icon: 'gavel', area: 'cases' },
      { href: '/promotions', label: 'Продвижение', icon: 'rocket-launch', area: 'money', hint: 'платное продвижение постов и кейсов, как в Instagram' },
    ],
  },
  {
    key: 'money',
    label: 'Деньги',
    icon: 'wallet',
    items: [
      { href: '/analytics', label: 'Аналитика', icon: 'chart-line', area: 'moneyOwner', hint: 'кто заходит, воронка, отток, покупки' },
      { href: '/prices', label: 'Цены', icon: 'tag', area: 'moneyOwner', hint: 'стоимость тарифов и галочки' },
      { href: '/plans', label: 'Планы', icon: 'stack', area: 'moneyOwner', hint: 'планы подписок и их возможности' },
      { href: '/subscriptions', label: 'Подписки', icon: 'crown-simple', area: 'money', hint: 'тарифы адвокатов' },
      { href: '/contracts', label: 'По договору', icon: 'handshake', area: 'money', hint: 'бесплатно блогерам 3–12 мес.' },
      { href: '/payments', label: 'Платежи и возвраты', icon: 'receipt', area: 'money' },
      { href: '/case-payments', label: 'Оплаты адвокатам', icon: 'hand-coins', area: 'moneyOwner', hint: 'клиент платит адвокату через Stripe Connect' },
      { href: '/promo-codes', label: 'Промокоды', icon: 'ticket', area: 'money' },
      { href: '/referrals', label: 'Рефералы', icon: 'share-network', area: 'money', hint: 'скидки за приглашения' },
      { href: '/partners', label: 'Партнёры', icon: 'handshake', area: 'money', hint: 'блогеры и агенты: плата за адвокатов и клиентов' },
      { href: '/country-partners', label: 'Партнёры стран', icon: 'globe', area: 'moneyOwner', hint: 'главный партнёр страны: команда, процент, цели' },
      { href: '/payroll', label: 'Зарплаты', icon: 'wallet', area: 'payroll', hint: 'сотрудники, массовая выплата' },
      { href: '/treasury', label: 'Прибыль и резерв', icon: 'bank', area: 'money', hint: 'расходы отдельно, на карту — чистая прибыль' },
    ],
  },
  {
    key: 'comms',
    label: 'Связь',
    icon: 'lifebuoy',
    items: [
      { href: '/support', label: 'Поддержка', icon: 'lifebuoy', area: 'support', count: 'support', hint: 'обращения пользователей' },
      { href: '/broadcasts', label: 'Рассылки', icon: 'megaphone', area: 'broadcasts', hint: 'пуш всем или сегменту' },
      { href: '/email-templates', label: 'Шаблоны писем', icon: 'envelope-simple', area: 'email_templates' },
      { href: '/outreach', label: 'Привлечение', icon: 'address-book', area: 'outreach', hint: 'база контактов, звонки, письма, кто сколько сделал' },
    ],
  },
  {
    key: 'security',
    label: 'Безопасность',
    icon: 'lock',
    items: [
      { href: '/audit-log', label: 'Журнал аудита', icon: 'clock-counter-clockwise', area: 'audit', hint: 'кто что сделал' },
      { href: '/sessions', label: 'Сессии админов', icon: 'devices', area: 'moneyOwner', hint: 'кто сейчас в админке' },
      { href: '/integrations', label: 'Ключи и сервисы', icon: 'key', area: 'super', hint: 'API-ключи, ротация' },
      { href: '/data-requests', label: 'Запросы госорганов', icon: 'bank', area: 'data_requests' },
    ],
  },
  {
    key: 'system',
    label: 'Система',
    icon: 'sliders-horizontal',
    items: [
      { href: '/economy', label: 'Экономика', icon: 'chart-line', area: 'super', hint: 'доход и расходы на сторонние сервисы, потолок серверов' },
      { href: '/system-health', label: 'Здоровье системы', icon: 'heartbeat', area: 'super', hint: 'серверы, база, бэкапы, расходы — всё ли в порядке' },
      { href: '/crashes', label: 'Вылеты', icon: 'bug', area: 'settings', hint: 'ошибки приложения: где, на каких телефонах' },
      { href: '/flags', label: 'Функции', icon: 'toggle-right', area: 'settings', hint: 'флаги, скрытые функции' },
      { href: '/config', label: 'Настройки', icon: 'sliders-horizontal', area: 'config', hint: 'лимиты, версии приложения' },
      { href: '/storage', label: 'Хранилище', icon: 'hard-drives', area: 'settings', hint: 'место, очистка, лимиты' },
      // Owner 2026-10-07 (bug 17): every upload limit and file format.
      { href: '/uploads', label: 'Загрузки и файлы', icon: 'paperclip', area: 'settings', hint: 'сколько файлов, размер, форматы' },
      { href: '/practice-areas', label: 'Квалификации', icon: 'books', area: 'content' },
      { href: '/i18n', label: 'Локализация', icon: 'translate', area: 'localization' },
      // Owner 2026-10-18: the app's «Справочник» texts, every language.
      { href: '/guide', label: 'Справочник', icon: 'books', area: 'localization', hint: 'тексты кнопки «i» в списке дел' },
      { href: '/countries', label: 'Страны', icon: 'globe', area: 'localization', hint: 'где работает приложение' },
      { href: '/legal-documents', label: 'Юридические документы', icon: 'file-text', area: 'legal', hint: 'все документы: черновики, публикация, история' },
      // Owner 2026-10-05 (legal): DMCA notices, disclaimers, incident contact.
      { href: '/legal-settings', label: 'Право и жалобы', icon: 'scales', area: 'legal', hint: 'DMCA, дисклеймеры, контакт при инцидентах' },
      { href: '/exports', label: 'Выгрузки CSV', icon: 'download-simple', area: 'exports' },
    ],
  },
];

export const SECTIONS: readonly Section[] = GROUPS.flatMap((g) => g.items);

function opens(me: AccessSubject, s: Section): boolean {
  // Every admin has their own workspace (it shows only their own queues).
  if (s.area === 'everyone') return true;
  // Owner 2026-10-06: the partner team's own page.
  if (s.area === 'partner') return !!me.countryPartnerId;
  if (s.area === 'super') return me.role === 'super_admin';
  // Owner-only money pages (prices, plans, analytics, payments to attorneys,
  // country partners, admin sessions); the deputy reads them.
  if (s.area === 'moneyOwner') return me.role === 'super_admin' || me.canManageAdmins === true;
  // Настройки: the whole page, or just the budget caps card.
  if (s.area === 'config') return can(me, 'settings') || can(me, 'budget_limits');
  // Admin management: the super admin, an admin given that right, or a
  // country partner (their own team only).
  if (s.area === 'admins') return me.role === 'super_admin' || me.canManageAdmins === true || me.partnerLead === true;
  return can(me, s.area);
}

export function groupsFor(me: AccessSubject): SectionGroup[] {
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => opens(me, s)) })).filter((g) => g.items.length > 0);
}

/** The menu section a page belongs to. */
export function groupFor(pathname: string): SectionGroup | undefined {
  const s = sectionFor(pathname);
  return s ? GROUPS.find((g) => g.items.includes(s)) : undefined;
}

/** The tabs of [pathname]'s section this admin may open (empty if none). */
export function tabsFor(me: AccessSubject, pathname: string): Section[] {
  const g = groupFor(pathname);
  return g ? g.items.filter((s) => opens(me, s)) : [];
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

/** What a set of toggles means in words (owner 2026-10-16): shown on the
 * rights form and the invite dialog so nobody guesses the effective access. */
export interface RightsSummary {
  manage: string[];
  view: string[];
  closed: string[];
}

export function summarizeRights(perms: Permissions, areas: readonly { key: string; label: string }[] = GRANTABLE_AREAS): RightsSummary {
  const out: RightsSummary = { manage: [], view: [], closed: [] };
  for (const a of areas) {
    const lvl = perms[a.key];
    if (lvl === 'manage') out.manage.push(a.label);
    else if (lvl === 'view') out.view.push(a.label);
    else out.closed.push(a.label);
  }
  return out;
}

/** A preset or template cut down to what [me] may hand out (the API caps it too). */
export function fitToMe(
  perms: Record<string, string>,
  me: { role: AdminRole; permissions: Permissions } | undefined,
): Record<string, AccessLevel> {
  const own = me?.permissions ?? {};
  const out: Record<string, AccessLevel> = {};
  for (const [k, v] of Object.entries(perms)) {
    const def = GRANTABLE_AREAS.find((a) => a.key === k);
    if (!def) continue;
    if (me?.role === 'super_admin') out[k] = v as AccessLevel;
    else if (def.ownerGrants) continue;
    else if (own[k] === 'manage') out[k] = v as AccessLevel;
    else if (own[k] === 'view') out[k] = 'view';
  }
  return out;
}
