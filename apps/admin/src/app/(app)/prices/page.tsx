'use client';

import { ArrowRight, PencilSimple, Tag, UsersThree } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { dollarsToCents, fadeUp, useBillingRole } from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Prices = components['schemas']['AdminPlanPricesDto'];
type Item = components['schemas']['AdminPlanPriceItemDto'];
type Kind = Item['kind'];

const KIND: Record<Kind, { title: string; who: string; per: string }> = {
  monthly: { title: 'Адвокат · месяц', who: 'Месячная подписка адвоката', per: '/мес' },
  seat: { title: 'Место помощника', who: 'За каждого помощника на месячном тарифе', per: '/мес' },
  yearly: { title: 'Prime · год', who: 'Годовой тариф с 6 помощниками', per: '/год' },
  client_badge: { title: 'Галочка клиента', who: 'Золотая галочка подтверждённого клиента', per: '/мес' },
};

const MODE: Record<string, string> = {
  live: 'Stripe: боевой режим',
  test: 'Stripe: тестовый режим (Sandbox)',
  fake: 'Stripe не подключён (тестовые платежи)',
};

const money = (cents: number) => usd(cents, cents % 100 ? 2 : 0);

/** Owner 2026-10-03: plan prices — change an amount, the app and Stripe follow. */
export default function PricesPage() {
  const { canWrite } = useBillingRole();
  const [editing, setEditing] = useState<Item | null>(null);
  const q = useQuery({
    queryKey: ['plan-prices'],
    queryFn: async () => (await api.GET('/admin/billing/prices')).data!.data,
  });
  const data = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Цены"
        subtitle="Новая цена сразу видна в приложении и на сайте, и Stripe списывает её со всех новых оплат. Текущие подписчики платят прежнюю цену, пока вы не переведёте их на новую — тогда она начнёт действовать с их следующего продления."
        actions={
          data ? (
            <Badge tone={data.mode === 'live' ? 'success' : 'warning'} dot>
              {MODE[data.mode] ?? data.mode}
            </Badge>
          ) : null
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : !data ? (
        <EmptyState icon={Tag} title="Цены не загрузились" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((it, i) => (
              <PriceCard key={it.kind} it={it} i={i} canWrite={canWrite} onEdit={() => setEditing(it)} />
            ))}
          </div>
          <History data={data} />
        </>
      )}
      {editing ? <EditDialog it={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function PriceCard({ it, i, canWrite, onEdit }: { it: Item; i: number; canWrite: boolean; onEdit: () => void }) {
  const k = KIND[it.kind];
  return (
    <motion.div {...fadeUp(i)}>
      <Card spotlight className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-heading">{k.title}</div>
            <div className="mt-0.5 text-xs text-muted">{k.who}</div>
          </div>
          {canWrite ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <PencilSimple size={14} /> Изменить
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-[34px] leading-none font-semibold tracking-tight text-gold-gradient">{money(it.amountCents)}</span>
          <span className="text-sm text-muted">{k.per}</span>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs">
          {it.isCustom ? <Badge tone="gold">задана вами</Badge> : <Badge>по умолчанию</Badge>}
          {it.isCustom && it.amountCents !== it.defaultCents ? <span className="text-faint">по умолчанию {money(it.defaultCents)}</span> : null}
          <span className="ml-auto inline-flex items-center gap-1 text-muted" title="Платящих подписчиков на этом тарифе">
            <UsersThree size={14} /> {it.subscribers}
          </span>
        </div>
        {it.stripePriceId ? <div className="mt-2 truncate font-mono text-[11px] text-faint">{it.stripePriceId}</div> : null}
      </Card>
    </motion.div>
  );
}

function EditDialog({ it, onClose }: { it: Item; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const k = KIND[it.kind];
  const [amount, setAmount] = useState(String(it.amountCents / 100));
  const [note, setNote] = useState('');
  const [move, setMove] = useState(false);
  const cents = dollarsToCents(amount);
  const amountOk = cents != null && cents >= 100 && cents <= 10_000_000;
  const changed = cents !== it.amountCents;
  const noteOk = !move || note.trim().length >= 10;
  const ok = amountOk && noteOk && (changed || move);

  const save = useMutation({
    mutationFn: async () => {
      const res = changed
        ? (
            await api.PUT('/admin/billing/prices/{kind}', {
              params: { path: { kind: it.kind } },
              body: { amountCents: cents!, note: note.trim() || undefined },
            })
          ).data!.data
        : null;
      const moved = move
        ? (
            await api.POST('/admin/billing/prices/{kind}/move-subscribers', {
              params: { path: { kind: it.kind } },
              body: { reason: note.trim() },
            })
          ).data!.data
        : null;
      return { res, moved };
    },
    onSuccess: ({ res, moved }) => {
      if (res) toast.success(`${k.title}: теперь ${money(cents!)}`);
      if (res?.stripeError) toast.error(`Stripe пока не принял цену: ${res.stripeError}. Она создастся при первой оплате.`);
      if (moved) toast.success(`Переведено подписчиков: ${moved.moved}${moved.failed ? `, ошибок: ${moved.failed}` : ''}`);
      void qc.invalidateQueries({ queryKey: ['plan-prices'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open onClose={onClose} eyebrow="Цена" title={k.title} description={k.who}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save.mutate();
        }}
      >
        <Field label={`Новая цена, $ ${k.per}`} htmlFor="price-amount" hint={!amountOk ? 'от $1 до $100 000' : 'в долларах, можно с центами'}>
          <Input id="price-amount" autoFocus inputMode="decimal" className="w-40 text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {amountOk && changed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-surface-2 px-4 py-3 text-sm">
            <span className="text-muted line-through">{money(it.amountCents)}</span>
            <ArrowRight size={14} className="text-faint" />
            <span className="font-semibold text-heading">{money(cents!)}</span>
            <span className="text-muted">{k.per} для всех новых оплат</span>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-line px-4 py-3">
          <div className="text-sm">
            <div className="font-medium text-heading">Перевести текущих подписчиков ({it.subscribers})</div>
            <div className="mt-0.5 text-xs text-muted">
              Новая цена начнёт списываться с их следующего продления, без доплат сейчас. Без этого они продолжают платить прежнюю цену.
            </div>
          </div>
          <Switch checked={move} onChange={setMove} disabled={it.subscribers === 0} label="Перевести подписчиков" />
        </div>
        <Field label={move ? 'Причина (обязательно)' : 'Заметка'} htmlFor="price-note" hint={move && !noteOk ? 'не меньше 10 символов' : 'попадёт в журнал аудита'}>
          <Textarea id="price-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: стартовая цена на запуск" />
        </Field>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={save.isPending} disabled={!ok || save.isPending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function History({ data }: { data: Prices }) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-heading">История изменений</h2>
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Тариф</Th>
            <Th className="text-right">Цена</Th>
            <Th>Заметка</Th>
          </tr>
        </thead>
        <tbody>
          {data.history.length === 0 ? (
            <TableEmpty colSpan={4}>Цены ещё не меняли — действуют значения по умолчанию</TableEmpty>
          ) : (
            data.history.map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(h.createdAt)}</Td>
                <Td>
                  {KIND[h.kind].title} {h.active ? <Badge tone="success">сейчас</Badge> : null}
                </Td>
                <Td className="text-right tabular-nums">{money(h.amountCents)}</Td>
                <Td className="text-muted">{h.note ?? '—'}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
