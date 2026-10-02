'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import {
  label,
  MOD_ACTION,
  type ModerationTargetType,
  REPORT_REASON,
  REPORT_STATUS,
  ROLE_TEXT,
  STATUS_LABEL,
  StatusPill,
  TARGET_STATUS,
  TARGET_TYPE,
} from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type TType = ModerationTargetType;

/** Context keys the API returns per object type → label + optional link. */
const CONTEXT: Record<string, { label: string; href?: (v: string) => string; external?: boolean }> = {
  postId: { label: 'Пост' },
  parentCommentId: { label: 'Ответ на комментарий' },
  caseId: { label: 'Кейс', href: (v) => `/cases/${v}` },
  conversationId: { label: 'Диалог' },
  voiceUrl: { label: 'Голосовое сообщение', external: true },
  fileUrl: { label: 'Файл', external: true },
  attorneyId: { label: 'Адвокат', href: (v) => `/users/${v}` },
  clientId: { label: 'Клиент', href: (v) => `/users/${v}` },
};
type Action = 'hide' | 'remove' | 'warn' | 'suspend' | 'restore' | 'dismiss';

const DANGER: Action[] = ['remove', 'suspend'];

/** docs/06 §3.2 card: object + context, reasons, author, history; every
 * action asks for a reason and is audited server-side. */
export default function ModerationCardPage() {
  const { type, id } = useParams<{ type: TType; id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { ask, dialog } = useReason();
  const toast = useToast();

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
      toast.success('Готово, действие записано в журнал');
      void qc.invalidateQueries({ queryKey: ['moderation-card', type, id] });
      void qc.invalidateQueries({ queryKey: ['moderation-queue'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      if ((r.data?.data.reportsHandled ?? 0) > 0) router.push('/moderation');
    },
    onError: (e) => toast.error(e),
  });

  if (!c) {
    return (
      <>
        <PageHeader eyebrow="Модерация" title="Жалоба" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-[var(--radius-lg)] lg:col-span-2" />
            <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
          </div>
        ) : null}
      </>
    );
  }
  const open = c.reports.filter((r) => r.status === 'open').length;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Модерация"
        title={TARGET_TYPE[c.targetType] ?? c.targetType}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.status ? <StatusPill map={TARGET_STATUS} value={c.status} /> : null}
            <span className="font-mono text-xs">{c.targetId}</span> · открытых жалоб: {open}
          </span>
        }
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
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0} className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Объект</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.text ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-ink">{c.text}</pre>
            ) : (
              <p className="text-muted">Без текста</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {c.createdAt ? <span>создан {formatDateTime(c.createdAt)}</span> : null}
              {Object.entries(c.context as Record<string, string | null>)
                .filter(([, v]) => v)
                .map(([k, v]) => {
                  const meta = CONTEXT[k];
                  const value = String(v);
                  if (meta?.external) {
                    return (
                      <a key={k} href={value} target="_blank" rel="noopener noreferrer" className="text-gold-600 hover:underline">
                        {meta.label} ↗
                      </a>
                    );
                  }
                  return (
                    <span key={k}>
                      {meta?.label ?? k}:{' '}
                      {meta?.href ? (
                        <Link href={meta.href(value)} className="font-mono text-gold-600 hover:underline">
                          {value.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="font-mono" title={value}>
                          {value.slice(0, 8)}
                        </span>
                      )}
                    </span>
                  );
                })}
            </div>
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={1}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Автор</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.author ? (
              <>
                <Link href={`/users/${c.author.id}`} className="font-medium text-heading hover:underline">
                  {[c.author.firstName, c.author.lastName].filter(Boolean).join(' ') || c.author.username || c.author.id}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{label(ROLE_TEXT, c.author.role)}</span>
                  <StatusPill map={STATUS_LABEL} value={c.author.status} />
                  {c.author.username ? <span>@{c.author.username}</span> : null}
                </div>
                <div className="text-xs">
                  предупреждений: {c.author.warnings} · приостановок: {c.author.suspensions}
                </div>
              </>
            ) : (
              <p className="text-muted">Неизвестен</p>
            )}
            <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">История</h3>
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
        </FadeIn>
      </div>
      <section>
        <SectionTitle>Жалобы</SectionTitle>
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
            {c.reports.length === 0 ? <TableEmpty colSpan={5}>Жалоб нет</TableEmpty> : null}
            {c.reports.map((r, i) => (
              <MotionRow key={r.id} i={i}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                <Td>{REPORT_REASON[r.reason] ?? r.reason}</Td>
                <Td className="max-w-md text-xs">{r.note ?? ''}</Td>
                <Td>
                  <Link href={`/users/${r.reporterId}`} className="font-mono text-xs text-gold-600 hover:underline">
                    {r.reporterId.slice(0, 8)}
                  </Link>
                </Td>
                <Td>
                  <StatusPill map={REPORT_STATUS} value={r.status} />
                </Td>
              </MotionRow>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
