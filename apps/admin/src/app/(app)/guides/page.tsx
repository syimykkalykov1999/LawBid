import { notFound, redirect } from 'next/navigation';
import { GuidesList } from '@/components/guides-list';
import { PageHeader } from '@/components/page-header';
import { apiBaseUrl, sessionToken } from '@/lib/api/server';
import { isOwnerSession } from '@/lib/growth-plan';
import { guideForStep } from '@/lib/guides';
import { loadGuides } from '@/lib/guides-server';

// Per request: the access check depends on the session cookie.
export const dynamic = 'force-dynamic';

/**
 * «Инструкции» — owner-only list of the step-by-step guides in
 * apps/admin/content/guides. `?step=<id>` (the link on each «Запуск» card)
 * jumps straight to the guide of that step.
 */
export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  if (!(await isOwnerSession(await sessionToken(), apiBaseUrl()))) notFound();
  const guides = await loadGuides();
  const { step } = await searchParams;
  if (step) {
    const g = guideForStep(guides, step);
    if (g) redirect(`/guides/${g.id}`);
  }
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Инструкции"
        subtitle="Что нужно сделать вручную вне нашего кода: где зарегистрироваться, что нажать, что скопировать и куда вставить. Названия кнопок на чужих сайтах написаны по-английски, как там. Только для владельца."
      />
      <GuidesList guides={guides} />
    </>
  );
}
