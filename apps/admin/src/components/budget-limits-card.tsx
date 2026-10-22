'use client';

import { Gauge } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

type Window = 'minute' | 'daily' | 'monthly';
type Mode = 'auto' | 'manual';

type BudgetLimit = {
  provider: string;
  window: Window;
  mode: Mode;
  floor: number;
  ceiling: number;
  cap: number;
  envDefault: number;
  usedToday: number;
  usedThisMonth: number;
  lastAutoAt: string | null;
};

const PROVIDERS: { key: string; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Письма' },
  { key: 'id_check', label: 'Проверка личности' },
  { key: 'storage', label: 'Загрузки файлов' },
  { key: 'translate', label: 'Перевод' },
  { key: 'video', label: 'Видео' },
  { key: 'image_moderation', label: 'Проверка фото (AWS)' },
];

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'minute', label: 'в минуту' },
  { key: 'daily', label: 'в день' },
  { key: 'monthly', label: 'в месяц' },
];

const MAX = 10_000_000;
const fmt = (n: number) => n.toLocaleString('ru-RU');

/** `budget.*` rows are edited here, not in the generic settings table. */
export const isBudgetKey = (key: string) => key.startsWith('budget.');

type Draft = { mode: Mode; floor: string; ceiling: string; value: string };

function toDraft(r: BudgetLimit): Draft {
  return { mode: r.mode, floor: String(r.floor), ceiling: String(r.ceiling), value: String(r.cap) };
}

function int(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX ? n : null;
}

/**
 * Owner 2026-10-05 «лимиты увеличиваются по росту и уменьшаются по
 * снижению»: CostGuard caps with an Авто / Вручную switch per provider and
 * window. Auto caps are recomputed hourly by the API (cost.autoscale).
 */
export function BudgetLimitsCard() {
  const q = useQuery({
    queryKey: ['config', 'budgets'],
    queryFn: async () => (await api.GET('/admin/config/budgets')).data!.data as BudgetLimit[],
  });
  const rows = q.data ?? [];
  const last = rows.map((r) => r.lastAutoAt).filter((v): v is string => Boolean(v)).sort().at(-1);

  return (
    <div className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-heading">
          <Gauge size={16} className="shrink-0" /> <span className="min-w-0">Лимиты расходов</span>
        </div>
        {last ? <span className="text-[11px] text-faint">Пересчитано: {formatDateTime(last)}</span> : null}
      </div>
      <p className="mt-0.5 mb-3 text-xs text-muted">
        В режиме «Авто» лимит каждый час подстраивается под реальную нагрузку: растёт, когда писем и SMS становится больше, и снижается, когда
        меньше. Он никогда не опускается ниже минимума и не поднимается выше потолка безопасности. В режиме «Вручную» лимит равен вашему
        значению; 0 — сервис выключен.
      </p>
      {q.error ? <div className="text-xs text-danger">{errorText(q.error)}</div> : null}
      {q.isPending ? <div className="text-xs text-faint">Загрузка…</div> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {PROVIDERS.map((p) => {
          const items = WINDOWS.map((w) => rows.find((r) => r.provider === p.key && r.window === w.key)).filter(
            (r): r is BudgetLimit => Boolean(r),
          );
          if (items.length === 0) return null;
          return (
            <section key={p.key} className="min-w-0 rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h4 className="min-w-0 text-sm font-medium text-ink">{p.label}</h4>
                <span className="text-[11px] text-muted">
                  сегодня {fmt(items[0].usedToday)} · за месяц {fmt(items[0].usedThisMonth)}
                </span>
              </div>
              <div className="divide-y divide-line">
                {items.map((r) => (
                  <BudgetRow key={`${r.provider}.${r.window}.${r.mode}.${r.floor}.${r.ceiling}.${r.cap}`} row={r} providerLabel={p.label} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BudgetRow({ row, providerLabel }: { row: BudgetLimit; providerLabel: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  const windowLabel = WINDOWS.find((w) => w.key === row.window)?.label ?? row.window;
  const used = row.window === 'monthly' ? row.usedThisMonth : row.usedToday;
  const pct = row.window !== 'minute' && row.cap > 0 ? Math.min(100, Math.round((used / row.cap) * 100)) : null;

  const floor = int(draft.floor);
  const ceiling = int(draft.ceiling);
  const value = int(draft.value);
  const error =
    draft.mode === 'auto'
      ? floor === null || ceiling === null
        ? 'целое число от 0 до 10 000 000'
        : floor > ceiling
          ? 'минимум больше потолка'
          : null
      : value === null
        ? 'целое число от 0 до 10 000 000'
        : null;
  const initial = toDraft(row);
  const dirty =
    draft.mode !== initial.mode ||
    (draft.mode === 'auto' ? draft.floor !== initial.floor || draft.ceiling !== initial.ceiling : draft.value !== initial.value);

  const save = useMutation({
    mutationFn: () =>
      api.PUT('/admin/config/budgets/{provider}/{window}', {
        params: { path: { provider: row.provider as never, window: row.window } },
        body: draft.mode === 'auto' ? { mode: 'auto', floor: floor!, ceiling: ceiling! } : { mode: 'manual', value: value! },
      }),
    onSuccess: () => {
      toast.success(`Сохранено: ${providerLabel}, ${windowLabel}`);
      void qc.invalidateQueries({ queryKey: ['config', 'budgets'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <form
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !error) save.mutate();
      }}
    >
      <div className="w-24 shrink-0 text-xs font-medium text-ink">{windowLabel}</div>
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
        <Switch
          checked={draft.mode === 'auto'}
          onChange={(v) => setDraft({ ...draft, mode: v ? 'auto' : 'manual' })}
          label={`${providerLabel} ${windowLabel}: авто`}
          disabled={save.isPending}
        />
        <span className="w-14">{draft.mode === 'auto' ? 'Авто' : 'Вручную'}</span>
      </label>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-muted">
        <span>сейчас</span>
        {row.cap === 0 ? <Badge tone="danger">выключен</Badge> : <Badge tone={pct !== null && pct >= 80 ? 'warning' : 'neutral'}>{fmt(row.cap)}</Badge>}
        {pct !== null ? <span className="text-[11px] text-faint">{pct}%</span> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {draft.mode === 'auto' ? (
          <>
            <NumberField label="Минимум" value={draft.floor} onChange={(v) => setDraft({ ...draft, floor: v })} />
            <NumberField label="Потолок" value={draft.ceiling} onChange={(v) => setDraft({ ...draft, ceiling: v })} />
          </>
        ) : (
          <NumberField label="Значение" hint="0 = отключить" value={draft.value} onChange={(v) => setDraft({ ...draft, value: v })} />
        )}
        {dirty ? (
          <Button size="sm" type="submit" disabled={save.isPending || Boolean(error)} title={error ?? undefined}>
            Сохранить
          </Button>
        ) : null}
      </div>
      {error ? <div className="basis-full text-right text-[11px] text-danger">{error}</div> : null}
    </form>
  );
}

function NumberField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
      <span className="whitespace-nowrap">
        {label}
        {hint ? <span className="text-faint"> ({hint})</span> : null}
      </span>
      <Input
        inputMode="numeric"
        aria-label={hint ? `${label} (${hint})` : label}
        className="h-8 w-24 font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
