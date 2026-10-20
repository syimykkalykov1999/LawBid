'use client';

import { DeadlinesPanel } from '@/components/content/deadlines-panel';
import { PageHeader } from '@/components/page-header';

/** Owner 2026-10-20 — Cases → Deadlines: court periods, statutes of limitations, court holidays. */
export default function DeadlinesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Кейсы"
        title="Сроки"
        subtitle="Справочник для калькулятора сроков в приложении: сроки судов и давности по категориям, выходные дни судов. Приложение только считает по этим правилам и пишет «проверьте у суда». Отметьте правило «проверено», когда сверили его с источником."
      />
      <DeadlinesPanel />
    </>
  );
}
