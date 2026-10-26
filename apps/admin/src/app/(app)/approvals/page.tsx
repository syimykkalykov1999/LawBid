'use client';

import { CheckCircle, SealCheck, XCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { livePoll } from '@/lib/live';
import { formatDateTime } from '@/lib/utils';

type Approval = components['schemas']['AdminApprovalDto'];
type View = 'pending' | 'done';

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'gold' }> = {
  pending: { label: 'ждёт второго админа', tone: 'gold' },
  approved: { label: 'подтверждено и выполнено', tone: 'success' },
  rejected: { label: 'отклонено', tone: 'neutral' },
  failed: { label: 'подтверждено, но не прошло', tone: 'danger' },
  expired: { label: 'истекло (72 часа)', tone: 'neutral' },
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Owner 2026-10-22 (system audit #2, item 11) — «Требуют подтверждения».
 * Maker-checker: a bulk salary payout or a refund from the limit
 * (billing.dual_approval_min_cents, $500 by default) does not run when one
 * admin presses the button. It waits here until ANOTHER admin approves it
 * with a fresh authenticator code; then it runs once. The one who asked
 * cannot approve it, only withdraw it. Every step is in the audit log.
 */
export default function ApprovalsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<View>('pending');
  const [rejecting, setRejecting] = useState<Approval | null>(null);
  const [note, setNote] = useState('');

  const list = useQuery({
    queryKey: ['approvals', view],
    queryFn: async () =>
      (await api.GET('/admin/approvals', { params: { query: { status: view } } })).data!.data as Approval[],
    refetchInterval: livePoll(),
  });
  const count = useQuery({
    queryKey: ['approvals-count'],
    queryFn: async () => (await api.GET('/admin/approvals/count')).data!.data,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['approvals'] });
    void qc.invalidateQueries({ queryKey: ['approvals-count'] });
    void qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };

  // The API client asks for the authenticator code itself (StepUpHost).
  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.POST('/admin/approvals/{id}/approve', { params: { path: { id } } })).data!.data as Approval,
    onSuccess: (a) => {
      if (a.status === 'failed') toast.error(`Подтверждено, но не прошло: ${a.error ?? 'ошибка'}`);
      else toast.success('Подтверждено — выполнено');
      refresh();
    },
    onError: (e) => {
      toast.error(e);
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: async (v: { id: string; note: string }) =>
      (
        await api.POST('/admin/approvals/{id}/reject', {
          params: { path: { id: v.id } },
          body: v.note.trim() ? { note: v.note.trim() } : {},
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Отклонено — ничего не выполнено');
      setRejecting(null);
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const limit = count.data?.limitCents;
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Требуют подтверждения"
        subtitle={
          count.data?.dualControl === false ? (
            <>
              Сейчас проверка вторым админом выключена (вы работаете один): выплаты, возвраты, бонусы и кнопки сервера
              выполняются сразу после кода 2FA, а в журнале аудита остаётся запись. Здесь остаются только старые
              запросы, которые ждали второго админа. Включить обратно можно в Настройках (ключ{' '}
              <code>admin.dual_control</code>).
            </>
          ) : (
            <>
              Массовая выплата зарплат и возврат денег{limit != null ? ` от ${usd(limit)}` : ''} не уходят сразу: их
              подтверждает второй админ кодом из аутентификатора. Свой запрос подтвердить нельзя — только отозвать.
              Лимит меняется в Настройках (ключ <code>billing.dual_approval_min_cents</code>).
            </>
          )
        }
      />
      <div className="mb-4">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            { value: 'pending', label: 'Ждут', count: view === 'pending' ? rows.length : null },
            { value: 'done', label: 'Решённые' },
          ]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {rows.length === 0 && !list.isLoading ? (
        <EmptyState
          icon={SealCheck}
          title={view === 'pending' ? 'Ничего не ждёт подтверждения' : 'Пока ничего не решено'}
          text={view === 'pending' ? 'Когда кто-то запустит большую выплату или возврат, запрос появится здесь.' : undefined}
        />
      ) : (
        <div className="grid max-w-4xl gap-3">
          {rows.map((a) => {
            const st = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as const };
            return (
              <Card key={a.id}>
                <CardContent className="space-y-2.5 pt-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-ink">{a.label}</div>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </div>
                  <div className="text-2xl font-semibold text-ink">{usd(a.amountCents)}</div>
                  <div className="text-muted">{a.summary}</div>
                  <div className="grid gap-1 text-xs text-faint sm:grid-cols-2">
                    <div>
                      Запросил: <span className="text-ink">{a.requestedBy.email ?? a.requestedBy.id}</span>
                      {a.mine ? ' (вы)' : ''} · {formatDateTime(a.createdAt)}
                    </div>
                    {a.status === 'pending' ? (
                      <div>Истекает: {formatDateTime(a.expiresAt)}</div>
                    ) : a.approvedBy ? (
                      <div>
                        Подтвердил: <span className="text-ink">{a.approvedBy.email ?? a.approvedBy.id}</span>
                        {a.decidedAt ? ` · ${formatDateTime(a.decidedAt)}` : ''}
                      </div>
                    ) : a.rejectedBy ? (
                      <div>
                        Отклонил: <span className="text-ink">{a.rejectedBy.email ?? a.rejectedBy.id}</span>
                        {a.decisionNote ? ` — «${a.decisionNote}»` : ''}
                      </div>
                    ) : null}
                  </div>
                  {a.error ? <p className="text-danger">{a.error}</p> : null}
                  {a.status === 'pending' && (a.canDecide || a.mine) ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {a.canDecide ? (
                        <Button
                          variant="gold"
                          size="sm"
                          loading={approve.isPending && approve.variables === a.id}
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(a.id)}
                        >
                          <CheckCircle size={14} /> Подтвердить и выполнить
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => setRejecting(a)}>
                        <XCircle size={14} /> {a.mine ? 'Отозвать' : 'Отклонить'}
                      </Button>
                    </div>
                  ) : null}
                  {a.mine && a.status === 'pending' ? (
                    <p className="text-xs text-faint">Подтвердить должен другой админ, у которого есть право на это действие.</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        eyebrow="Отклонить"
        title={rejecting?.mine ? 'Отозвать свой запрос?' : 'Отклонить запрос?'}
        description="Ничего не будет выплачено и не вернётся. Решение попадёт в журнал действий."
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) reject.mutate({ id: rejecting.id, note });
          }}
        >
          <Input placeholder="Причина (необязательно)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Отмена
            </Button>
            <Button type="submit" variant="danger" loading={reject.isPending}>
              {rejecting?.mine ? 'Отозвать' : 'Отклонить'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
