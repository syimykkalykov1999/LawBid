'use client';

import { CalendarPlus, CheckCircle, CursorClick, CurrencyDollar, Eye, Gift, Hourglass, Lightning, RocketLaunch, UsersThree, XCircle } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { dollarsToCents, fadeUp, LoadMore, plural, ProgressBar } from '@/components/billing/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { CASE_STATUS, label, PROMOTION_STATUS, StatusPill, usd } from '@/lib/labels';
import { Reason } from '@/lib/reasons';
import { formatDateTime } from '@/lib/utils';
import { REASON_MIN, useReasonRequired } from '@/lib/reason-policy';

type Promotion = components['schemas']['AdminPromotionRowDto'];
type PromotionStatus = components['schemas']['CasePromotionStatus'];
type Settings = components['schemas']['PromotionSettingsDto'];
type Target = components['schemas']['PromotionTarget'];
type RefundMode = components['schemas']['PromotionRefundMode'];
type Tab = 'all' | PromotionStatus;
type TargetTab = 'all' | Target;

const STATUSES: PromotionStatus[] = ['active', 'pending_review', 'pending_payment', 'finished', 'canceled', 'refunded', 'rejected'];
const num = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const reasonText: Record<string, string> = {
  budget_spent: 'бюджет потрачен',
  time_over: 'срок вышел',
  stopped_by_owner: 'остановил владелец',
  content_unavailable: 'контент скрыт или закрыт',
};
const daysText = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

