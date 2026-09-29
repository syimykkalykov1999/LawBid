'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { CONTENT_STATUS, MOD_ACTION, REPORT_REASON, TARGET_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type TType = 'post' | 'comment' | 'message' | 'user' | 'case' | 'review';
type Action = 'hide' | 'remove' | 'warn' | 'suspend' | 'restore' | 'dismiss';

const DANGER: Action[] = ['remove', 'suspend'];

/** docs/06 §3.2 card: object + context, reasons, author, history; every
 * action asks for a reason and is audited server-side. */
export default function ModerationCardPage() {
  const { type, id } = useParams<{ type: TType; id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['moderation-card', type, id],
    queryFn: async () =>
      (await api.GET('/admin/moderation/targets/{type}/{id}', { params: { path: { type, id } } })).data!.data,
  });
  const c = q.data;

  const act = useMutation({
    mutationFn: async (action: Action) => {
      const a = await ask({
        title: MOD_ACTION[action],
        description:
          action === 'dismiss'
            ? 'Открытые жалобы будут закрыты без уведомления автора.'
            : 'Автор получит уведомление модерации; действие попадёт в журнал аудита.',
        label: 'Причина',
        min: 3,
        confirm: MOD_ACTION[action],
        danger: DANGER.includes(action),
      });
      if (!a) return null;
      return api.POST('/admin/moderation/targets/{type}/{id}/actions', {
        params: { path: { type, id } },
        body: { action, reason: a.text },
      });
    },
    onSuccess: (r) => {
      if (!r) return;
      setError(null);
      void qc.invalidateQueries({ queryKey: ['moderation-card', type, id] });
      void qc.invalidateQueries({ queryKey: ['moderation-queue'] });
      if ((r.data?.data.reportsHandled ?? 0) > 0) router.push('/moderation');
    },
    onError: (e) => setError(errorText(e)),
  });

  if (!c) {
    return (
      <>
        <PageHeader title="Жалоба" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
      </>
    );
  }
  const open = c.reports.filter((r) => r.status === 'open').length;

  return (
    <>
      {dialog}
      <PageHeader
        title={`${TARGET_TYPE[c.targetType] ?? c.targetType}${c.status ? ` · ${CONTENT_STATUS[c.status] ?? c.status}` : ''}`}
        subtitle={`${c.targetId} · открытых жалоб: ${open}`}
        actions={
          <>
            {c.availableActions
              .filter((a) => a !== 'dismiss')
              .map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant={DANGER.includes(a) ? 'danger' : a === 'restore' ? 'gold' : 'outline'}
                  disabled={act.isPending}
                  onClick={() => act.mutate(a)}
                >
                  {MOD_ACTION[a]}
                </Button>
              ))}
            {open > 0 ? (
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate('dismiss')}>
                {MOD_ACTION.dismiss}
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorNote text={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Объект</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.text ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans">{c.text}</pre>
            ) : (
              <p className="text-muted">Без текста</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {c.createdAt ? <span>создан {formatDateTime(c.createdAt)}</span> : null}
              {Object.entries(c.context as Record<string, string | null>)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <span key={k} className="font-mono">
                    {k}: {String(v)}
                  </span>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Автор</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.author ? (
              <>
                <Link href={`/users/${c.author.id}`} className="font-medium text-navy underline">
                  {[c.author.firstName, c.author.lastName].filter(Boolean).join(' ') || c.author.username || c.author.id}
                </Link>
                <div className="text-xs text-muted">
                  {c.author.role ?? '—'} · {c.author.status}
                  {c.author.username ? ` · @${c.author.username}` : ''}
                </div>
                <div className="text-xs">
                  предупреждений: {c.author.warnings} · приостановок: {c.author.suspensions}
                </div>
              </>
            ) : (
              <p className="text-muted">Неизвестен</p>
            )}
            <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">История</h3>
            {c.authorHistory.length === 0 ? <p className="text-xs text-muted">Нарушений нет</p> : null}
            <ul className="space-y-1 text-xs">
              {c.authorHistory.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{MOD_ACTION[h.action] ?? h.action}</span> · {TARGET_TYPE[h.targetType] ?? h.targetType} ·{' '}
                  {formatDateTime(h.createdAt)}
                  {h.reason ? <div className="text-muted">{h.reason}</div> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted">Жалобы</h2>
        <Table>
          <thead>
            <tr>
              <Th>Когда</Th>
              <Th>Причина</Th>
              <Th>Комментарий</Th>
              <Th>Кто</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {c.reports.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                <Td>{REPORT_REASON[r.reason] ?? r.reason}</Td>
                <Td className="max-w-md text-xs">{r.note ?? ''}</Td>
                <Td>
                  <Link href={`/users/${r.reporterId}`} className="font-mono text-xs text-navy underline">
                    {r.reporterId.slice(0, 8)}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={r.status === 'open' ? 'gold' : 'neutral'}>{r.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
