'use client';

import { ArrowsClockwise, Bank, CurrencyDollar, HandCoins, Receipt, ShieldWarning } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { dollarsToCents, fadeUp, LoadMore } from '@/components/billing/shared';
import { CsvButton } from '@/components/csv-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import {
  CASE_PAYMENT_KIND,
  CASE_PAYMENT_STATUS,
  label,
  PAYMENT_FEE_PAYER,
  PAYMENT_FEE_TYPE,
  PAYMENT_REQUEST_STATUS,
  PAYOUT_ACCOUNT_STATUS,
  PROCESSING_FEE_PAYER,
  StatusPill,
  usd,
} from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Payment = components['schemas']['AdminCasePaymentRowDto'];
type PaymentStatus = components['schemas']['CasePaymentStatus'];
type Account = components['schemas']['AdminPayoutAccountRowDto'];
type AccountStatus = components['schemas']['PayoutAccountStatus'];
type Settings = components['schemas']['AdminPaymentSettingsViewDto'];
type Party = components['schemas']['CasePaymentPartyDto'];
type PaymentRequest = components['schemas']['PaymentRequestDto'];
type RequestStatus = components['schemas']['PaymentRequestStatus'];
type Tab = 'payments' | 'requests' | 'accounts' | 'settings';
const REQUEST_STATUSES: RequestStatus[] = ['open', 'paid', 'canceled', 'expired'];
type StatusTab = 'all' | PaymentStatus | 'disputes';

const STATUSES: PaymentStatus[] = ['succeeded', 'pending_payment', 'partially_refunded', 'refunded', 'disputed', 'canceled', 'failed'];
const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'onboarding', 'restricted', 'disabled', 'pending'];

