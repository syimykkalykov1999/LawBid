'use client';

import { ArrowCounterClockwise, Copy as CopyIcon, Receipt } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefundDialog } from '@/components/billing/refund-dialog';
import {
  type AdminPayment,
  dayStartIso,
  LoadMore,
  nextDayIso,
  REFUND_STATUS,
  UserCell,
  useBillingRole,
  userName,
} from '@/components/billing/shared';
import { CsvButton } from '@/components/csv-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Label, Select, Textarea } from '@/components/ui/input';
import { SortTh, Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { PAYMENT_STATUS, StatusPill, usd } from '@/lib/labels';
import { Reason } from '@/lib/reasons';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';

type Tab = 'payments' | 'refunds' | 'duplicates' | 'disputes';
type PayStatus = '' | 'pending' | 'succeeded' | 'failed' | 'refunded';
/** Row 57: click-to-sort headers, one address parameter per tab (the loaded rows; default order = the server's). */
const PAY_SORT = ['user', 'amount', 'status', 'paid', 'refunded', 'error'] as const;
const REFUND_SORT = ['user', 'amount', 'status', 'reason', 'admin', 'created'] as const;
const DUP_SORT = ['user', 'status', 'charged', 'reason', 'created'] as const;
const DISPUTE_SORT = ['user', 'status', 'amount', 'reason', 'created'] as const;

/** Payments and refunds. */
export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Платежи и возвраты"
        subtitle="Все оплаты подписок через Stripe. Отсюда можно вернуть деньги целиком или частично — возврат пишется в журнал аудита."
        actions={<CsvButton entity="payments" />}
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'payments', label: 'Платежи' },
            { value: 'refunds', label: 'Возвраты' },
            { value: 'duplicates', label: 'Двойные подписки' },
            { value: 'disputes', label: 'Возвраты по спорам' },
          ]}
        />
      </div>
      {tab === 'payments' ? <Payments /> : tab === 'refunds' ? <Refunds /> : tab === 'duplicates' ? <Duplicates /> : <DisputeRefunds />}
    </>
  );
}

