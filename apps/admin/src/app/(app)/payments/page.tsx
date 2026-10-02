'use client';

import { ArrowCounterClockwise, Receipt } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
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
} from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import { PAYMENT_STATUS, StatusPill, usd } from '@/lib/labels';
import { Reason } from '@/lib/reasons';
import { formatDateTime } from '@/lib/utils';

type Tab = 'payments' | 'refunds';
type PayStatus = '' | 'pending' | 'succeeded' | 'failed' | 'refunded';

/** Payments and refunds. */
export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Платежи и возвраты"
        subtitle="Все оплаты подписок через Stripe. Отсюда можно вернуть деньги целиком или частично — возврат пишется в журнал аудита."
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'payments', label: 'Платежи' },
            { value: 'refunds', label: 'Возвраты' },
          ]}
        />
      </div>
      {tab === 'payments' ? <Payments /> : <Refunds />}
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
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
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
              <Th>Пользователь</Th>
              <Th className="text-right">Сумма</Th>
              <Th>Статус</Th>
              <Th>Оплачен</Th>
              <Th className="text-right">Возвращено / доступно</Th>
              <Th>Ошибка</Th>
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
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={ArrowCounterClockwise} title="Возвратов не было" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Пользователь</Th>
              <Th className="text-right">Сумма</Th>
              <Th>Статус</Th>
              <Th>Причина</Th>
              <Th>Админ</Th>
              <Th>Создан</Th>
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
                  <Td className="font-mono text-xs text-faint" title={r.adminId}>
                    {r.adminId.slice(0, 8)}
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
