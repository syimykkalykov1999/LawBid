'use client';

import { CalendarPlus, CurrencyDollar, Eye, Gift, Lightning, RocketLaunch, XCircle } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { dollarsToCents, fadeUp, LoadMore, plural } from '@/components/billing/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { CASE_STATUS, label, PROMOTION_STATUS, StatusPill, usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Promotion = components['schemas']['AdminPromotionRowDto'];
type PromotionStatus = components['schemas']['CasePromotionStatus'];
type Settings = components['schemas']['PromotionSettingsDto'];
type Tab = 'all' | PromotionStatus;

const STATUSES: PromotionStatus[] = ['active', 'pending_payment', 'finished', 'canceled', 'refunded'];
const daysText = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

/** Paid case promotion: KPIs, list, grant / extend / cancel, settings. */
export default function PromotionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'finance';
  const { ask, dialog } = useReason();
  const [tab, setTab] = useState<Tab>('all');
  const [granting, setGranting] = useState(false);
  const [extending, setExtending] = useState<Promotion | null>(null);

  const stats = useQuery({
    queryKey: ['promotions-stats'],
    queryFn: async () => (await api.GET('/admin/promotions/stats')).data!.data,
  });
  const list = useInfiniteQuery({
    queryKey: ['promotions', tab],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/promotions', {
          params: { query: { cursor: pageParam, status: tab === 'all' ? undefined : tab } },
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

  const cancel = useMutation({
    mutationFn: async (p: Promotion) => {
      const r = await ask({
        title: 'Отменить продвижение',
        description: `«${p.caseTitle}». Кейс сразу уйдёт из верхних мест ленты.`,
        label: 'Причина',
        confirm: 'Отменить продвижение',
        danger: true,
      });
      if (!r) return null;
      const res = await api.POST('/admin/promotions/{id}/cancel', {
        params: { path: { id: p.id } },
        body: { reason: r.text },
      });
      return res.data!.data;
    },
    onSuccess: (res) => {
      if (!res) return;
      toast.success(
        res.note
          ? 'Продвижение отменено. Оно было оплачено — верните деньги в разделе «Платежи».'
          : 'Продвижение отменено',
      );
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const cols = canWrite ? 9 : 8;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Рост"
        title="Продвижение дел"
        subtitle="Клиент платит, и его кейс показывается вверху ленты адвокатов. Здесь видно все продвижения; можно подарить дни, продлить или отменить."
        actions={
          canWrite ? (
            <Button variant="gold" onClick={() => setGranting(true)}>
              <Gift size={16} weight="light" /> Выдать продвижение
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.isPending ? (
          <KpiSkeletons n={3} />
        ) : stats.data ? (
          <>
            <Kpi i={0} icon={Lightning} title="Идёт сейчас" value={stats.data.activeCount} gold />
            <Kpi i={1} icon={CurrencyDollar} title="Выручка за 30 дней" value={stats.data.revenue30dCents} format={(n) => usd(n)} />
            <Kpi i={2} icon={RocketLaunch} title="Оплат за 30 дней" value={stats.data.paid30dCount} />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <SectionTitle>Все продвижения</SectionTitle>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all' as Tab, label: 'Все' },
            ...STATUSES.map((s) => ({ value: s as Tab, label: PROMOTION_STATUS[s], count: s === 'active' || s === 'pending_payment' ? counts[s] : null })),
          ]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState
          icon={RocketLaunch}
          title="Продвижений нет"
          text={tab === 'all' ? 'Они появятся, когда клиенты начнут продвигать свои кейсы.' : 'В этом статусе ничего нет.'}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Кейс</Th>
              <Th>Владелец</Th>
              <Th className="text-right">Дней</Th>
              <Th>Период</Th>
              <Th className="text-right">Показы</Th>
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
                    <Link href={`/cases/${p.caseId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {p.caseTitle}
                    </Link>
                    <div className="text-xs text-faint">кейс {label(CASE_STATUS, p.caseStatus)}</div>
                  </Td>
                  <Td>
                    <Link href={`/users/${p.ownerId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {p.ownerName || p.ownerEmail || p.ownerId.slice(0, 8)}
                    </Link>
                    {p.ownerEmail && p.ownerName ? <div className="truncate text-xs text-faint">{p.ownerEmail}</div> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{p.days}</Td>
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
                  <Td className="text-right tabular-nums text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye size={13} weight="light" />
                      {new Intl.NumberFormat('ru-RU').format(p.impressions)}
                    </span>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {p.grantedBy ? (
                      <Badge tone="gold">подарок</Badge>
                    ) : p.totalCents === 0 ? (
                      <span className="text-faint">бесплатно</span>
                    ) : (
                      usd(p.totalCents, 2)
                    )}
                  </Td>
                  <Td>
                    <StatusPill map={PROMOTION_STATUS} value={p.status} />
                    {p.cancelReason ? <div className="mt-1 max-w-[200px] text-xs text-faint">{p.cancelReason}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(p.createdAt)}</Td>
                  {canWrite ? (
                    <Td className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        {p.status === 'active' ? (
                          <Button size="sm" variant="soft" onClick={() => setExtending(p)}>
                            <CalendarPlus size={14} /> Продлить
                          </Button>
                        ) : null}
                        {p.status === 'active' || p.status === 'pending_payment' ? (
                          <Button size="sm" variant="danger-soft" disabled={cancel.isPending} onClick={() => cancel.mutate(p)}>
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

/** Grant (case id + days + reason) or extend (days + reason). */
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
  const [caseId, setCaseId] = useState('');
  const [days, setDays] = useState('3');
  const [reason, setReason] = useState('');
  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 365;
  const caseOk = mode === 'extend' || /^[0-9a-f-]{36}$/i.test(caseId.trim());
  const reasonOk = reason.trim().length >= 10;

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'grant') {
        await api.POST('/admin/promotions/grant', { body: { caseId: caseId.trim(), days: n, reason: reason.trim() } });
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
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Продвижение"
      title={mode === 'grant' ? 'Выдать продвижение' : 'Продлить продвижение'}
      description={
        mode === 'grant'
          ? 'Бесплатно. Кейс должен быть открыт, и у него не должно быть идущего продвижения.'
          : promotion
            ? `«${promotion.caseTitle}», сейчас до ${formatDateTime(promotion.endsAt)}.`
            : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (daysOk && caseOk && reasonOk) save.mutate();
        }}
      >
        {mode === 'grant' ? (
          <Field label="ID кейса" htmlFor="pr-case" hint="Скопируйте из адреса страницы кейса.">
            <Input id="pr-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" className="font-mono" />
          </Field>
        ) : null}
        <Field label="Дней" htmlFor="pr-days" hint="От 1 до 365.">
          <Input id="pr-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="w-32" />
        </Field>
        <Field label="Причина" htmlFor="pr-reason" hint="Не короче 10 символов. Попадёт в журнал аудита.">
          <Textarea id="pr-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={save.isPending} disabled={!daysOk || !caseOk || !reasonOk || save.isPending}>
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

function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [price, setPrice] = useState(String(initial.priceCentsPerDay / 100));
  const [maxDays, setMaxDays] = useState(String(initial.maxDays));
  const [maxActive, setMaxActive] = useState(String(initial.maxActivePerCase));

  const cents = dollarsToCents(price);
  const md = Number(maxDays);
  const ma = Number(maxActive);
  const valid = cents != null && cents >= 50 && Number.isInteger(md) && md >= 1 && md <= 365 && Number.isInteger(ma) && ma >= 1;
  const dirty =
    enabled !== initial.enabled || cents !== initial.priceCentsPerDay || md !== initial.maxDays || ma !== initial.maxActivePerCase;

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT('/admin/promotions/settings', {
          body: { enabled, priceCentsPerDay: cents!, maxDays: md, maxActivePerCase: ma },
        })
      ).data!.data,
    onSuccess: (data) => {
      toast.success('Настройки продвижения сохранены');
      qc.setQueryData(['promotions-settings'], data);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <motion.div {...fadeUp(0)}>
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty) save.mutate();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <h3 className="font-medium text-heading">Продвижение включено</h3>
              <p className="mt-1 text-sm text-muted">Если выключить, клиенты не смогут купить продвижение. Уже идущие доработают свой срок.</p>
            </div>
            <Switch checked={enabled} onChange={setEnabled} disabled={!canEdit} label="Продвижение включено" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Цена за день, $" htmlFor="ps-price" hint="Не меньше $0.50.">
              <Input id="ps-price" inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Максимум дней за раз" htmlFor="ps-days" hint="От 1 до 365.">
              <Input id="ps-days" type="number" min={1} max={365} value={maxDays} disabled={!canEdit} onChange={(e) => setMaxDays(e.target.value)} />
            </Field>
            <Field label="Одновременно на кейс" htmlFor="ps-active" hint="Сейчас сервер разрешает только 1.">
              <Input id="ps-active" type="number" min={1} max={1} value={maxActive} disabled={!canEdit} onChange={(e) => setMaxActive(e.target.value)} />
            </Field>
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
