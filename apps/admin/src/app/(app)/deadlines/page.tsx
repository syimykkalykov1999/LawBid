'use client';

import { useQuery } from '@tanstack/react-query';
import { DeadlinesPanel } from '@/components/content/deadlines-panel';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';

/** Owner 2026-10-20 — Cases → Deadlines: court periods, statutes of limitations, court holidays. */
export default function DeadlinesPage() {
  const me = useMe().data;
  // Owner 2026-10-20: the calculator is off for legal-risk reasons; the
  // reference data stays editable, and the owner turns it on in «Функции».
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Array<{ key: string; enabled: boolean }>,
    enabled: can(me, 'settings'),
  }).data;
  const off = flags?.some((f) => f.key === 'deadline_calculator' && !f.enabled) ?? false;
  return (
    <>
      <PageHeader
        eyebrow="Кейсы"
        title="Сроки"
        subtitle="Справочник для калькулятора сроков в приложении: сроки судов и давности по категориям, выходные дни судов. Приложение только считает по этим правилам и пишет «проверьте у суда». Отметьте правило «проверено», когда сверили его с источником."
      />
      {off ? (
        <div className="mb-4 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-4 text-sm text-muted">
          Калькулятор сроков выключен в приложении (флаг «deadline_calculator» в «Функциях»). Справочник можно править, но пользователи его не видят.
        </div>
      ) : null}
      <DeadlinesPanel />
    </>
  );
}
