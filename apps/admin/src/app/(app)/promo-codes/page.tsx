'use client';

import { ArrowsClockwise, MagnifyingGlass, Plus, Ticket } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import {
  CopyButton,
  dayStartIso,
  discountText,
  fadeUp,
  formatDate,
  LoadMore,
  nextDayIso,
  type PromoCode,
  PROMO_APPLIES,
  PROMO_AUDIENCE,
  PROMO_STATUS,
  PROMO_TONE,
  ProgressBar,
  todayStr,
  TonePill,
  UserCell,
  useBillingRole,
  dollarsToCents,
} from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { usd } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';

type Filter = 'active' | 'expired' | 'inactive';

/** Promo codes: list, create, on/off, redemptions. */
export default function PromoCodesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { canWrite } = useBillingRole();
  const [filter, setFilter] = useState<Filter>('active');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<PromoCode | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['promo-codes', filter, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/billing/promo-codes', { params: { query: { status: filter, q: q || undefined, cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const toggle = useMutation({
    mutationFn: async ({ p, on }: { p: PromoCode; on: boolean }) => {
      if (on) await api.PATCH('/admin/billing/promo-codes/{id}', { params: { path: { id: p.id } }, body: { active: true } });
      else await api.POST('/admin/billing/promo-codes/{id}/deactivate', { params: { path: { id: p.id } } });
      return { p, on };
    },
    onSuccess: ({ p, on }) => {
      toast.success(`${p.code}: ${on ? 'включён' : 'выключен'}`);
      void qc.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Промокоды"
        subtitle="Скидка в процентах или в долларах на первую оплату либо дополнительные бесплатные дни к пробному периоду. Код вводят при оформлении подписки."
        actions={
          canWrite ? (
            <Button variant="gold" onClick={() => setCreating(true)}>
              <Plus size={16} /> Создать промокод
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'active', label: 'Действуют' },
            { value: 'expired', label: 'Истекли' },
            { value: 'inactive', label: 'Выключены' },
          ]}
        />
        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim().toUpperCase());
          }}
        >
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="pl-9 font-mono uppercase" placeholder="Начало кода — Enter" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {list.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : rows.length === 0 && !list.error ? (
        <EmptyState
          icon={Ticket}
          title={q ? `Нет кодов на «${q}»` : 'Промокодов нет'}
          text={filter === 'active' ? 'Создайте код для блогера или акции.' : undefined}
          action={
            canWrite && filter === 'active' ? (
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus size={16} /> Создать промокод
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p, i) => (
            <PromoCard
              key={p.id}
              p={p}
              i={i}
              canWrite={canWrite}
              busy={toggle.isPending}
              onOpen={() => setOpen(p)}
              onToggle={(on) => toggle.mutate({ p, on })}
            />
          ))}
        </div>
      )}
      <LoadMore q={list} />
      {creating ? <CreateDialog onClose={() => setCreating(false)} /> : null}
      {open ? <RedemptionsDialog p={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PromoCard({
  p,
  i,
  canWrite,
  busy,
  onOpen,
  onToggle,
}: {
  p: PromoCode;
  i: number;
  canWrite: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: (on: boolean) => void;
}) {
  const share = p.maxRedemptions ? p.redeemedCount / p.maxRedemptions : 0;
  return (
    <motion.div {...fadeUp(i)}>
      <Card
        spotlight
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
        className={cn('flex h-full cursor-pointer flex-col p-5', !p.active && 'opacity-75')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate font-mono text-lg font-semibold tracking-wider text-heading">{p.code}</span>
              <CopyButton text={p.code} label="Скопировать код" />
            </div>
            <div className="mt-1">
              <TonePill map={PROMO_STATUS} tones={PROMO_TONE} value={p.status} />
            </div>
          </div>
          {canWrite ? (
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Switch checked={p.active} disabled={busy} label={p.active ? 'Выключить' : 'Включить'} onChange={onToggle} />
            </div>
          ) : null}
        </div>
        <div className="mt-4 text-[28px] leading-none font-semibold tracking-tight text-gold-gradient">{discountText(p)}</div>
        <div className="mt-2 text-sm text-muted">
          {PROMO_AUDIENCE[p.audience] ?? p.audience} · {PROMO_APPLIES[p.appliesTo] ?? p.appliesTo}
        </div>
        {p.description ? <p className="mt-1 line-clamp-2 text-xs text-faint">{p.description}</p> : null}
        <div className="mt-auto pt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted">Использован</span>
            <span className="font-mono tabular-nums text-ink">
              {p.redeemedCount} / {p.maxRedemptions ?? '∞'}
            </span>
          </div>
          <ProgressBar value={p.maxRedemptions ? share : 0} tone={share >= 1 ? 'warning' : 'gold'} />
          <div className="mt-3 flex justify-between text-xs text-faint">
            <span>{p.startsAt && new Date(p.startsAt) > new Date() ? `с ${formatDate(p.startsAt)}` : `создан ${formatDate(p.createdAt)}`}</span>
            <span>{p.expiresAt ? `до ${formatDate(p.expiresAt)}` : 'бессрочно'}</span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

type DType = 'percent' | 'amount' | 'free_days';
type Audience = 'all' | 'attorney' | 'client';
type Applies = 'any' | 'monthly' | 'yearly' | 'promotion';

function genCode(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [type, setType] = useState<DType>('percent');
  const [percent, setPercent] = useState('20');
  const [amount, setAmount] = useState('50');
  const [days, setDays] = useState('30');
  const [audience, setAudience] = useState<Audience>('attorney');
  const [applies, setApplies] = useState<Applies>('any');
  const [max, setMax] = useState('');
  const [starts, setStarts] = useState('');
  const [expires, setExpires] = useState('');
  const [description, setDescription] = useState('');
  const [key] = useState(() => crypto.randomUUID());

  const norm = code.trim().toUpperCase();
  const codeOk = /^[A-Z0-9_-]{3,40}$/.test(norm);
  const pct = Number(percent);
  const cents = dollarsToCents(amount);
  const nDays = Number(days);
  const valueOk =
    type === 'percent' ? Number.isInteger(pct) && pct >= 1 && pct <= 100 : type === 'amount' ? cents != null : Number.isInteger(nDays) && nDays >= 1 && nDays <= 365;
  const maxN = max.trim() ? Number(max) : null;
  const maxOk = maxN == null || (Number.isInteger(maxN) && maxN >= 1);
  const datesOk = !starts || !expires || starts <= expires;
  const ok = codeOk && valueOk && maxOk && datesOk;

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/billing/promo-codes', {
          headers: { 'Idempotency-Key': key },
          body: {
            code: norm,
            discountType: type,
            percentOff: type === 'percent' ? pct : undefined,
            amountOffCents: type === 'amount' ? cents! : undefined,
            freeDays: type === 'free_days' ? nDays : undefined,
            audience,
            appliesTo: applies,
            maxRedemptions: maxN ?? undefined,
            startsAt: starts ? dayStartIso(starts) : undefined,
            expiresAt: expires ? nextDayIso(expires) : undefined,
            description: description.trim() || undefined,
          },
        })
      ).data!.data,
    onSuccess: (p) => {
      toast.success(`Промокод ${p.code} создан`);
      void qc.invalidateQueries({ queryKey: ['promo-codes'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open wide onClose={onClose} eyebrow="Промокод" title="Создать промокод" description="Код нельзя переименовать после создания. Лимит, срок и описание можно поменять позже.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) create.mutate();
        }}
      >
        <Field label="Код" htmlFor="promo-code" hint={code && !codeOk ? 'A–Z, 0–9, «-» и «_», от 3 до 40 символов' : 'латиница и цифры, хранится заглавными'}>
          <div className="flex gap-2">
            <Input
              id="promo-code"
              autoFocus
              maxLength={40}
              className="font-mono tracking-wider uppercase"
              placeholder="BLOGGER20"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button type="button" variant="outline" onClick={() => setCode(genCode())}>
              <ArrowsClockwise size={15} /> Сгенерировать
            </Button>
          </div>
        </Field>

        <Field label="Тип скидки">
          <Tabs
            value={type}
            onChange={setType}
            items={[
              { value: 'percent', label: 'Процент' },
              { value: 'amount', label: 'Сумма' },
              { value: 'free_days', label: 'Бесплатные дни' },
            ]}
          />
        </Field>

        {type === 'percent' ? (
          <Field label="Скидка, %" htmlFor="promo-pct" hint="1–100, на первую оплату">
            <Input id="promo-pct" type="number" min={1} max={100} className="w-32" value={percent} onChange={(e) => setPercent(e.target.value)} />
          </Field>
        ) : type === 'amount' ? (
          <Field label="Скидка, $" htmlFor="promo-amt" hint={cents ? `−${usd(cents, 2)} с первой оплаты` : 'сумма в долларах'}>
            <Input id="promo-amt" inputMode="decimal" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        ) : (
          <Field label="Дней" htmlFor="promo-days" hint="добавляются к пробному периоду, 1–365">
            <Input id="promo-days" type="number" min={1} max={365} className="w-32" value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Для кого" htmlFor="promo-aud">
            <Select id="promo-aud" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              <option value="all">Все</option>
              <option value="attorney">Адвокаты</option>
              <option value="client">Клиенты</option>
            </Select>
          </Field>
          <Field label="На что" htmlFor="promo-app">
            <Select id="promo-app" value={applies} onChange={(e) => setApplies(e.target.value as Applies)}>
              <option value="any">Любой тариф</option>
              <option value="monthly">Месячный</option>
              <option value="yearly">Годовой</option>
              <option value="promotion">Продвижение кейса</option>
            </Select>
          </Field>
          <Field label="Лимит использований" htmlFor="promo-max" hint={!maxOk ? 'целое число ≥ 1' : 'пусто — без лимита'}>
            <Input id="promo-max" type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="∞" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Начало" htmlFor="promo-start" hint="пусто — сразу">
            <Input id="promo-start" type="date" min={todayStr()} value={starts} onChange={(e) => setStarts(e.target.value)} />
          </Field>
          <Field label="Действует до (включительно)" htmlFor="promo-end" hint={!datesOk ? <span className="text-danger">раньше начала</span> : 'пусто — бессрочно'}>
            <Input id="promo-end" type="date" min={starts || todayStr()} value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>

        <Field label="Описание" htmlFor="promo-desc" hint="для себя: блогер, акция, канал">
          <Textarea id="promo-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="font-mono text-sm text-muted">
            {norm || 'КОД'} · {valueOk ? discountText({ discountType: type, percentOff: pct, amountOffCents: cents, freeDays: nDays }) : '—'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" variant="gold" loading={create.isPending} disabled={!ok || create.isPending}>
              Создать
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function RedemptionsDialog({ p, onClose }: { p: PromoCode; onClose: () => void }) {
  const { canOpenUsers } = useBillingRole();
  const list = useInfiniteQuery({
    queryKey: ['promo-redemptions', p.id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/billing/promo-codes/{id}/redemptions', { params: { path: { id: p.id }, query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((x) => x.data) ?? [];
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow="Промокод"
      title={<span className="font-mono tracking-wider">{p.code}</span>}
      description={`${discountText(p)} · ${PROMO_AUDIENCE[p.audience] ?? p.audience} · ${PROMO_APPLIES[p.appliesTo] ?? p.appliesTo} · использован ${p.redeemedCount}${p.maxRedemptions ? ` из ${p.maxRedemptions}` : ''}`}
    >
      {p.description ? <p className="mb-4 text-sm text-muted">{p.description}</p> : null}
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Пользователь</Th>
            <Th className="text-right">Скидка</Th>
            <Th>Когда</Th>
          </tr>
        </thead>
        <tbody>
          {list.isPending ? (
            <TableEmpty colSpan={3} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={3}>Кодом ещё никто не воспользовался</TableEmpty>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <UserCell user={r.user} userId={r.userId} link={canOpenUsers} />
                </Td>
                <Td className="text-right tabular-nums">{r.amountOffCents != null ? usd(r.amountOffCents, 2) : '—'}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <LoadMore q={list} />
    </Dialog>
  );
}
