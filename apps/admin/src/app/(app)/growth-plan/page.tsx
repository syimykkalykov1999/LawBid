import { notFound } from 'next/navigation';
import { Markdown } from '@/components/markdown';
import { PageHeader } from '@/components/page-header';
import { apiBaseUrl, sessionToken } from '@/lib/api/server';
import { isOwnerSession, loadGrowthPlan } from '@/lib/growth-plan';

// Per request: the access check depends on the session cookie.
export const dynamic = 'force-dynamic';

/**
 * «План роста» — the owner's manual for what to switch on as the platform
 * grows. Owner only, and checked here on the server: anybody else gets the
 * normal «not found» and the text is never read, let alone sent. The text
 * itself is apps/admin/content/growth-plan.ru.md (edit it, no code change).
 */
export default async function GrowthPlanPage() {
  if (!(await isOwnerSession(await sessionToken(), apiBaseUrl()))) notFound();
  const source = await loadGrowthPlan();
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="План роста"
        subtitle="Что включать, когда людей становится больше: по шагам, простыми словами. Только для владельца."
      />
      <Markdown source={source} />
    </>
  );
}