function Payments() {
  const { canWrite, canOpenUsers } = useBillingRole();
  const [status, setStatus] = useState<PayStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refundOf, setRefundOf] = useState<AdminPayment | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['billing-payments', status, from, to],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/billing/payments', {
          params: {
            query: {
              cursor: pageParam,
              status: status || undefined,
              from: from ? dayStartIso(from) : undefined,
              to: to ? nextDayIso(to) : undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(PAY_SORT, 'paySort');
  const rows = sortRows(list.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    user: (p) => userName(p.user, p.userId),
    amount: (p) => p.amountCents,
    status: (p) => PAYMENT_STATUS[p.status] ?? p.status,
    paid: (p) => p.paidAt,
    refunded: (p) => p.refundedCents,
    error: (p) => p.failureCode,
  });
  const cols = canWrite ? 7 : 6;
  const filtered = !!(status || from || to);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <div className="space-y-1.5">
          <Label htmlFor="pay-status">Статус</Label>
          <Select id="pay-status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value as PayStatus)}>
            <option value="">Все</option>
            {Object.entries(PAYMENT_STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-from">С</Label>
          <DateField id="pay-from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-to">По</Label>
          <DateField id="pay-to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setStatus('');
              setFrom('');
              setTo('');
            }}
          >
            Сбросить
          </Button>
        ) : null}
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Платежей нет" text={filtered ? 'Попробуйте другие фильтры.' : 'Платежи появятся после первых оплат подписок.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh {...header('user')}>Пользователь</SortTh>
              <SortTh {...header('amount')} className="text-right">Сумма</SortTh>
              <SortTh {...header('status')}>Статус</SortTh>
              <SortTh {...header('paid')}>Оплачен</SortTh>
              <SortTh {...header('refunded')} className="text-right">Возвращено / доступно</SortTh>
              <SortTh {...header('error')}>Ошибка</SortTh>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <UserCell user={p.user} userId={p.userId} link={canOpenUsers} />
                  </Td>
                  <Td className="text-right font-medium whitespace-nowrap tabular-nums">{usd(p.amountCents, 2)}</Td>
                  <Td>
                    <StatusPill map={PAYMENT_STATUS} value={p.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{p.paidAt ? formatDateTime(p.paidAt) : <span className="text-faint">—</span>}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    <span className={p.refundedCents ? 'text-danger' : 'text-faint'}>{usd(p.refundedCents, 2)}</span>
                    <span className="text-faint"> / </span>
                    <span className="text-ink">{usd(p.refundableCents, 2)}</span>
                  </Td>
                  <Td>{p.failureCode ? <Reason code={p.failureCode} className="text-xs text-danger" /> : <span className="text-faint">—</span>}</Td>
                  {canWrite ? (
                    <Td className="text-right">
                      {p.status === 'succeeded' && p.refundableCents > 0 ? (
                        <Button size="sm" variant="danger-soft" onClick={() => setRefundOf(p)}>
                          <ArrowCounterClockwise size={14} /> Вернуть деньги
                        </Button>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
      <RefundDialog payment={refundOf} onClose={() => setRefundOf(null)} />
    </>
  );
}

function Refunds() {
  const { canOpenUsers } = useBillingRole();
  const list = useInfiniteQuery({
    queryKey: ['billing-refunds'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => (await api.GET('/admin/billing/refunds', { params: { query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(REFUND_SORT, 'refundSort');
  const rows = sortRows(list.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    user: (r) => userName(r.user, r.userId),
    amount: (r) => r.amountCents,
    status: (r) => REFUND_STATUS[r.status] ?? r.status,
    reason: (r) => r.reason,
    admin: (r) => r.adminId ?? 'система',
    created: (r) => r.createdAt,
  });
  return (
    <>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={ArrowCounterClockwise} title="Возвратов не было" />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh {...header('user')}>Пользователь</SortTh>
              <SortTh {...header('amount')} className="text-right">Сумма</SortTh>
              <SortTh {...header('status')}>Статус</SortTh>
              <SortTh {...header('reason')}>Причина</SortTh>
              <SortTh {...header('admin')}>Админ</SortTh>
              <SortTh {...header('created')}>Создан</SortTh>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <UserCell user={r.user} userId={r.userId} link={canOpenUsers} />
                  </Td>
                  <Td className="text-right font-medium whitespace-nowrap tabular-nums">{usd(r.amountCents, 2)}</Td>
                  <Td>
                    <StatusPill map={REFUND_STATUS} value={r.status} />
                    {r.failureReason ? <Reason code={r.failureReason} className="mt-1 block text-xs text-danger" /> : null}
                  </Td>
                  <Td className="max-w-80 text-muted">{r.reason}</Td>
                  <Td className="font-mono text-xs text-faint" title={r.adminId ?? 'система'}>
                    {r.adminId ? r.adminId.slice(0, 8) : 'система'}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}

/** Algo audit M-4 (owner 2026-10-28): what the duplicate-subscription auto-fix did. */
const DUPLICATE_STATUS: Record<string, string> = {
  pending: 'в работе',
  canceled: 'отменена, возврат ждёт',
  refunding: 'возврат отправляется',
  refunded: 'отменена, деньги возвращены',
  no_refund: 'отменена, возвращать нечего',
  review: 'ждёт человека',
  blocked: 'не трогали (3-й дубль за 90 дней)',
};

const DUPLICATE_TRIGGER: Record<string, string> = {
  app_order: 'вторая покупка',
  webhook: 'событие Stripe',
  grace_resubscribe: 'оформил заново после льготы',
};

const DUPLICATE_REASON: Record<string, string> = {
  no_charge: 'эта подписка ничего не списала',
  period_over: 'оплаченный период уже закончился',
  no_overlap: 'оплаченный период не пересекается с оставленной',
  already_refunded: 'уже возвращено раньше',
  dispute: 'спор по платежу / chargeback',
  fraud_review: 'аккаунт на проверке',
  cross_account: 'платёж другого аккаунта',
  over_charge: 'больше, чем было списано',
  daily_cap: 'дневной лимит возвратов',
  nth_duplicate: '3-й дубль за 90 дней',
  switch_off: 'автоисправление выключено',
  keeper_not_live: 'оставляемая подписка уже не активна',
  refund_failed: 'Stripe отказал в возврате',
  refund_unknown: 'результат возврата неизвестен',
  refund_unavailable: 'возвраты недоступны',
  payment_not_recorded: 'платёж ещё не записан',
};

function Duplicates() {
  const { canOpenUsers } = useBillingRole();
  const list = useInfiniteQuery({
    queryKey: ['billing-duplicate-subscriptions'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/billing/duplicate-subscriptions', { params: { query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(DUP_SORT, 'dupSort');
  const rows = sortRows(list.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    user: (r) => userName(r.user, r.userId),
    status: (r) => DUPLICATE_STATUS[r.status] ?? r.status,
    charged: (r) => r.chargedCents,
    reason: (r) => (r.reason ? (DUPLICATE_REASON[r.reason] ?? r.reason) : null),
    created: (r) => r.createdAt,
  });
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Если у адвоката оказались две живые подписки, система оставляет самую свежую оплаченную, вторую отменяет и возвращает только
        неиспользованную часть её последнего счёта. Случаи «ждёт человека» — в «Проверки Stripe».
      </p>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={CopyIcon} title="Двойных подписок не было" />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh {...header('user')}>Пользователь</SortTh>
              <SortTh {...header('status')}>Статус</SortTh>
              <SortTh {...header('charged')} className="text-right">Списано / возвращено</SortTh>
              <SortTh {...header('reason')}>Почему</SortTh>
              <Th>Подписки (оставлена / отменена)</Th>
              <SortTh {...header('created')}>Когда</SortTh>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <UserCell user={r.user} userId={r.userId} link={canOpenUsers} />
                  </Td>
                  <Td>
                    <StatusPill map={DUPLICATE_STATUS} value={r.status} />
                    <span className="mt-1 block text-xs text-faint">{DUPLICATE_TRIGGER[r.trigger] ?? r.trigger}</span>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    <span className="text-ink">{usd(r.chargedCents, 2)}</span>
                    <span className="text-faint"> / </span>
                    <span className={r.refundCents ? 'text-danger' : 'text-faint'}>{usd(r.refundCents, 2)}</span>
                  </Td>
                  <Td className="max-w-72 text-muted">{r.reason ? (DUPLICATE_REASON[r.reason] ?? r.reason) : '—'}</Td>
                  <Td className="font-mono text-xs text-faint">
                    <span className="block">{r.keptSubscriptionId}</span>
                    <span className="block line-through">{r.duplicateSubscriptionId}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}

/** R-237 (owner 2026-11-05): what the automatic refund of a bank inquiry did. */
const DISPUTE_REFUND_STATUS: Record<string, string> = {
  refunding: 'возврат отправляется',
  refunded: 'подписка отменена, деньги возвращены',
  review: 'ждёт решения',
  rejected: 'решили не возвращать',
  no_refund: 'возврат не нужен',
};

const DISPUTE_REFUND_REASON: Record<string, string> = {
  over_amount: 'сумма больше лимита',
  user_limit: 'лимит возвратов на пользователя',
  daily_cap: 'дневной лимит возвратов',
  prior_dispute: 'у пользователя уже были споры',
  fraud_review: 'аккаунт на проверке',
  escalated: 'банк сам забрал деньги (chargeback)',
  closed: 'банк закрыл запрос',
  refund_failed: 'Stripe отказал в возврате',
  refund_unknown: 'результат возврата неизвестен',
  refund_unavailable: 'возвраты недоступны',
};

function DisputeRefunds() {
  const { canOpenUsers, canWrite } = useBillingRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['billing-dispute-refunds'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/billing/dispute-refunds', { params: { query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const done = () => queryClient.invalidateQueries({ queryKey: ['billing-dispute-refunds'] });
  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.POST('/admin/billing/dispute-refunds/{id}/approve', { params: { path: { id } } })).data!,
    onSuccess: done,
    onError: (e) => toast.error(errorText(e)),
  });
  const reject = useMutation({
    mutationFn: async (id: string) =>
      (
        await api.POST('/admin/billing/dispute-refunds/{id}/reject', {
          params: { path: { id } },
          body: { note: note.trim() },
        })
      ).data!,
    onSuccess: () => {
      setRejecting(null);
      setNote('');
      return done();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const { sort, header } = useTableSort(DISPUTE_SORT, 'disputeSort');
  const rows = sortRows(list.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    user: (r) => userName(r.user, r.userId),
    status: (r) => DISPUTE_REFUND_STATUS[r.status] ?? r.status,
    amount: (r) => r.amountCents,
    reason: (r) => r.note ?? (r.reason ? (DISPUTE_REFUND_REASON[r.reason] ?? r.reason) : null),
    created: (r) => r.createdAt,
  });
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Если банк прислал запрос по платежу за подписку и деньги ещё у нас, система отменяет подписку и возвращает
        платёж целиком. Сверх лимитов случай ждёт решения здесь. Настоящий спор (chargeback) не возвращаем: банк уже
        забрал деньги.
      </p>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={CopyIcon} title="Возвратов по спорам не было" />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh {...header('user')}>Пользователь</SortTh>
              <SortTh {...header('status')}>Статус</SortTh>
              <SortTh {...header('amount')} className="text-right">Сумма</SortTh>
              <SortTh {...header('reason')}>Почему</SortTh>
              <SortTh {...header('created')}>Когда</SortTh>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <UserCell user={r.user} userId={r.userId} link={canOpenUsers} />
                  </Td>
                  <Td>
                    <StatusPill map={DISPUTE_REFUND_STATUS} value={r.status} />
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{usd(r.amountCents, 2)}</Td>
                  <Td className="max-w-72 text-muted">
                    {r.note ?? (r.reason ? (DISPUTE_REFUND_REASON[r.reason] ?? r.reason) : '')}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {r.status === 'review' && canWrite ? (
                      <span className="flex justify-end gap-2">
                        <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(r.id)}>
                          Вернуть деньги
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(r.id)}>
                          Не возвращать
                        </Button>
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
      <Dialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        eyebrow="Возвраты по спорам"
        title="Не возвращать деньги"
        description="Запрос банка всё равно нужно ответить в «Проверках Stripe»."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting && note.trim().length >= 3) reject.mutate(rejecting);
          }}
        >
          <Field label="Почему" htmlFor="dr-note" hint="Попадёт в журнал аудита.">
            <Textarea id="dr-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Отмена
            </Button>
            <Button type="submit" loading={reject.isPending} disabled={note.trim().length < 3 || reject.isPending}>
              Подтвердить
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
