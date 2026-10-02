'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FadeIn } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { CASE_STATUS, JOURNAL_EVENT, label, PARTY_ROLE, partyName } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** docs/06 §2.3 item 5: chronology from case_journal + the decision. */
export default function DisputeCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['dispute', id],
    queryFn: async () => (await api.GET('/admin/case-disputes/{id}', { params: { path: { id } } })).data!.data,
  });
  const d = q.data;
  const resolve = useMutation({
    mutationFn: async (decision: 'closed' | 'in_progress') => {
      const a = await ask({
        title: decision === 'closed' ? 'Закрыть кейс' : 'Вернуть в работу',
        description: 'Обе стороны получат уведомление; комментарий попадёт в журнал кейса.',
        label: 'Комментарий',
        min: 3,
        max: 1000,
        confirm: decision === 'closed' ? 'Закрыть' : 'Вернуть в работу',
        danger: decision === 'closed',
      });
      if (!a) return null;
      await api.POST('/admin/case-disputes/{id}/resolve', { params: { path: { id } }, body: { decision, note: a.text } });
      return decision;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(r === 'closed' ? 'Спор решён, кейс закрыт' : 'Спор решён, кейс снова в работе');
      void qc.invalidateQueries({ queryKey: ['disputes'] });
      void qc.invalidateQueries({ queryKey: ['dispute', id] });
      router.push('/cases');
    },
    onError: (e) => toast.error(e),
  });

  if (!d) {
    return (
      <>
        <PageHeader eyebrow="Кейсы · Спор" title="Спор" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
            <Skeleton className="h-64 rounded-[var(--radius-lg)] lg:col-span-2" />
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Кейсы · Спор"
        title={d.case.title}
        subtitle={`Кейс ${label(CASE_STATUS, d.case.status)} · открыл ${label(PARTY_ROLE, d.openedByRole)} ${formatDateTime(d.createdAt)}`}
        actions={
          d.status === 'open' ? (
            <>
              <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate('in_progress')}>
                Вернуть в работу
              </Button>
              <Button size="sm" variant="danger" disabled={resolve.isPending} onClick={() => resolve.mutate('closed')}>
                Закрыть кейс
              </Button>
            </>
          ) : (
            <Badge tone="success" dot>
              решён {formatDateTime(d.resolvedAt)}
            </Badge>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Заявленная причина</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{d.reason}</p>
            {d.resolutionNote ? (
              <p className="rounded-xl bg-surface-2 p-2.5 text-xs">
                <b>Решение:</b> {d.resolutionNote}
              </p>
            ) : null}
            <div className="text-xs text-muted">
              Клиент:{' '}
              {d.case.client ? <Link className="text-gold-600 hover:underline" href={`/users/${d.case.client.id}`}>{partyName(d.case.client)}</Link> : '—'}
              <br />
              Адвокат:{' '}
              {d.case.attorney ? <Link className="text-gold-600 hover:underline" href={`/users/${d.case.attorney.id}`}>{partyName(d.case.attorney)}</Link> : '—'}
              <br />
              Других споров у открывшего: {d.openerDisputes}
              <br />
              <Link className="text-gold-600 hover:underline" href={`/cases/${d.case.id}`}>
                Открыть кейс →
              </Link>
            </div>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={1} className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Хронология кейса</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-3 border-l border-line pl-4 text-sm">
              {d.journal.map((j) => (
                <li key={j.id}>
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-gold" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-heading">{JOURNAL_EVENT[j.eventType] ?? j.eventType}</span>
                    <span className="text-xs text-muted">
                      {j.actorRole ? label(PARTY_ROLE, j.actorRole) : 'система'} · {formatDateTime(j.createdAt)}
                    </span>
                  </div>
                  {j.payload && Object.keys(j.payload as object).length ? (
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer">детали</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2">{JSON.stringify(j.payload, null, 2)}</pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        </FadeIn>
      </div>
    </>
  );
}
