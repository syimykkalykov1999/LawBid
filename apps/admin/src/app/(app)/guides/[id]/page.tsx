import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideDone } from '@/components/guide-done';
import { Markdown } from '@/components/markdown';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { apiBaseUrl, sessionToken } from '@/lib/api/server';
import { isOwnerSession } from '@/lib/growth-plan';
import { categoryTitle, isStale, verifiedWord } from '@/lib/guides';
import { loadGuides } from '@/lib/guides-server';

export const dynamic = 'force-dynamic';

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerSession(await sessionToken(), apiBaseUrl()))) notFound();
  const { id } = await params;
  const g = (await loadGuides()).find((x) => x.id === id);
  if (!g) notFound();
  return (
    <>
      <PageHeader
        eyebrow={categoryTitle(g.category)}
        title={g.title}
        subtitle={
          <>
            <Link href="/guides" className="text-gold-600 underline-offset-2 hover:underline">
              ← Все инструкции
            </Link>
            {' · '}
            Время: {g.time}. Цена: {g.cost}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <GuideDone guide={g} />
        {g.launch.length > 0 ? (
          <Link href="/launch" className="text-sm text-gold-600 underline-offset-2 hover:underline">
            Открыть «Запуск»
          </Link>
        ) : null}
      </div>
      <Markdown source={g.body} />
      <section className="mt-8 max-w-3xl border-t border-line pt-4">
        <h2 className="mb-2 text-sm font-semibold text-heading">Источники</h2>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          {verifiedWord(g.verified)}
          {isStale(g.verified) ? <Badge tone="warning">пора перепроверить: сайты меняются</Badge> : null}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {g.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gold-500 underline underline-offset-2 break-words">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