function PartyCell({ p, id }: { p: Party | null; id: string }) {
  const name = p?.name || (p?.username ? `@${p.username}` : id.slice(0, 8));
  return (
    <div className="min-w-0">
      <Link href={`/users/${id}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
        {name}
      </Link>
      {p?.username && p.name ? <div className="truncate text-xs text-faint">@{p.username}</div> : null}
    </div>
  );
}

/** Owner 2026-10-05: client → attorney payments through the platform
 * (Stripe Connect, direct charges). KPIs, payments with filters and
 * refunds, attorneys' payout accounts, the fee settings. */
export default function CasePaymentsPage() {
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'finance';
  const [tab, setTab] = useState<Tab>('payments');

  const stats = useQuery({
    queryKey: ['case-payments-stats'],
    queryFn: async () => (await api.GET('/admin/case-payments/stats')).data!.data,
  });

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Оплаты адвокатам"
        subtitle="Клиент платит адвокату прямо из дела. Деньги идут на Stripe-аккаунт адвоката, минуя наш счёт; платформа получает только свою комиссию. Возвраты делает адвокат; здесь можно вернуть деньги за него."
        actions={<CsvButton entity="case_payments" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending ? (
          <KpiSkeletons n={4} />
        ) : stats.data ? (
          <>
            <Kpi i={0} icon={CurrencyDollar} title="Оборот за 30 дней" value={stats.data.volume30dCents} format={(n) => usd(n)} gold hint={`${stats.data.count30d} платежей`} />
            <Kpi i={1} icon={HandCoins} title="Комиссия платформы, 30 дней" value={stats.data.platformFees30dCents} format={(n) => usd(n, 2)} hint={`за всё время ${usd(stats.data.platformFeesAllCents)}`} />
            <Kpi i={2} icon={ShieldWarning} title="Открытых споров" value={stats.data.disputedOpen} warn={stats.data.disputedOpen > 0} hint={`возвратов за 30 дней ${usd(stats.data.refunded30dCents)}`} />
            <Kpi i={3} icon={Bank} title="Адвокатов принимают оплату" value={stats.data.payoutAccountsActive} hint={`${stats.data.payoutAccountsPending} в процессе подключения · открытых счетов ${stats.data.openRequests} на ${usd(stats.data.openRequestsCents)}${stats.data.overdueRequests > 0 ? `, просрочено ${stats.data.overdueRequests}` : ''}`} />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="my-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'payments' as Tab, label: 'Платежи' },
            { value: 'requests' as Tab, label: 'Счета клиентам' },
            { value: 'accounts' as Tab, label: 'Счета адвокатов' },
            { value: 'settings' as Tab, label: 'Комиссия и лимиты' },
          ]}
        />
      </div>

      {tab === 'payments' ? <PaymentsTab canWrite={canWrite} /> : null}
      {tab === 'requests' ? <RequestsTab /> : null}
      {tab === 'accounts' ? <AccountsTab canWrite={canWrite} /> : null}
      {tab === 'settings' ? <SettingsCard canEdit={me?.role === 'super_admin'} /> : null}
    </>
  );
}

function PaymentsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusTab>('all');
  const [userId, setUserId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const userOk = userId.trim() === '' || /^[0-9a-f-]{36}$/i.test(userId.trim());
  const caseOk = caseId.trim() === '' || /^[0-9a-f-]{36}$/i.test(caseId.trim());

  const list = useInfiniteQuery({
    queryKey: ['case-payments', status, userOk ? userId.trim() : '', caseOk ? caseId.trim() : ''],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/case-payments', {
          params: {
            query: {
              cursor: pageParam,
              status: status === 'all' || status === 'disputes' ? undefined : status,
              disputed: status === 'disputes' ? true : undefined,
              userId: userOk && userId.trim() ? userId.trim() : undefined,
              caseId: caseOk && caseId.trim() ? caseId.trim() : undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['case-payments'] });
    void qc.invalidateQueries({ queryKey: ['case-payments-stats'] });
  };
  const cols = canWrite ? 9 : 8;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all' as StatusTab, label: 'Все' },
            ...STATUSES.map((s) => ({ value: s as StatusTab, label: CASE_PAYMENT_STATUS[s] })),
            { value: 'disputes' as StatusTab, label: 'Споры' },
          ]}
        />
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="ID клиента или адвоката" className="w-64 font-mono text-xs" />
        <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="ID кейса" className="w-64 font-mono text-xs" />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Платежей нет" text="Они появятся, когда клиенты начнут платить адвокатам через приложение." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Кейс</Th>
              <Th>Клиент → адвокат</Th>
              <Th>Тип</Th>
              <Th className="text-right">Адвокату</Th>
              <Th className="text-right">Комиссия</Th>
              <Th className="text-right">Списано с клиента</Th>
              <Th>Статус</Th>
              <Th>Когда</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <Td className="max-w-[220px]">
                    <Link href={`/cases/${p.caseId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {p.caseTitle ?? p.caseId.slice(0, 8)}
                    </Link>
                    {p.note ? <div className="truncate text-xs text-faint" title={p.note}>{p.note}</div> : null}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <PartyCell p={p.client} id={p.client?.id ?? ''} />
                      <span className="text-xs text-faint">→</span>
                      <PartyCell p={p.attorney} id={p.attorney?.id ?? ''} />
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">{label(CASE_PAYMENT_KIND, p.kind)}</Td>
                  <Td className="text-right tabular-nums">
                    {usd(p.attorneyNetCents, 2)}
                    {p.refundedCents > 0 ? <div className="text-xs text-danger">−{usd(p.refundedCents, 2)}</div> : null}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {usd(p.platformFeeCents, 2)}
                    {p.processingFeeCents > 0 ? <div className="text-xs text-faint">+{usd(p.processingFeeCents, 2)} Stripe</div> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{usd(p.clientTotalCents, 2)}</Td>
                  <Td>
                    <StatusPill map={CASE_PAYMENT_STATUS} value={p.status} />
                    {p.disputeStatus ? <div className="mt-1 text-xs text-warning">спор: {p.disputeStatus}</div> : null}
                    {p.failureCode ? <div className="mt-1 text-xs text-faint">{p.failureCode}</div> : null}
                  </Td>
                  <Td className="min-w-24 text-xs text-muted">
                    {formatDateTime(p.paidAt ?? p.createdAt)}
                    {p.receiptUrl ? (
                      <div>
                        <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-gold-600 hover:underline">
                          чек
                        </a>
                      </div>
                    ) : null}
                  </Td>
                  {canWrite ? (
                    <Td className="text-right">
                      {p.refundable ? (
                        <Button size="sm" variant="danger-soft" onClick={() => setRefunding(p)}>
                          Вернуть
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
      <RefundDialog
        payment={refunding}
        onClose={() => setRefunding(null)}
        onDone={() => {
          setRefunding(null);
          refresh();
        }}
      />
    </>
  );
}

function RefundDialog({ payment, onClose, onDone }: { payment: Payment | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const left = payment ? payment.clientTotalCents - payment.refundedCents : 0;
  const cents = amount.trim() === '' ? left : dollarsToCents(amount);
  const amountOk = cents != null && cents >= 50 && cents <= left;
  const reasonOk = reason.trim().length >= 3;

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/case-payments/{id}/refund', {
          params: { path: { id: payment!.id } },
          body: { amountCents: amount.trim() === '' ? undefined : cents!, reason: reason.trim() },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Возврат отправлен клиенту');
      setAmount('');
      setReason('');
      onDone();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <Dialog
      open={!!payment}
      onClose={onClose}
      eyebrow="Возврат"
      title="Вернуть деньги клиенту"
      description={payment ? `Платёж ${usd(payment.clientTotalCents, 2)} по делу «${payment.caseTitle ?? ''}». Деньги спишутся со Stripe-баланса адвоката; комиссия платформы вернётся пропорционально.` : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (amountOk && reasonOk) save.mutate();
        }}
      >
        <Field label="Сумма, $" htmlFor="rf-amount" hint={`Пусто — вернуть всё (${usd(left, 2)}).`}>
          <Input id="rf-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" placeholder={(left / 100).toFixed(2)} />
        </Field>
        <Field label="Причина" htmlFor="rf-reason" hint="Клиент увидит её в уведомлении; попадёт в журнал аудита.">
          <Textarea id="rf-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" loading={save.isPending} disabled={!amountOk || !reasonOk || save.isPending}>
            Вернуть
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RequestsTab() {
  const [status, setStatus] = useState<'all' | RequestStatus>('all');
  const list = useInfiniteQuery({
    queryKey: ['payment-requests', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/case-payments/requests', {
          params: { query: { cursor: pageParam, status: status === 'all' ? undefined : status } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <Card className="mb-3 p-3">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all' as const, label: 'Все' },
            ...REQUEST_STATUSES.map((st) => ({ value: st, label: label(PAYMENT_REQUEST_STATUS, st) })),
          ]}
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
              <Th>Дата</Th>
              <Th>Дело</Th>
              <Th>Адвокат</Th>
              <Th>Клиент</Th>
              <Th>За что</Th>
              <Th className="text-right">Сумма</Th>
              <Th>Срок</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><Td colSpan={8} className="py-8 text-center text-muted">Счетов пока нет</Td></tr>
            ) : (
              rows.map((r: PaymentRequest) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                  <Td className="max-w-[16rem] truncate">{r.caseTitle ?? '—'}</Td>
                  <Td><PartyCell p={r.attorney} id={r.attorney?.id ?? ''} /></Td>
                  <Td><PartyCell p={r.client} id={r.client?.id ?? ''} /></Td>
                  <Td className="max-w-[16rem] truncate">
                    {r.description}
                    {r.total > 1 ? <span className="ml-1 text-xs text-faint">{r.seq}/{r.total}</span> : null}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{usd(r.amountCents, 2)}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {r.dueAt ? formatDateTime(r.dueAt) : '—'}
                    {r.overdue ? <span className="ml-1 text-xs text-danger">просрочен</span> : null}
                  </Td>
                  <Td><StatusPill map={PAYMENT_REQUEST_STATUS} value={r.status} /></Td>
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

function AccountsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'all' | AccountStatus>('all');
  const list = useInfiniteQuery({
    queryKey: ['payout-accounts', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/case-payments/payout-accounts', {
          params: { query: { cursor: pageParam, status: status === 'all' ? undefined : status } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const sync = useMutation({
    mutationFn: async (a: Account) =>
      (await api.POST('/admin/case-payments/payout-accounts/{userId}/sync', { params: { path: { userId: a.userId } } })).data!.data,
    onSuccess: (res) => {
      toast.success(`Статус обновлён: ${label(PAYOUT_ACCOUNT_STATUS, res.account.status)}`);
      void qc.invalidateQueries({ queryKey: ['payout-accounts'] });
      void qc.invalidateQueries({ queryKey: ['case-payments-stats'] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const cols = canWrite ? 7 : 6;

  return (
    <>
      <div className="mb-4">
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[{ value: 'all' as const, label: 'Все' }, ...ACCOUNT_STATUSES.map((s) => ({ value: s, label: PAYOUT_ACCOUNT_STATUS[s] }))]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Bank} title="Счетов нет" text="Адвокат подключает счёт в приложении: Настройки → Приём оплат." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Адвокат</Th>
              <Th>Статус</Th>
              <Th>Чего не хватает</Th>
              <Th>Комиссия Stripe</Th>
              <Th className="text-right">Получено</Th>
              <Th>Подключён</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((a) => (
                <tr key={a.userId}>
                  <Td>
                    <PartyCell p={a.user} id={a.userId} />
                    {a.email ? <div className="truncate text-xs text-faint">{a.email}</div> : null}
                    <div className="font-mono text-[11px] text-faint">{a.stripeAccountId}</div>
                  </Td>
                  <Td>
                    <StatusPill map={PAYOUT_ACCOUNT_STATUS} value={a.status} />
                    <div className="mt-1 flex gap-1">
                      {a.chargesEnabled ? <Badge tone="success">приём</Badge> : <Badge tone="neutral">приём выкл.</Badge>}
                      {a.payoutsEnabled ? <Badge tone="success">выплаты</Badge> : <Badge tone="neutral">выплаты выкл.</Badge>}
                    </div>
                  </Td>
                  <Td className="max-w-[260px] text-xs text-muted">
                    {a.disabledReason ? <div className="text-danger">{a.disabledReason}</div> : null}
                    {a.requirementsDue.length ? a.requirementsDue.join(', ') : a.disabledReason ? null : '—'}
                  </Td>
                  <Td className="text-xs text-muted">
                    {a.processingFeePayer ? (
                      PROCESSING_FEE_PAYER[a.processingFeePayer]
                    ) : (
                      <span className="text-faint">по умолчанию</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{usd(a.receivedCents)}</Td>
                  <Td className="text-xs text-muted">
                    {formatDateTime(a.createdAt)}
                    {a.lastSyncedAt ? <div className="text-faint">проверен {formatDateTime(a.lastSyncedAt)}</div> : null}
                  </Td>
                  {canWrite ? (
                    <Td className="text-right">
                      <Button size="sm" variant="soft" disabled={sync.isPending} onClick={() => sync.mutate(a)}>
                        <ArrowsClockwise size={14} /> Обновить
                      </Button>
                    </Td>
                  ) : null}
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

function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ['case-payments-settings'],
    queryFn: async () => (await api.GET('/admin/case-payments/settings')).data!.data,
  });
  if (q.isPending) return <Skeleton className="h-72 rounded-[var(--radius-lg)]" />;
  if (!q.data) return <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить настройки'} />;
  return <SettingsForm key={JSON.stringify(q.data)} initial={q.data} canEdit={canEdit} />;
}

function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [feeType, setFeeType] = useState(initial.feeType);
  const [feeFixed, setFeeFixed] = useState((initial.feeFixedCents / 100).toFixed(2));
  const [feePayer, setFeePayer] = useState(initial.feePayer);
  const [procPayer, setProcPayer] = useState(initial.processingFeePayer);
  const [saveCards, setSaveCards] = useState(initial.saveCards);
  const [allowInvoices, setAllowInvoices] = useState(initial.allowInvoices);
  const [allowInstallments, setAllowInstallments] = useState(initial.allowInstallments);
  const [maxInstallments, setMaxInstallments] = useState(String(initial.maxInstallments));
  const [reminderDays, setReminderDays] = useState(initial.invoiceReminderDays.join(', '));
  const [overdueEvery, setOverdueEvery] = useState(String(initial.overdueReminderEveryDays));
  const [expireDays, setExpireDays] = useState(String(initial.invoiceExpireDays));
  const [procPercent, setProcPercent] = useState(String(initial.processingFeePercent));
  const [procFixed, setProcFixed] = useState(String(initial.processingFeeFixedCents));
  const [minAmount, setMinAmount] = useState((initial.minAmountCents / 100).toFixed(0));
  const [maxAmount, setMaxAmount] = useState((initial.maxAmountCents / 100).toFixed(0));
  const [allowCustom, setAllowCustom] = useState(initial.allowCustomAmount);
  const [allowPartial, setAllowPartial] = useState(initial.allowPartial);
  const [refundDays, setRefundDays] = useState(String(initial.refundWindowDays));
  const [disclaimerEn, setDisclaimerEn] = useState(initial.disclaimerEn);
  const [disclaimerRu, setDisclaimerRu] = useState(initial.disclaimerRu);

  const fixedCents = feeFixed.trim() === '' || Number(feeFixed) === 0 ? 0 : dollarsToCents(feeFixed);
  const pp = Number(procPercent);
  const pf = Number(procFixed);
  const minC = dollarsToCents(minAmount);
  const maxC = dollarsToCents(maxAmount);
  const rd = Number(refundDays);
  const mi = Number(maxInstallments);
  const oe = Number(overdueEvery);
  const ed = Number(expireDays);
  const remind = reminderDays.split(/[,\s]+/).filter(Boolean).map(Number);
  const remindOk = remind.length <= 6 && remind.every((n) => Number.isInteger(n) && n >= 0 && n <= 60);
  const valid =
    fixedCents != null && fixedCents >= 0 && fixedCents <= 100_000 &&
    Number.isFinite(pp) && pp >= 0 && pp <= 15 &&
    Number.isInteger(pf) && pf >= 0 && pf <= 500 &&
    minC != null && maxC != null && minC >= 50 && maxC >= minC &&
    Number.isInteger(rd) && rd >= 0 && rd <= 365 &&
    Number.isInteger(mi) && mi >= 2 && mi <= 36 &&
    Number.isInteger(oe) && oe >= 0 && oe <= 60 &&
    Number.isInteger(ed) && ed >= 0 && ed <= 365 && remindOk &&
    disclaimerEn.trim().length > 0 && disclaimerEn.length <= 4000 &&
    disclaimerRu.trim().length > 0 && disclaimerRu.length <= 4000;
  const body = {
    feeType,
    feeFixedCents: fixedCents ?? 0,
    feePayer,
    processingFeePayer: procPayer,
    processingFeePercent: pp,
    processingFeeFixedCents: pf,
    minAmountCents: minC ?? 0,
    maxAmountCents: maxC ?? 0,
    allowCustomAmount: allowCustom,
    allowPartial,
    refundWindowDays: rd,
    saveCards,
    allowInvoices,
    allowInstallments,
    maxInstallments: mi,
    invoiceReminderDays: [...new Set(remind)].sort((a, b) => b - a),
    overdueReminderEveryDays: oe,
    invoiceExpireDays: ed,
    disclaimerEn: disclaimerEn.trim(),
    disclaimerRu: disclaimerRu.trim(),
  };
  const dirty = (Object.keys(body) as (keyof typeof body)[]).some((k) => JSON.stringify(body[k]) !== JSON.stringify(initial[k]));

  const save = useMutation({
    mutationFn: async () => (await api.PUT('/admin/case-payments/settings', { body })).data!.data,
    onSuccess: (data) => {
      toast.success('Настройки оплат сохранены');
      qc.setQueryData(['case-payments-settings'], data);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const example = 100_000;
  const platformFee = feeType === 'fixed' ? (fixedCents ?? 0) : 0;
  const base = example + (feePayer === 'client' ? platformFee : 0);
  const grossUp = Math.max(0, Math.ceil((base + pf) / (1 - pp / 100)) - base);
  const processing = procPayer === 'client' ? grossUp : procPayer === 'split' ? Math.ceil(grossUp / 2) : 0;
  const clientTotal = base + processing;
  const attorneyNet = feePayer === 'attorney' ? example - platformFee : example;
  const stripeFee = Math.round(clientTotal * (pp / 100) + pf);
  const attorneyReceives = Math.max(0, clientTotal - platformFee - stripeFee);

  return (
    <motion.div {...fadeUp(0)}>
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty) save.mutate();
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <h3 className="font-medium text-heading">Оплата адвокату через платформу</h3>
              <p className="mt-1 text-sm text-muted">
                Платформа не делит гонорар адвоката: комиссии в процентах нет вовсе, по умолчанию комиссии нет совсем. Включается флагом <span className="font-mono">payments_in_app</span> в разделе «Флаги» и работает, когда сохранены ключи Stripe (Система → Ключи и сервисы, поле «Connect webhook»).
              </p>
            </div>
            <div className="flex gap-2">
              <Badge tone={initial.flagEnabled ? 'success' : 'neutral'} dot>{initial.flagEnabled ? 'флаг включён' : 'флаг выключен'}</Badge>
              <Badge tone={initial.stripeConfigured ? 'success' : 'warning'} dot>{initial.stripeConfigured ? 'Stripe настроен' : 'нет ключей Stripe'}</Badge>
            </div>
          </div>


          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Комиссия платформы" htmlFor="cp-type">
              <Select id="cp-type" value={feeType} disabled={!canEdit} onChange={(e) => setFeeType(e.target.value as Settings['feeType'])}>
                {(Object.keys(PAYMENT_FEE_TYPE) as Settings['feeType'][]).map((k) => (
                  <option key={k} value={k}>{PAYMENT_FEE_TYPE[k]}</option>
                ))}
              </Select>
            </Field>
            {feeType === 'fixed' ? (
              <Field label="Сумма за платёж, $" htmlFor="cp-fixed" hint="0 — без комиссии.">
                <Input id="cp-fixed" inputMode="decimal" value={feeFixed} disabled={!canEdit} onChange={(e) => setFeeFixed(e.target.value)} />
              </Field>
            ) : (
              <div />
            )}
            <Field label="Кто платит комиссию" htmlFor="cp-payer">
              <Select id="cp-payer" value={feePayer} disabled={!canEdit || feeType === 'none'} onChange={(e) => setFeePayer(e.target.value as Settings['feePayer'])}>
                {(Object.keys(PAYMENT_FEE_PAYER) as Settings['feePayer'][]).map((k) => (
                  <option key={k} value={k}>{PAYMENT_FEE_PAYER[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Окно возврата, дней" htmlFor="cp-refund" hint="0 — без ограничения.">
              <Input id="cp-refund" type="number" min={0} max={365} value={refundDays} disabled={!canEdit} onChange={(e) => setRefundDays(e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <h4 className="text-sm font-medium text-heading">Комиссия Stripe — кто платит</h4>
            <p className="mt-1 text-sm text-muted">
              Это дело адвоката и клиента: адвокат выбирает в настройках выплат («плачу я / платит клиент / пополам») и может поменять на каждом счёте; клиент видит разбивку до оплаты. Здесь — только значение по умолчанию для адвокатов, которые ещё не выбирали, и ставка Stripe для оценок. Деньги списываются прямо на Stripe-аккаунт адвоката — платформа не платит ни при какой настройке. Кто что выбрал — во вкладке «Stripe-аккаунты».
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="По умолчанию для новых адвокатов" htmlFor="cp-proc-payer">
                <Select id="cp-proc-payer" value={procPayer} disabled={!canEdit} onChange={(e) => setProcPayer(e.target.value as Settings['processingFeePayer'])}>
                  {(Object.keys(PROCESSING_FEE_PAYER) as Settings['processingFeePayer'][]).map((k) => (
                    <option key={k} value={k}>{PROCESSING_FEE_PAYER[k]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Ставка Stripe, %" htmlFor="cp-pp" hint="Обычно 2.9.">
                <Input id="cp-pp" inputMode="decimal" value={procPercent} disabled={!canEdit} onChange={(e) => setProcPercent(e.target.value)} />
              </Field>
              <Field label="Фикс Stripe, центов" htmlFor="cp-pf" hint="Обычно 30.">
                <Input id="cp-pf" type="number" min={0} max={500} value={procFixed} disabled={!canEdit} onChange={(e) => setProcFixed(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <h4 className="text-sm font-medium text-heading">Счета от адвоката и удобство оплаты</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
                <span className="text-sm text-ink">Счета клиентам</span>
                <Switch checked={allowInvoices} onChange={setAllowInvoices} disabled={!canEdit} label="Счета клиентам" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
                <span className="text-sm text-ink">Рассрочка этапами</span>
                <Switch checked={allowInstallments} onChange={setAllowInstallments} disabled={!canEdit || !allowInvoices} label="Рассрочка этапами" />
              </div>
              <Field label="Этапов максимум" htmlFor="cp-mi">
                <Input id="cp-mi" type="number" min={2} max={36} value={maxInstallments} disabled={!canEdit || !allowInstallments} onChange={(e) => setMaxInstallments(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
                <span className="text-sm text-ink">Сохранять карты (Stripe)</span>
                <Switch checked={saveCards} onChange={setSaveCards} disabled={!canEdit} label="Сохранять карты" />
              </div>
              <Field label="Напоминать за N дней до срока" htmlFor="cp-remind" hint="Через запятую, например 3, 1.">
                <Input id="cp-remind" value={reminderDays} disabled={!canEdit} onChange={(e) => setReminderDays(e.target.value)} />
              </Field>
              <Field label="Просрочен: напоминать каждые, дней" htmlFor="cp-oe" hint="0 — не напоминать.">
                <Input id="cp-oe" type="number" min={0} max={60} value={overdueEvery} disabled={!canEdit} onChange={(e) => setOverdueEvery(e.target.value)} />
              </Field>
              <Field label="Закрывать неоплаченный через, дней после срока" htmlFor="cp-ed" hint="0 — не закрывать.">
                <Input id="cp-ed" type="number" min={0} max={365} value={expireDays} disabled={!canEdit} onChange={(e) => setExpireDays(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Минимум, $" htmlFor="cp-min">
              <Input id="cp-min" inputMode="decimal" value={minAmount} disabled={!canEdit} onChange={(e) => setMinAmount(e.target.value)} />
            </Field>
            <Field label="Максимум, $" htmlFor="cp-max">
              <Input id="cp-max" inputMode="decimal" value={maxAmount} disabled={!canEdit} onChange={(e) => setMaxAmount(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
              <span className="text-sm text-ink">Своя сумма</span>
              <Switch checked={allowCustom} onChange={setAllowCustom} disabled={!canEdit} label="Своя сумма" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
              <span className="text-sm text-ink">Аванс и остаток</span>
              <Switch checked={allowPartial} onChange={setAllowPartial} disabled={!canEdit} label="Аванс и остаток" />
            </div>
          </div>

          <div className="mt-4 rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm text-muted">
            Пример на {usd(example)}: клиент платит <b className="text-ink">{usd(clientTotal, 2)}</b>, платформа получает <b className="text-ink">{usd(platformFee, 2)}</b>, на баланс адвоката приходит <b className="text-ink">{usd(attorneyNet, 2)}</b>; Stripe удерживает с адвоката ≈ {usd(stripeFee, 2)}, адвокат получает на руки <b className="text-ink">≈ {usd(attorneyReceives, 2)}</b>.
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <h4 className="text-sm font-medium text-heading">Юридический текст (дисклеймер)</h4>
            <p className="mt-1 text-sm text-muted">Клиент видит его перед оплатой, адвокат — при подключении Stripe, обе стороны — в записи о платеже. Поправьте после проверки юристом.</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <Field label="English" htmlFor="cp-disc-en">
                <Textarea id="cp-disc-en" rows={6} maxLength={4000} value={disclaimerEn} disabled={!canEdit} onChange={(e) => setDisclaimerEn(e.target.value)} />
              </Field>
              <Field label="Русский" htmlFor="cp-disc-ru">
                <Textarea id="cp-disc-ru" rows={6} maxLength={4000} value={disclaimerRu} disabled={!canEdit} onChange={(e) => setDisclaimerRu(e.target.value)} />
              </Field>
            </div>
          </div>

          {canEdit ? (
            <div className="mt-5 flex items-center justify-end gap-3">
              {!valid ? <span className="text-xs text-danger">Проверьте значения</span> : null}
              <Button type="submit" loading={save.isPending} disabled={!valid || !dirty || save.isPending}>
                Сохранить
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-faint">Менять настройки может только супер-админ.</p>
          )}
        </form>
      </Card>
    </motion.div>
  );
}
