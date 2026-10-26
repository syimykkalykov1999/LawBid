'use client';

import { CrashesAdmin } from '@/components/crashes/crashes-admin';
import { PageHeader } from '@/components/page-header';

/** Owner 2026-10-15: the app's own crash reports. */
export default function CrashesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Вылеты приложения"
        subtitle="Ошибки, которые приложение само присылает: что упало, где, на каких телефонах и версиях, сколько людей задело. Данные хранятся 30 дней."
      />
      <CrashesAdmin />
    </>
  );
}
