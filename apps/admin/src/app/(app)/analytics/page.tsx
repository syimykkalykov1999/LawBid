'use client';

import { AnalyticsAdmin } from '@/components/analytics/analytics-admin';
import { PageHeader } from '@/components/page-header';

/** Owner 2026-10-15: our own analytics. */
export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Аналитика"
        subtitle="Кто заходит, как новые люди доходят до первого действия и до оплаты, кто пропал и что покупают. Считается в нашей базе, без внешних сервисов."
      />
      <AnalyticsAdmin />
    </>
  );
}
