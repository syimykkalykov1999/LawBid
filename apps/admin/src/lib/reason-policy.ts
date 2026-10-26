import { usePathname } from 'next/navigation';
import { useMe, type Me } from '@/lib/hooks';
import { sectionFor } from '@/lib/rbac';

/** Owner 2026-10-05: the setting with the sections where staff admins must
 * write a reason; the owner (super admin) never has to. */
export const REASON_AREAS_KEY = 'admin.reason_required_areas';

/** Minimum length when a reason is required (the API checks the same). */
export const REASON_MIN = 3;

/** The sections the owner can switch on, money first. */
export const REASON_AREAS: readonly { key: string; label: string }[] = [
  { key: 'money', label: 'Деньги: цены, подписки, возвраты, промокоды, договоры, рефералы' },
  { key: 'payroll', label: 'Зарплаты' },
  { key: 'moderation', label: 'Жалобы и обжалования' },
  { key: 'sanctions', label: 'Санкции' },
  { key: 'users', label: 'Пользователи' },
  { key: 'verification', label: 'Верификация и галочки' },
  { key: 'content', label: 'Посты и отзывы' },
  { key: 'media', label: 'Рилсы и стикеры' },
  { key: 'cases', label: 'Кейсы и ставки' },
  { key: 'teams', label: 'Команды адвокатов' },
  { key: 'support', label: 'Поддержка' },
];

export function reasonRequired(me: Pick<Me, 'role' | 'reasonRequiredAreas'> | undefined, area: string | undefined): boolean {
  if (!me || !area || me.role === 'super_admin') return false;
  return (me.reasonRequiredAreas ?? []).includes(area);
}

/** Is a reason required for an action in [area] (default: the current
 * page's section) for the signed-in admin? */
export function useReasonRequired(area?: string): boolean {
  const { data: me } = useMe();
  const pathname = usePathname();
  return reasonRequired(me, area ?? sectionFor(pathname ?? '/')?.area);
}
