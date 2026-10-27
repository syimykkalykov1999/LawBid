'use client';

import { Article, Briefcase, CursorClick, Eye, FilmStrip, HandTap, IdentificationCard, UsersThree } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { m as motion } from 'motion/react';
import { useState } from 'react';
import { fadeUp } from '@/components/billing/shared';
import { growthError } from '@/components/growth/errors';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/utils';

/**
 * Owner 2026-10-27: what a boost is paid for, per promotable thing. Each
 * thing (post, video, case, attorney profile) has four ways to pay — views
 * (per 1000), people (per 1000), taps (each), real actions (each) — every
 * one with its own switch and price, and the owner picks which actions
 * count. Everything new is OFF until switched on here. A change of a price
 * or a switch asks for one fresh 2FA code (no second admin) and is written
 * to the audit log.
 */
type Settings = components['schemas']['PromotionSettingsDto'];
export type PricingMatrix = components['schemas']['PricingMatrixDto'];
type TargetPricing = components['schemas']['TargetPricingDto'];
type BillingModel = keyof components['schemas']['BillingModelsDto'];
type BoostTarget = keyof PricingMatrix;

/** Priced here already; the app cannot boost these yet. */
const SOON: BoostTarget[] = ['profile'];

const TARGETS: { key: BoostTarget; label: string; icon: typeof Article; master?: keyof Settings }[] = [
  { key: 'post', label: 'Посты', icon: Article, master: 'postsEnabled' },
  { key: 'video', label: 'Видео', icon: FilmStrip, master: 'reelsEnabled' },
  { key: 'case', label: 'Кейсы', icon: Briefcase, master: 'enabled' },
  { key: 'profile', label: 'Профили адвокатов', icon: IdentificationCard },
];

const MODELS: { key: BillingModel; label: string; unit: string; icon: typeof Eye }[] = [
  { key: 'impressions', label: 'Показы', unit: 'за 1000 показов', icon: Eye },
  { key: 'reach', label: 'Люди', unit: 'за 1000 человек', icon: UsersThree },
  { key: 'clicks', label: 'Нажатия', unit: 'за 1 нажатие', icon: CursorClick },
  { key: 'actions', label: 'Действия', unit: 'за 1 действие', icon: HandTap },
];

/** Actions that can count as a real result, per thing. Never "hired" or
 * "case won": that would be paying for a client (fee-sharing). «Видит
 * только приложение» ones count once the app reports them. */
export const ACTION_OPTIONS: Record<BoostTarget, { key: string; label: string; app?: boolean }[]> = {
  post: [
    { key: 'follow', label: 'Подписка' },
    { key: 'message', label: 'Сообщение' },
    { key: 'save', label: 'Сохранение' },
    { key: 'profile_open', label: 'Открыл профиль', app: true },
    { key: 'call', label: 'Нажал «Позвонить»', app: true },
  ],
  video: [
    { key: 'watched', label: 'Досмотрел', app: true },
    { key: 'follow', label: 'Подписка' },
    { key: 'message', label: 'Сообщение' },
    { key: 'save', label: 'Сохранение' },
    { key: 'profile_open', label: 'Открыл профиль', app: true },
    { key: 'call', label: 'Нажал «Позвонить»', app: true },
  ],
  case: [
    { key: 'bid', label: 'Ставка адвоката' },
    { key: 'question', label: 'Вопрос по кейсу' },
    { key: 'save', label: 'Сохранение' },
  ],
  profile: [
    { key: 'follow', label: 'Подписка' },
    { key: 'message', label: 'Сообщение' },
    { key: 'call', label: 'Нажал «Позвонить»', app: true },
  ],
};

const dollars = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '');
const toCents = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function PricingModelsCard({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = settings.pricing;
  const [m, setM] = useState<PricingMatrix>(initial);
  const [stepUp, setStepUp] = useState(false);
  const [text, setText] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const t of TARGETS) for (const md of MODELS) out[`${t.key}.${md.key}`] = dollars(initial[t.key].models[md.key].priceCents);
    return out;
  });

  const patch = (t: BoostTarget, f: (p: TargetPricing) => TargetPricing) => setM((prev) => ({ ...prev, [t]: f(prev[t]) }));
  const valid = Object.values(text).every((v) => toCents(v) != null);
  const dirty = JSON.stringify(m) !== JSON.stringify(initial);

  const save = useMutation({
    // Only the matrix is sent (maxActivePerCase is the schema's defaulted
    // field, sent back unchanged): the other settings are not touched.
    mutationFn: async () => (await api.PUT('/admin/promotions/settings', { body: { maxActivePerCase: settings.maxActivePerCase, pricing: m } })).data!.data,
    onSuccess: (data) => {
      toast.success('Цены продвижения сохранены');
      qc.setQueryData(['promotions-settings'], data);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(true);
      else toast.error(growthError(e));
    },
  });

  return (
    <motion.div {...fadeUp(0)}>
      <p className="mb-4 text-sm text-muted">
        Человек платит за то, что выбрал: за показы, за людей, за нажатия или за настоящие действия. Включите нужные способы и задайте цену. Всё новое выключено, пока вы его не включите. Если выключены все способы у
        вещи, её нельзя продвигать. Кто платит за людей, нажатия или действия, тому деньги за непотраченное возвращаются сами.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {TARGETS.map(({ key: t, label, icon: Icon, master }) => {
          const soon = SOON.includes(t);
          const p = m[t];
          const masterOff = master ? settings[master] === false : false;
          return (
            <Card key={t} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-gold-500/12 text-gold-600 dark:text-gold-300">
                    <Icon size={18} weight="light" />
                  </span>
                  <h3 className="truncate font-medium text-heading">{label}</h3>
                  {soon ? <Badge>скоро</Badge> : null}
                  {masterOff ? <Badge>выключено в «Настройки»</Badge> : null}
                </div>
              </div>

              <div className={cn('mt-4 divide-y divide-line', (soon || masterOff) && 'opacity-60')}>
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
                            disabled={!canEdit}
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
                          disabled={!canEdit}
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
                                disabled={!canEdit}
                                aria-pressed={sel}
                                title={a.app ? 'Это действие видит только приложение: считается, когда оно его присылает' : undefined}
                                onClick={() => patch(t, (x) => ({ ...x, actions: sel ? x.actions.filter((k) => k !== a.key) : [...x.actions, a.key] }))}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
                                  sel ? 'border-gold-500/60 bg-gold-500/12 text-heading' : 'border-line text-muted hover:border-line-strong',
                                )}
                              >
                                {a.label}
                                {a.app ? ' · из приложения' : ''}
                              </button>
                            );
                          })}
                          {p.actions.length === 0 ? <span className="text-xs text-danger">Выберите хотя бы одно действие, иначе способ не включится</span> : null}
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
          <Button type="button" loading={save.isPending} disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-faint">Менять цены может только супер-админ.</p>
      )}
      <StepUpDialog
        open={stepUp}
        description="Изменение цен и переключателей продвижения требует свежий код из приложения-аутентификатора."
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          save.mutate();
        }}
      />
    </motion.div>
  );
}
