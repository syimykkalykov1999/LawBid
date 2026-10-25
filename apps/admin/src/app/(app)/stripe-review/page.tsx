'use client';

import { CurrencyDollar, Gavel, ShieldWarning, Timer } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Textarea } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Item = components['schemas']['StripeReviewItemDto'];

const KINDS: Record<string, string> = {
  dispute: 'Спор с банком',
  early_fraud_warning: 'Раннее предупреждение',
  refund_failed: 'Возврат не прошёл',
  payout_failed: 'Выплата не прошла',
  account_deauthorized: 'Stripe отключён',
  capability_disabled: 'Возможность отключена',
  reconcile_drift: 'Расхождение со Stripe',
};
const SLA: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ok: { label: 'в срок', tone: 'success' },
  due_soon: { label: 'скоро срок', tone: 'warning' },
  overdue: { label: 'просрочено', tone: 'danger' },
};

/** Stripe robustness 2026-10-27: one queue for everything from Stripe that
 * needs a human look. Actions ask for one fresh 2FA code (the API client
 * opens the prompt by itself). */
export default function StripeReviewPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<string>('all');
  const [closing, setClosing] = useState<{ item: Item; mode: 'resolve' | 'dismiss' } | null>(null);
  const [evidence, setEvidence] = useState<Item | null>(null);

  const summary = useQuery({
    queryKey: ['stripe-review-summary'],
    queryFn: async () => (await api.GET('/admin/stripe-review/summary')).data!.data,
  });
  const list = useInfiniteQuery({
    queryKey: ['stripe-review', kind],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/stripe-review', {
          params: { query: { cursor: pageParam, kind: kind === 'all' ? undefined : (kind as never), status: 'open' } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['stripe-review'] });
    void qc.invalidateQueries({ queryKey: ['stripe-review-summary'] });
  };
  const s = summary.data;

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Проверки Stripe"
        subtitle="Споры с банками, сорванные выплаты и возвраты, ранние предупреждения о мошенничестве. Любое действие подтверждается одним кодом 2FA; у каждой записи есть срок."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.isPending ? (
          <KpiSkeletons n={4} />
        ) : s ? (
          <>
            <Kpi i={0} icon={ShieldWarning} title="Ждут проверки" value={s.open} warn={s.open > 0} />
            <Kpi i={1} icon={Timer} title="Просрочено" value={s.overdue} warn={s.overdue > 0} />
            <Kpi i={2} icon={Gavel} title="Споров за 30 дней" value={s.disputes30d} hint={`из ${s.payments30d} платежей`} />
            <Kpi
              i={3}
              icon={CurrencyDollar}
              title="Доля споров"
              value={s.disputeRatePercent}
              format={(n) => `${n.toFixed(2)} %`}
              warn={s.disputeRateLevel !== 'ok'}
              hint="Visa: порог 0,5 %, штрафы от 1,5 %"
            />
          </>
        ) : null}
      </div>
      <ErrorNote text={summary.error ? errorText(summary.error) : null} />

      <Card className="my-4 p-3">
        <Tabs
          value={kind}
          onChange={setKind}
          items={[{ value: 'all', label: 'Все' }, ...Object.entries(KINDS).map(([value, label]) => ({ value, label }))]}
        />
      </Card>

      {list.isPending ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : list.isError ? (
        <ErrorNote text={errorText(list.error)} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Что</Th>
              <Th>Описание</Th>
              <Th className="text-right">Сумма</Th>
              <Th>Срок</Th>
              <Th>Статус</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">
                  Очередь пуста
                </Td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>{KINDS[r.kind] ?? r.kind}</Td>
                  <Td className="max-w-[420px] text-sm">{r.summary}</Td>
                  <Td className="text-right">{r.amountCents != null ? usd(r.amountCents, 2) : '—'}</Td>
                  <Td>{r.dueAt ? formatDateTime(r.dueAt) : '—'}</Td>
                  <Td>
                    <Badge tone={SLA[r.sla]?.tone ?? 'neutral'} dot>
                      {SLA[r.sla]?.label ?? r.sla}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      {r.kind === 'dispute' && r.casePaymentId ? (
                        <Button size="sm" variant="outline" onClick={() => setEvidence(r)}>
                          Доказательства
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setClosing({ item: r, mode: 'dismiss' })}>
                        Не требует действий
                      </Button>
                      <Button size="sm" onClick={() => setClosing({ item: r, mode: 'resolve' })}>
                        Решено
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      <CloseDialog
        target={closing}
        onClose={() => setClosing(null)}
        onDone={() => {
          toast.success('Запись закрыта');
          setClosing(null);
          refresh();
        }}
      />
      <EvidenceDialog item={evidence} onClose={() => setEvidence(null)} onDone={refresh} />
    </>
  );
}

function CloseDialog({
  target,
  onClose,
  onDone,
}: {
  target: { item: Item; mode: 'resolve' | 'dismiss' } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const ok = text.trim().length >= 3;
  const save = useMutation({
    mutationFn: async () => {
      const path = target!.mode === 'resolve' ? '/admin/stripe-review/{id}/resolve' : '/admin/stripe-review/{id}/dismiss';
      return (await api.POST(path, { params: { path: { id: target!.item.id } }, body: { resolution: text.trim() } })).data!.data;
    },
    onSuccess: () => {
      setText('');
      onDone();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      eyebrow="Проверки Stripe"
      title={target?.mode === 'resolve' ? 'Отметить решённым' : 'Закрыть без действий'}
      description={target?.item.summary}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save.mutate();
        }}
      >
        <Field label="Что сделано" htmlFor="sr-res" hint="Попадёт в журнал аудита.">
          <Textarea id="sr-res" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!ok || save.isPending}>
            Подтвердить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EvidenceDialog({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const paymentId = item?.casePaymentId ?? '';
  const ev = useQuery({
    enabled: !!paymentId,
    queryKey: ['stripe-dispute-evidence', paymentId],
    queryFn: async () =>
      (await api.GET('/admin/stripe-review/disputes/{paymentId}/evidence', { params: { path: { paymentId } } })).data!.data,
  });
  const draft = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/stripe-review/disputes/{paymentId}/draft', { params: { path: { paymentId } } })).data!.data,
    onSuccess: () => {
      toast.success('Черновик обновлён в Stripe');
      void ev.refetch();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const submit = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/stripe-review/disputes/{paymentId}/submit', { params: { path: { paymentId } } })).data!.data,
    onSuccess: () => {
      toast.success('Доказательства отправлены в банк');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      eyebrow="Спор с банком"
      title="Пакет доказательств"
      description="Переписка не отправляется — только даты и количества. Проверьте текст и отправьте: отправить повторно нельзя."
    >
      {ev.isPending ? (
        <Skeleton className="h-40" />
      ) : ev.isError ? (
        <ErrorNote text={errorText(ev.error)} />
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted">
            Состояние: <b>{ev.data!.evidenceStatus}</b>
            {ev.data!.dueBy ? ` · срок ${formatDateTime(ev.data!.dueBy)}` : ''}
          </div>
          <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-line p-3 text-xs">
            {Object.entries(ev.data!.fields).map(([k, v]) => (
              <div key={k}>
                <div className="font-semibold text-heading">{k}</div>
                <div className="whitespace-pre-wrap text-muted">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => draft.mutate()} loading={draft.isPending}>
              Обновить черновик
            </Button>
            <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={submit.isPending}>
              Отправить в банк (2FA)
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
