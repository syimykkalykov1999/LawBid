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

export interface Section {
  href: string;
  label: string;
  roles: readonly AdminRole[];
  /** Built in a later stage of docs/06 — shown, not yet clickable. */
  soon?: boolean;
}

const ALL: readonly AdminRole[] = [
  'super_admin',
  'moderator',
  'verifier',
  'support',
  'finance',
];

export const SECTIONS: readonly Section[] = [
  { href: '/', label: 'Дашборд', roles: ALL },
  { href: '/verification', label: 'Верификация', roles: ['super_admin', 'verifier'] },
  { href: '/users', label: 'Пользователи', roles: ['super_admin', 'moderator', 'support'] },
  { href: '/moderation', label: 'Модерация', roles: ['super_admin', 'moderator'] },
  { href: '/cases', label: 'Кейсы', roles: ['super_admin', 'support'] },
  { href: '/subscriptions', label: 'Подписки и платежи', roles: ['super_admin', 'support', 'finance'], soon: true },
  { href: '/flags', label: 'Флаги функций', roles: ['super_admin'] },
  { href: '/config', label: 'Конфигурация', roles: ['super_admin'] },
  { href: '/i18n', label: 'Локализация', roles: ['super_admin'] },
  { href: '/legal', label: 'Юридические документы', roles: ['super_admin'] },
  { href: '/data-requests', label: 'Запросы госорганов', roles: ['super_admin'] },
  { href: '/audit-log', label: 'Журнал аудита', roles: ALL },
  { href: '/admins', label: 'Администраторы', roles: ['super_admin'] },
];

export function sectionsFor(role: AdminRole): Section[] {
  return SECTIONS.filter((s) => s.roles.includes(role));
}
