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
import { CASE_STATUS, CONTACT_ISSUE_STATUS, ISSUE_TYPE, label, partyName, STATUS_LABEL, StatusPill } from '@/lib/labels';

const DISCLOSED_FIELD: Record<string, string> = { phone: 'телефон', email: 'email', note: 'заметка' };
import { formatDateTime } from '@/lib/utils';

/** docs/06 §2.3 item 5 / file 04 §8.4: confirmed or rejected with a
 * comment; the 3rd confirmed report suspends the client server-side. */
export default function ContactIssueCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const toast = useToast();
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
      await api.POST('/admin/contact-issues/{id}/resolve', { params: { path: { id } }, body: { decision, note: a.text } });
      return decision;
    },
    onSuccess: (res) => {
      if (!res) return;
      toast.success(res === 'confirmed' ? 'Обращение подтверждено' : 'Обращение отклонено');
      void qc.invalidateQueries({ queryKey: ['contact-issues'] });
      void qc.invalidateQueries({ queryKey: ['contact-issue', id] });
      router.push('/cases');
    },
    onError: (e) => toast.error(e),
  });

  if (!r) {
    return (
      <>
        <PageHeader eyebrow="Кейсы · «Не могу связаться»" title="Обращение" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Кейсы · «Не могу связаться»"
        title={r.case.title}
        subtitle={`${label(ISSUE_TYPE, r.issueType)} · ${formatDateTime(r.createdAt)} · кейс ${label(CASE_STATUS, r.case.status)}`}
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
            <Badge tone={r.status === 'confirmed' ? 'danger' : 'neutral'} dot>
              {label(CONTACT_ISSUE_STATUS, r.status)}
            </Badge>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Обращение адвоката</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{r.note ?? <span className="text-muted">без комментария</span>}</p>
            <div className="text-xs text-muted">
              Адвокат: {r.attorney ? <Link className="text-gold-600 hover:underline" href={`/users/${r.attorney.id}`}>{partyName(r.attorney)}</Link> : '—'}
            </div>
            <div className="text-xs text-muted">
              Контакты раскрыты {formatDateTime(r.disclosedAt)}: {r.disclosedFields.map((f) => DISCLOSED_FIELD[f] ?? f).join(', ') || '—'}
            </div>
            {r.resolutionNote ? (
              <p className="rounded-xl bg-surface-2 p-2.5 text-xs">
                <b>Решение:</b> {r.resolutionNote}
              </p>
            ) : null}
            <Link className="text-xs text-gold-600 hover:underline" href={`/cases/${r.case.id}`}>
              Открыть кейс →
            </Link>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={1}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Клиент</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.case.client ? (
              <Link className="font-medium text-heading hover:underline" href={`/users/${r.case.client.id}`}>
                {partyName(r.case.client)}
              </Link>
            ) : '—'}
            <div>
              Подтверждённых обращений:{' '}
              <Badge tone={r.clientConfirmedReports >= r.suspendThreshold - 1 ? 'danger' : 'neutral'}>
                {r.clientConfirmedReports} / {r.suspendThreshold}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              Статус аккаунта: <StatusPill map={STATUS_LABEL} value={r.case.client?.status} />
            </div>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={2}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Другие обращения на клиента</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {r.clientHistory.length === 0 ? <p className="text-muted">Нет</p> : null}
            <ul className="space-y-1 text-xs">
              {r.clientHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <Link href={`/cases/contact-issues/${h.id}`} className="text-gold-600 hover:underline">
                    {ISSUE_TYPE[h.issueType] ?? h.issueType}
                  </Link>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusPill map={CONTACT_ISSUE_STATUS} value={h.status} />
                    <span className="text-faint">{formatDateTime(h.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        </FadeIn>
      </div>
    </>
  );
}
