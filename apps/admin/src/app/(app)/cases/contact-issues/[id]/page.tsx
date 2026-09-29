'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorText } from '@/lib/api/client';
import { CASE_STATUS, ISSUE_TYPE, partyName } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** docs/06 §2.3 item 5 / file 04 §8.4: confirmed or rejected with a
 * comment; the 3rd confirmed report suspends the client server-side. */
export default function ContactIssueCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['contact-issue', id],
    queryFn: async () => (await api.GET('/admin/contact-issues/{id}', { params: { path: { id } } })).data!.data,
  });
  const r = q.data;
  const decide = useMutation({
    mutationFn: async (decision: 'confirmed' | 'rejected') => {
      const a = await ask({
        title: decision === 'confirmed' ? 'Подтвердить обращение' : 'Отклонить обращение',
        description:
          decision === 'confirmed'
            ? `Клиент получит предупреждение; после ${r?.suspendThreshold ?? 3} подтверждённых обращений аккаунт приостанавливается.`
            : 'Обе стороны получат уведомление о результате.',
        label: 'Комментарий',
        min: 3,
        max: 1000,
        confirm: decision === 'confirmed' ? 'Подтвердить' : 'Отклонить',
        danger: decision === 'confirmed',
      });
      if (!a) return null;
      return api.POST('/admin/contact-issues/{id}/resolve', { params: { path: { id } }, body: { decision, note: a.text } });
    },
    onSuccess: (res) => {
      if (!res) return;
      void qc.invalidateQueries({ queryKey: ['contact-issues'] });
      router.push('/cases');
    },
    onError: (e) => setError(errorText(e)),
  });

  if (!r) {
    return (
      <>
        <PageHeader title="Обращение" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
      </>
    );
  }
  return (
    <>
      {dialog}
      <PageHeader
        title={`«Не могу связаться»: ${r.case.title}`}
        subtitle={`${ISSUE_TYPE[r.issueType] ?? r.issueType} · ${formatDateTime(r.createdAt)} · кейс ${CASE_STATUS[r.case.status] ?? r.case.status}`}
        actions={
          r.status === 'open' ? (
            <>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate('rejected')}>
                Отклонить
              </Button>
              <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate('confirmed')}>
                Подтвердить
              </Button>
            </>
          ) : (
            <Badge tone={r.status === 'confirmed' ? 'danger' : 'neutral'}>{r.status === 'confirmed' ? 'подтверждено' : 'отклонено'}</Badge>
          )
        }
      />
      <ErrorNote text={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Обращение адвоката</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{r.note ?? <span className="text-muted">без комментария</span>}</p>
            <div className="text-xs text-muted">
              Адвокат: {r.attorney ? <Link className="text-navy underline" href={`/users/${r.attorney.id}`}>{partyName(r.attorney)}</Link> : '—'}
            </div>
            <div className="text-xs text-muted">
              Контакты раскрыты {formatDateTime(r.disclosedAt)}: {r.disclosedFields.join(', ') || '—'}
            </div>
            {r.resolutionNote ? (
              <p className="rounded-md bg-canvas p-2 text-xs">
                <b>Решение:</b> {r.resolutionNote}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Клиент</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.case.client ? (
              <Link className="font-medium text-navy underline" href={`/users/${r.case.client.id}`}>
                {partyName(r.case.client)}
              </Link>
            ) : '—'}
            <div>
              Подтверждённых обращений:{' '}
              <Badge tone={r.clientConfirmedReports >= r.suspendThreshold - 1 ? 'danger' : 'neutral'}>
                {r.clientConfirmedReports} / {r.suspendThreshold}
              </Badge>
            </div>
            <div className="text-xs text-muted">Статус аккаунта: {r.case.client?.status ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Другие обращения на клиента</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {r.clientHistory.length === 0 ? <p className="text-muted">Нет</p> : null}
            <ul className="space-y-1 text-xs">
              {r.clientHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <Link href={`/cases/contact-issues/${h.id}`} className="text-navy underline">
                    {ISSUE_TYPE[h.issueType] ?? h.issueType}
                  </Link>
                  <span>
                    {h.status} · {formatDateTime(h.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
