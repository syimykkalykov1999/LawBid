'use client';

import { PageHeader } from '@/components/page-header';
import { FormTemplatesPanel } from '@/components/content/form-templates-panel';

/** Owner 2026-10-20 — Content → Document forms. */
export default function FormTemplatesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Контент"
        title="Формы документов"
        subtitle="Текст документа на нескольких языках с местами {{ключ}} и список полей. Адвокат в кейсе отвечает на вопросы, а приложение собирает готовый документ."
      />
      <FormTemplatesPanel />
    </>
  );
}
