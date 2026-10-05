'use client';

import { PageHeader } from '@/components/page-header';
import { DocumentTemplatesPanel } from '@/components/content/document-templates-panel';

/** Owner 2026-10-05 — Content → Document templates. */
export default function DocumentTemplatesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Контент"
        title="Шаблоны документов"
        subtitle="Библиотека PDF и Word для приложения: загрузите файл, укажите практику, штат, язык и кому виден. Пользователи скачивают шаблон или прикрепляют его к делу и в чат в одно касание."
      />
      <DocumentTemplatesPanel />
    </>
  );
}
