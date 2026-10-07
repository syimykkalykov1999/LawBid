'use client';

import { Article, Briefcase, CursorClick, Eye, FilmStrip, HandTap, IdentificationCard, UsersThree } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { fadeUp } from '@/components/billing/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * Owner 2026-10-07: what a boost is paid for, per promotable thing.
 * Each thing (post, video, case, attorney profile) has its own switch and
 * four billing models — impressions, reach, taps, real actions — each with
 * its own switch and price. The app offers only what is on here.
 */
export type BillingModel = 'impressions' | 'reach' | 'clicks' | 'actions';
export type BoostTarget = 'post' | 'video' | 'case' | 'profile';

export interface ModelPrice {
  enabled: boolean;
  priceCents: number;
}

export interface TargetPricing {
  enabled: boolean;
  models: Record<BillingModel, ModelPrice>;
  /** Which actions count for the `actions` model. */
  actions: string[];
}

export type PricingMatrix = Record<BoostTarget, TargetPricing>;

const TARGETS: { key: BoostTarget; label: string; icon: typeof Article }[] = [
  { key: 'post', label: 'Посты', icon: Article },
  { key: 'video', label: 'Видео', icon: FilmStrip },
  { key: 'case', label: 'Кейсы', icon: Briefcase },
  { key: 'profile', label: 'Профили адвокатов', icon: IdentificationCard },
];

const MODELS: { key: BillingModel; label: string; unit: string; icon: typeof Eye }[] = [
  { key: 'impressions', label: 'Показы', unit: 'за 1000 показов', icon: Eye },
  { key: 'reach', label: 'Люди', unit: 'за 1000 человек', icon: UsersThree },
  { key: 'clicks', label: 'Нажатия', unit: 'за 1 нажатие', icon: CursorClick },
  { key: 'actions', label: 'Действия', unit: 'за 1 действие', icon: HandTap },
];

/** Actions that can count as a real result, per thing. Never "hired" or
 * "case won": that would be paying for a client (fee-sharing). */
export const ACTION_OPTIONS: Record<BoostTarget, { key: string; label: string }[]> = {
  post: [
    { key: 'follow', label: 'Подписка' },
    { key: 'message', label: 'Сообщение' },
    { key: 'save', label: 'Сохранение' },
    { key: 'profile_open', label: 'Открыл профиль' },
  ],
  video: [
    { key: 'watched', label: 'Досмотрел' },
    { key: 'follow', label: 'Подписка' },
    { key: 'message', label: 'Сообщение' },
    { key: 'save', label: 'Сохранение' },
  ],
  case: [
    { key: 'bid', label: 'Ставка адвоката' },
    { key: 'question', label: 'Вопрос по кейсу' },
    { key: 'save', label: 'Сохранение' },
  ],
  profile: [
    { key: 'message', label: 'Сообщение' },
    { key: 'consultation', label: 'Запрос консультации' },
    { key: 'follow', label: 'Подписка' },
  ],
};

const dollars = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '');
const toCents = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function PricingModelsCard({ initial, canEdit }: { initial: PricingMatrix; canEdit: boolean }) {
  const [m, setM] = useState<PricingMatrix>(initial);
  const [text, setText] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const t of TARGETS) for (const md of MODELS) out[`${t.key}.${md.key}`] = dollars(initial[t.key].models[md.key].priceCents);
    return out;
  });

  const patch = (t: BoostTarget, f: (p: TargetPricing) => TargetPricing) => setM((prev) => ({ ...prev, [t]: f(prev[t]) }));
  const valid = Object.values(text).every((v) => toCents(v) != null);
  const dirty = JSON.stringify(m) !== JSON.stringify(initial);

  return (
    <motion.div {...fadeUp(0)}>
      <div className="grid gap-4 lg:grid-cols-2">
        {TARGETS.map(({ key: t, label, icon: Icon }) => {
          const p = m[t];
          return (
            <Card key={t} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-gold-500/12 text-gold-600 dark:text-gold-300">
                    <Icon size={18} weight="light" />
                  </span>
                  <h3 className="truncate font-medium text-heading">{label}</h3>
                </div>
                <Switch checked={p.enabled} onChange={(v) => patch(t, (x) => ({ ...x, enabled: v }))} disabled={!canEdit} label={label} />
              </div>

              <div className={cn('mt-4 divide-y divide-line', !p.enabled && 'opacity-45')}>
                {MODELS.map(({ key: md, label: mLabel, unit, icon: MIcon }) => {
                  const on = p.models[md].enabled;
                  const id = `pm-${t}-${md}`;
                  return (
                    <div key={md} className="py-3">
                      <div className="flex items-center gap-3">
                        <MIcon size={18} weight="light" className="shrink-0 text-muted" />
                        <label htmlFor={id} className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-heading">{mLabel}</span>
                          <span className="block text-xs text-faint">{unit}</span>
                        </label>
                        <div className="relative w-24 shrink-0">
                          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-faint">$</span>
                          <Input
                            id={id}
                            inputMode="decimal"
                            className="h-9 pl-6 text-right tabular-nums"
                            value={text[`${t}.${md}`]}
                            disabled={!canEdit || !p.enabled || !on}
                            onChange={(e) => {
                              const v = e.target.value;
                              setText((s) => ({ ...s, [`${t}.${md}`]: v }));
                              const c = toCents(v);
                              if (c != null) patch(t, (x) => ({ ...x, models: { ...x.models, [md]: { ...x.models[md], priceCents: c } } }));
                            }}
                          />
                        </div>
                        <Switch
                          checked={on}
                          onChange={(v) => patch(t, (x) => ({ ...x, models: { ...x.models, [md]: { ...x.models[md], enabled: v } } }))}
                          disabled={!canEdit || !p.enabled}
                          label={`${label}: ${mLabel}`}
                        />
                      </div>
                      {md === 'actions' && on ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[30px]">
                          {ACTION_OPTIONS[t].map((a) => {
                            const sel = p.actions.includes(a.key);
                            return (
                              <button
                                key={a.key}
                                type="button"
                                disabled={!canEdit || !p.enabled}
                                aria-pressed={sel}
                                onClick={() => patch(t, (x) => ({ ...x, actions: sel ? x.actions.filter((k) => k !== a.key) : [...x.actions, a.key] }))}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
                                  sel ? 'border-gold-500/60 bg-gold-500/12 text-heading' : 'border-line text-muted hover:border-line-strong',
                                )}
                              >
                                {a.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      {canEdit ? (
        <div className="mt-4 flex items-center justify-end gap-3">
          {!valid ? <span className="text-xs text-danger">Проверьте цены</span> : null}
          <Button type="button" disabled={!valid || !dirty}>
            Сохранить
          </Button>
        </div>
      ) : null}
    </motion.div>
  );
}

const on = (priceCents: number, enabled = true): ModelPrice => ({ enabled, priceCents });

/** Starting prices until the owner sets their own. */
export const DEFAULT_PRICING: PricingMatrix = {
  post: { enabled: true, models: { impressions: on(500), reach: on(800), clicks: on(30), actions: on(150) }, actions: ['follow', 'message'] },
  video: { enabled: true, models: { impressions: on(400), reach: on(700), clicks: on(25), actions: on(120) }, actions: ['watched', 'follow'] },
  case: { enabled: true, models: { impressions: on(500), reach: on(800, false), clicks: on(40), actions: on(200) }, actions: ['bid'] },
  profile: { enabled: false, models: { impressions: on(600), reach: on(900), clicks: on(50), actions: on(300) }, actions: ['message', 'consultation'] },
};