/** Paid case promotion: KPIs, list, grant / extend / cancel, settings. */
export default function PromotionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'finance';
  const { ask, dialog } = useReason();
  const [tab, setTab] = useState<Tab>('all');
  const [target, setTarget] = useState<TargetTab>('all');
  const [canceling, setCanceling] = useState<Promotion | null>(null);
  const [granting, setGranting] = useState(false);
  const [extending, setExtending] = useState<Promotion | null>(null);

  const stats = useQuery({
    queryKey: ['promotions-stats'],
    queryFn: async () => (await api.GET('/admin/promotions/stats')).data!.data,
  });
  const list = useInfiniteQuery({
    queryKey: ['promotions', tab, target],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/promotions', {
          params: {
            query: { cursor: pageParam, status: tab === 'all' ? undefined : tab, target: target === 'all' ? undefined : target },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const counts = Object.fromEntries((stats.data?.byStatus ?? []).map((s) => [s.status, s.count]));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['promotions'] });
    void qc.invalidateQueries({ queryKey: ['promotions-stats'] });
  };

  const review = useMutation({
    mutationFn: async ({ p, decision }: { p: Promotion; decision: 'approve' | 'reject' }) => {
      let reason = '';
      if (decision === 'reject') {
        const r = await ask({
          title: 'Отклонить продвижение',
          description: `«${p.caseTitle}». Деньги вернутся владельцу полностью, он получит уведомление.`,
          label: 'Причина',
          confirm: 'Отклонить',
          danger: true,
        });
        if (!r) return null;
        reason = r.text;
      }
      return (
        await api.POST('/admin/promotions/{id}/review', {
          params: { path: { id: p.id } },
          body: { decision, reason },
        })
      ).data!.data;
    },
    onSuccess: (res, v) => {
      if (!res) return;
      toast.success(v.decision === 'approve' ? 'Продвижение запущено' : 'Продвижение отклонено, деньги возвращены');
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const cols = canWrite ? 11 : 10;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Рост"
        title="Продвижение постов и кейсов"
        subtitle="Как в Instagram: человек выбирает бюджет и дни, видит «покажем примерно N людям» и платит. Посты показываются в ленте с пометкой «Реклама», кейсы вверху ленты адвокатов. Подписка не нужна."
        actions={
          canWrite ? (
            <Button variant="gold" onClick={() => setGranting(true)}>
              <Gift size={16} weight="light" /> Выдать продвижение
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.isPending ? (
          <KpiSkeletons n={6} />
        ) : stats.data ? (
          <>
            <Kpi
              i={0}
              icon={Lightning}
              title="Идёт сейчас"
              value={stats.data.activeCount}
              hint={`постов ${stats.data.activePosts}, кейсов ${stats.data.activeCases}`}
              gold
            />
            <Kpi i={1} icon={CurrencyDollar} title="Выручка за 30 дней" value={stats.data.revenue30dCents} format={(n) => usd(n)} hint={`оплат: ${stats.data.paid30dCount}`} />
            <Kpi i={2} icon={Hourglass} title="Ждут проверки" value={stats.data.pendingReview} warn={stats.data.pendingReview > 0} />
            <Kpi i={3} icon={Eye} title="Показы за 30 дней" value={stats.data.impressions30d} format={num} />
            <Kpi i={4} icon={UsersThree} title="Охват за 30 дней" value={stats.data.reach30d} format={num} hint="разных людей" />
            <Kpi i={5} icon={CursorClick} title="Клики за 30 дней" value={stats.data.clicks30d} format={num} />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <SectionTitle>Все продвижения</SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={target}
          onChange={setTarget}
          items={[
            { value: 'all' as TargetTab, label: 'Всё' },
            { value: 'post' as TargetTab, label: 'Посты' },
            { value: 'case' as TargetTab, label: 'Кейсы' },
          ]}
        />
        <Tabs
          value={tab}
          onChange={setTab}
          size="sm"
          items={[
            { value: 'all' as Tab, label: 'Все' },
            ...STATUSES.map((s) => ({
              value: s as Tab,
              label: PROMOTION_STATUS[s],
              count: s === 'active' || s === 'pending_payment' || s === 'pending_review' ? counts[s] : null,
            })),
          ]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState
          icon={RocketLaunch}
          title="Продвижений нет"
          text={tab === 'all' ? 'Они появятся, когда люди начнут продвигать свои посты и кейсы.' : 'В этом статусе ничего нет.'}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Что продвигается</Th>
              <Th>Владелец</Th>
              <Th className="text-right">Бюджет</Th>
              <Th>Период</Th>
              <Th className="min-w-36">Показы</Th>
              <Th className="text-right">Охват</Th>
              <Th className="text-right">Клики</Th>
              <Th className="text-right">Оплачено</Th>
              <Th>Статус</Th>
              <Th>Создано</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <Td className="max-w-[260px]">
                    {p.targetType === 'case' && p.caseId ? (
                      <Link href={`/cases/${p.caseId}`} className="line-clamp-2 font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                        {p.caseTitle || 'Кейс'}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 font-medium text-ink">{p.caseTitle || 'Пост'}</span>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                      <Badge tone={p.targetType === 'post' ? 'gold' : 'neutral'}>{p.targetType === 'post' ? 'пост' : 'кейс'}</Badge>
                      {p.targetType === 'case' ? <span>{label(CASE_STATUS, p.caseStatus)}</span> : null}
                      {p.audience && (p.audience.role !== 'all' || p.audience.states.length || p.audience.countries.length || p.audience.topics.length) ? (
                        <span title={[p.audience.states.join(', '), p.audience.countries.join(', '), p.audience.topics.join(', ')].filter(Boolean).join(' · ')}>своя аудитория</span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <Link href={`/users/${p.ownerId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {p.ownerName || p.ownerEmail || p.ownerId.slice(0, 8)}
                    </Link>
                    {p.ownerEmail && p.ownerName ? <div className="max-w-[170px] truncate text-xs text-faint" title={p.ownerEmail}>{p.ownerEmail}</div> : null}
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {usd(p.priceCentsPerDay, 2)}/день
                    <div className="text-xs text-faint">{daysText(p.days)}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {p.startsAt ? (
                      <>
                        {formatDateTime(p.startsAt)}
                        <br />→ {formatDateTime(p.endsAt)}
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="tabular-nums text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye size={13} weight="light" />
                      {num(p.impressions)}
                      {p.targetImpressions ? <span className="text-faint"> / {num(p.targetImpressions)}</span> : null}
                    </span>
                    {p.targetImpressions ? <ProgressBar className="mt-1.5" value={p.impressions / p.targetImpressions} /> : null}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{num(p.reach)}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums text-muted">
                    {num(p.clicks)}
                    {p.impressions > 0 ? <div className="text-xs text-faint">{((p.clicks / p.impressions) * 100).toFixed(1)}%</div> : null}
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {p.grantedBy ? (
                      <Badge tone="gold">подарок</Badge>
                    ) : p.totalCents === 0 ? (
                      <span className="text-faint">бесплатно</span>
                    ) : p.status === 'pending_payment' || (p.status === 'canceled' && !p.paymentId) ? (
                      <span className="text-faint">не оплачено</span>
                    ) : (
                      <>
                        {usd(p.totalCents, 2)}
                        {p.refundedCents > 0 ? <div className="text-xs text-faint">возврат {usd(p.refundedCents, 2)}</div> : null}
                      </>
                    )}
                  </Td>
                  <Td>
                    <StatusPill map={PROMOTION_STATUS} value={p.status} />
                    {p.cancelReason ? (
                      reasonText[p.cancelReason] ? (
                        <span className="mt-1 block max-w-[200px] text-xs text-faint">{reasonText[p.cancelReason]}</span>
                      ) : (
                        <Reason code={p.cancelReason} className="mt-1 block max-w-[200px] text-xs text-faint" />
                      )
                    ) : null}
                  </Td>
                  <Td className="min-w-24 text-xs text-muted">{formatDateTime(p.createdAt)}</Td>
                  {canWrite ? (
                    <Td className="text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {p.status === 'pending_review' ? (
                          <>
                            <Button size="sm" variant="soft" disabled={review.isPending} onClick={() => review.mutate({ p, decision: 'approve' })}>
                              <CheckCircle size={14} /> Одобрить
                            </Button>
                            <Button size="sm" variant="danger-soft" disabled={review.isPending} onClick={() => review.mutate({ p, decision: 'reject' })}>
                              <XCircle size={14} /> Отклонить
                            </Button>
                          </>
                        ) : null}
                        {p.status === 'active' ? (
                          <Button size="sm" variant="soft" onClick={() => setExtending(p)}>
                            <CalendarPlus size={14} /> Продлить
                          </Button>
                        ) : null}
                        {p.status === 'active' || p.status === 'pending_payment' ? (
                          <Button size="sm" variant="danger-soft" onClick={() => setCanceling(p)}>
                            <XCircle size={14} /> Отменить
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      <SectionTitle>Настройки</SectionTitle>
      <SettingsCard canEdit={me?.role === 'super_admin'} />

      <CancelDialog
        promotion={canceling}
        onClose={() => setCanceling(null)}
        onDone={() => {
          setCanceling(null);
          refresh();
        }}
      />
      <DaysDialog
        open={granting}
        mode="grant"
        onClose={() => setGranting(false)}
        onDone={() => {
          setGranting(false);
          refresh();
        }}
      />
      <DaysDialog
        open={!!extending}
        mode="extend"
        promotion={extending}
        onClose={() => setExtending(null)}
        onDone={() => {
          setExtending(null);
          refresh();
        }}
      />
    </>
  );
}

/** Cancel, with or without giving the money back. */
function CancelDialog({ promotion, onClose, onDone }: { promotion: Promotion | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<RefundMode>('unspent');
  const needReason = useReasonRequired('money');
  const reasonOk = !needReason || reason.trim().length >= REASON_MIN;
  const paid = !!promotion?.paymentId && (promotion?.totalCents ?? 0) > 0;
  const unspent =
    promotion && promotion.targetImpressions
      ? Math.floor((promotion.totalCents * Math.max(0, promotion.targetImpressions - promotion.impressions)) / promotion.targetImpressions)
      : (promotion?.totalCents ?? 0);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/promotions/{id}/cancel', {
          params: { path: { id: promotion!.id } },
          body: { reason: reason.trim(), refund: paid ? refund : 'none' },
        })
      ).data!.data,
    onSuccess: (res) => {
      toast.success(res.promotion.refundedCents > 0 ? `Отменено, возвращено ${usd(res.promotion.refundedCents, 2)}` : 'Продвижение отменено');
      setReason('');
      onDone();
    },
    onError: (e) => toast.error(growthError(e)),
  });
  return (
    <Dialog
      open={!!promotion}
      onClose={onClose}
      eyebrow="Продвижение"
      title="Отменить продвижение"
      description={promotion ? `«${promotion.caseTitle}». Показы прекратятся сразу.` : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reasonOk) save.mutate();
        }}
      >
        {paid ? (
          <Field label="Возврат денег" htmlFor="pc-refund" hint="Деньги вернутся на карту через Stripe.">
            <Select id="pc-refund" value={refund} onChange={(e) => setRefund(e.target.value as RefundMode)}>
              <option value="unspent">Вернуть неистраченное ({usd(Math.max(0, unspent - (promotion?.refundedCents ?? 0)), 2)})</option>
              <option value="full">Вернуть всё ({usd(Math.max(0, (promotion?.totalCents ?? 0) - (promotion?.refundedCents ?? 0)), 2)})</option>
              <option value="none">Не возвращать</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Причина" htmlFor="pc-reason" hint={needReason ? `Обязательно, не короче ${REASON_MIN} символов.` : 'Необязательно. Попадёт в журнал аудита.'}>
          <Textarea id="pc-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Назад
          </Button>
          <Button type="submit" variant="danger" loading={save.isPending} disabled={!reasonOk || save.isPending}>
            Отменить продвижение
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Grant (case / post id + days + budget + reason) or extend (days + reason). */
function DaysDialog({
  open,
  mode,
  promotion,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: 'grant' | 'extend';
  promotion?: Promotion | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<Target>('case');
  const [caseId, setCaseId] = useState('');
  const [days, setDays] = useState('3');
  const [budget, setBudget] = useState('10');
  const [reason, setReason] = useState('');
  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 365;
  const budgetCents = dollarsToCents(budget);
  const budgetOk = mode === 'extend' || (budgetCents != null && budgetCents >= 1);
  const caseOk = mode === 'extend' || /^[0-9a-f-]{36}$/i.test(caseId.trim());
  const needReason = useReasonRequired('money');
  const reasonOk = !needReason || reason.trim().length >= REASON_MIN;

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'grant') {
        await api.POST('/admin/promotions/grant', {
          body: { target, caseId: caseId.trim(), days: n, dailyBudgetCents: budgetCents!, reason: reason.trim() },
        });
      } else {
        await api.POST('/admin/promotions/{id}/extend', {
          params: { path: { id: promotion!.id } },
          body: { days: n, reason: reason.trim() },
        });
      }
    },
    onSuccess: () => {
      toast.success(mode === 'grant' ? `Продвижение выдано на ${daysText(n)}` : `Продлено на ${daysText(n)}`);
      setCaseId('');
      setDays('3');
      setReason('');
      onDone();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Продвижение"
      title={mode === 'grant' ? 'Выдать продвижение' : 'Продлить продвижение'}
      description={
        mode === 'grant'
          ? 'Бесплатно. Кейс должен быть открыт, пост опубликован, и у них не должно быть идущего продвижения.'
          : promotion
            ? `«${promotion.caseTitle}», сейчас до ${formatDateTime(promotion.endsAt)}. Охват вырастет на столько же дней по тому же бюджету.`
            : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (daysOk && caseOk && reasonOk && budgetOk) save.mutate();
        }}
      >
        {mode === 'grant' ? (
          <>
            <Tabs
              value={target}
              onChange={setTarget}
              items={[
                { value: 'case' as Target, label: 'Кейс' },
                { value: 'post' as Target, label: 'Пост' },
              ]}
            />
            <Field label={target === 'post' ? 'ID поста' : 'ID кейса'} htmlFor="pr-case" hint="Скопируйте из адреса страницы.">
              <Input id="pr-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" className="font-mono" />
            </Field>
          </>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дней" htmlFor="pr-days" hint="От 1 до 365.">
            <Input id="pr-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          {mode === 'grant' ? (
            <Field label="Бюджет в день, $" htmlFor="pr-budget" hint="Сколько показов получит, как если бы платил.">
              <Input id="pr-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <Field label="Причина" htmlFor="pr-reason" hint={needReason ? `Обязательно, не короче ${REASON_MIN} символов.` : 'Необязательно. Попадёт в журнал аудита.'}>
          <Textarea id="pr-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={save.isPending} disabled={!daysOk || !caseOk || !reasonOk || !budgetOk || save.isPending}>
            {mode === 'grant' ? 'Выдать' : 'Продлить'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ['promotions-settings'],
    queryFn: async () => (await api.GET('/admin/promotions/settings')).data!.data,
  });
  if (q.isPending) return <Skeleton className="h-56 rounded-[var(--radius-lg)]" />;
  if (!q.data) return <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить настройки'} />;
  return <SettingsForm key={JSON.stringify(q.data)} initial={q.data} canEdit={canEdit} />;
}

const centsList = (text: string): number[] | null => {
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  const out = parts.map((p) => dollarsToCents(p));
  return out.every((c): c is number => c != null && c > 0) ? out : null;
};
const intList = (text: string): number[] | null => {
  const parts = text.split(/[,;\s]+/).filter(Boolean).map(Number);
  return parts.every((x) => Number.isInteger(x) && x > 0) ? parts : null;
};

function Toggle({ title, text, checked, onChange, disabled }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <h3 className="font-medium text-heading">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [boostEnabled, setBoostEnabled] = useState(initial.boostEnabled);
  const [attorneysEnabled, setAttorneysEnabled] = useState(initial.attorneysEnabled);
  const [clientsEnabled, setClientsEnabled] = useState(initial.clientsEnabled);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [postsEnabled, setPostsEnabled] = useState(initial.postsEnabled);
  const [autoApprove, setAutoApprove] = useState(initial.autoApprove);
  const [requireSub, setRequireSub] = useState(initial.requireSubscription);
  const [price, setPrice] = useState(String(initial.priceCentsPerDay / 100));
  const [cpm, setCpm] = useState(String(initial.cpmCents / 100));
  const [minDaily, setMinDaily] = useState(String(initial.minDailyBudgetCents / 100));
  const [maxDaily, setMaxDaily] = useState(String(initial.maxDailyBudgetCents / 100));
  const [presets, setPresets] = useState(initial.budgetPresetsCents.map((c) => c / 100).join(', '));
  const [durations, setDurations] = useState(initial.durationPresets.join(', '));
  const [maxDays, setMaxDays] = useState(String(initial.maxDays));
  const [everyN, setEveryN] = useState(String(initial.feedEveryN));
  const [reelN, setReelN] = useState(String(initial.reelEveryN));
  const [reelsEnabled, setReelsEnabled] = useState(initial.reelsEnabled);
  const [ctaEnabled, setCtaEnabled] = useState(initial.ctaEnabled);
  const [ctaTypes, setCtaTypes] = useState<Settings['ctaTypes']>(initial.ctaTypes);
  const [caseSlots, setCaseSlots] = useState(String(initial.caseFeedSlots));
  const [cap, setCap] = useState(String(initial.frequencyCapPerDay));
  const [perPerson, setPerPerson] = useState(String(initial.impressionsPerPerson));

  const body: Settings | null = (() => {
    const p = dollarsToCents(price);
    const c = dollarsToCents(cpm);
    const mn = dollarsToCents(minDaily);
    const mx = dollarsToCents(maxDaily);
    const ps = centsList(presets);
    const ds = intList(durations);
    const md = Number(maxDays);
    const en = Number(everyN);
    const cs = Number(caseSlots);
    const rn = Number(reelN);
    const fc = Number(cap);
    const pp = Number(perPerson);
    if (p == null || p < 50 || c == null || c < 1 || mn == null || mn < 50 || mx == null || mx < mn) return null;
    if (!ps || !ds || !ps.length || !ds.length) return null;
    if (!Number.isInteger(md) || md < 1 || md > 365) return null;
    if (!Number.isInteger(en) || en < 10 || en > 15 || !Number.isInteger(rn) || rn < 10 || rn > 15 || !Number.isInteger(cs) || cs < 0 || cs > 10) return null;
    if (!Number.isInteger(fc) || fc < 1 || fc > 50 || !(pp >= 1 && pp <= 10)) return null;
    return {
      boostEnabled,
      attorneysEnabled,
      clientsEnabled,
      enabled,
      postsEnabled,
      autoApprove,
      requireSubscription: requireSub,
      priceCentsPerDay: p,
      maxDays: md,
      maxActivePerCase: initial.maxActivePerCase,
      cpmCents: c,
      minDailyBudgetCents: mn,
      maxDailyBudgetCents: mx,
      budgetPresetsCents: ps.filter((x) => x >= mn && x <= mx),
      durationPresets: ds.filter((x) => x <= md),
      feedEveryN: en,
      reelEveryN: rn,
      reelsEnabled,
      ctaEnabled,
      ctaTypes,
      caseFeedSlots: cs,
      frequencyCapPerDay: fc,
      impressionsPerPerson: pp,
    };
  })();
  const dirty =
    body != null &&
    (Object.keys(body) as (keyof Settings)[]).some((k) => JSON.stringify(body[k]) !== JSON.stringify(initial[k]));

  // "For $X a day × 7 days we show it to about N people" — like Instagram.
  const example = body
    ? (() => {
        const daily = body.priceCentsPerDay;
        const imps = Math.floor((daily * 7 * 1000) / body.cpmCents);
        const mid = imps / body.impressionsPerPerson;
        return `За ${usd(daily, 2)} в день × 7 дней покажем примерно ${num(Math.floor(mid * 0.8))}–${num(Math.ceil(mid * 1.2))} людям (${num(imps)} показов).`;
      })()
    : null;

  const save = useMutation({
    mutationFn: async () => (await api.PUT('/admin/promotions/settings', { body: body! })).data!.data,
    onSuccess: (data) => {
      toast.success('Настройки продвижения сохранены');
      qc.setQueryData(['promotions-settings'], data);
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <motion.div {...fadeUp(0)}>
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body && dirty) save.mutate();
          }}
        >
          <div className="divide-y divide-line border-b border-line pb-2">
            <Toggle title="Кнопки Boost: всё приложение" text="Главный выключатель. Выключено — кнопка «Продвигать» пропадает у всех сразу, без обновления приложения. Уже идущие продвижения доработают срок." checked={boostEnabled} onChange={setBoostEnabled} disabled={!canEdit} />
            <Toggle title="Кнопки Boost у адвокатов" text="Выключено — адвокаты не видят кнопку на своих постах, видео и делах." checked={attorneysEnabled} onChange={setAttorneysEnabled} disabled={!canEdit || !boostEnabled} />
            <Toggle title="Кнопки Boost у клиентов" text="Выключено — клиенты не видят кнопку на своих постах, видео и делах." checked={clientsEnabled} onChange={setClientsEnabled} disabled={!canEdit || !boostEnabled} />
            <Toggle title="Продвижение постов" text="Любой клиент или адвокат может продвинуть свой пост. Пост показывается в ленте с пометкой «Реклама»." checked={postsEnabled} onChange={setPostsEnabled} disabled={!canEdit} />
            <Toggle title="Продвижение кейсов" text="Клиент поднимает свой открытый кейс вверх ленты адвокатов. Уже идущие продвижения доработают свой срок." checked={enabled} onChange={setEnabled} disabled={!canEdit} />
            <Toggle title="Продвижение видео (рилсы)" text="Кнопка «Продвигать» на видео и реклама среди рилсов с пометкой «Реклама» (свой счётчик, отдельно от ленты)." checked={reelsEnabled} onChange={setReelsEnabled} disabled={!canEdit} />
            <Toggle title="Кнопка под рекламой" text="Рекламодатель выбирает кнопку: сайт, профиль, скачать, позвонить. У кейсов клиента только «Откликнуться»." checked={ctaEnabled} onChange={setCtaEnabled} disabled={!canEdit} />
            <Toggle title="Автопроверка" text="Включено: продвижение стартует сразу после оплаты, если на контент нет открытых жалоб. Выключено: каждое продвижение ждёт проверки сотрудника." checked={autoApprove} onChange={setAutoApprove} disabled={!canEdit} />
            <Toggle title="Только по подписке" text="Выключено (как в Instagram): продвигать может любой. Включено: только те, у кого в плане есть «Продвижение»." checked={requireSub} onChange={setRequireSub} disabled={!canEdit} />
          </div>

          <h3 className="mt-5 font-medium text-heading">Цены и охват</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Цена 1000 показов, $" htmlFor="ps-cpm" hint="Из неё считается «покажем N людям».">
              <Input id="ps-cpm" inputMode="decimal" value={cpm} disabled={!canEdit} onChange={(e) => setCpm(e.target.value)} />
            </Field>
            <Field label="Бюджет по умолчанию, $/день" htmlFor="ps-price" hint="Столько же стоит один бесплатный день за приглашение.">
              <Input id="ps-price" inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Минимум в день, $" htmlFor="ps-min" hint="Не меньше $0.50.">
              <Input id="ps-min" inputMode="decimal" value={minDaily} disabled={!canEdit} onChange={(e) => setMinDaily(e.target.value)} />
            </Field>
            <Field label="Максимум в день, $" htmlFor="ps-max">
              <Input id="ps-max" inputMode="decimal" value={maxDaily} disabled={!canEdit} onChange={(e) => setMaxDaily(e.target.value)} />
            </Field>
            <Field label="Пакеты бюджета, $/день" htmlFor="ps-presets" hint="Через запятую, до 8. Кнопки в приложении." className="sm:col-span-2">
              <Input id="ps-presets" value={presets} disabled={!canEdit} onChange={(e) => setPresets(e.target.value)} />
            </Field>
            <Field label="Длительности, дней" htmlFor="ps-durations" hint="Через запятую, до 8.">
              <Input id="ps-durations" value={durations} disabled={!canEdit} onChange={(e) => setDurations(e.target.value)} />
            </Field>
            <Field label="Максимум дней за раз" htmlFor="ps-days" hint="От 1 до 365.">
              <Input id="ps-days" type="number" min={1} max={365} value={maxDays} disabled={!canEdit} onChange={(e) => setMaxDays(e.target.value)} />
            </Field>
          </div>

          <h3 className="mt-5 font-medium text-heading">Показ в ленте</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Реклама: 1 на N постов в ленте" htmlFor="ps-every" hint="От 10 до 15. Больше число, реже реклама.">
              <Input id="ps-every" type="number" min={10} max={15} value={everyN} disabled={!canEdit} onChange={(e) => setEveryN(e.target.value)} />
            </Field>
            <Field label="Реклама: 1 на N рилсов" htmlFor="ps-reel" hint="От 10 до 15, свой счётчик.">
              <Input id="ps-reel" type="number" min={10} max={15} value={reelN} disabled={!canEdit} onChange={(e) => setReelN(e.target.value)} />
            </Field>
            <Field label="Мест для кейсов вверху" htmlFor="ps-slots" hint="В ленте адвоката, 0–10.">
              <Input id="ps-slots" type="number" min={0} max={10} value={caseSlots} disabled={!canEdit} onChange={(e) => setCaseSlots(e.target.value)} />
            </Field>
            <Field label="Показов одному человеку в день" htmlFor="ps-cap" hint="Чтобы реклама не надоедала.">
              <Input id="ps-cap" type="number" min={1} max={50} value={cap} disabled={!canEdit} onChange={(e) => setCap(e.target.value)} />
            </Field>
            <Field label="Показов на человека (для оценки)" htmlFor="ps-pp" hint="Обычно 1.5–2.">
              <Input id="ps-pp" inputMode="decimal" value={perPerson} disabled={!canEdit} onChange={(e) => setPerPerson(e.target.value)} />
            </Field>
          </div>
          <h3 className="mt-5 font-medium text-heading">Кнопки под рекламой</h3>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {([
              ['more', 'Сайт (https)'],
              ['message', 'Сообщение'],
              ['profile', 'Профиль'],
              ['download', 'Скачать'],
              ['call', 'Позвонить'],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ctaTypes.includes(k)}
                  disabled={!canEdit || !ctaEnabled}
                  onChange={(e) =>
                    setCtaTypes((cur) => (e.target.checked ? [...cur, k] : cur.filter((x) => x !== k)))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          {example ? <p className="mt-4 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-muted">{example}</p> : null}

          {canEdit ? (
            <div className="mt-5 flex items-center justify-end gap-3">
              {!body ? <span className="text-xs text-danger">Проверьте значения</span> : null}
              <Button type="submit" loading={save.isPending} disabled={!body || !dirty || save.isPending}>
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
