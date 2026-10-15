'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';

const STEP: Record<string, string> = {
  signed_up: 'Зарегистрировались',
  verified: 'Подтвердили телефон или почту',
  role_chosen: 'Выбрали роль',
  onboarded: 'Прошли онбординг',
  first_action: 'Первое действие (клиент: кейс, адвокат: ставка)',
  paid: 'Заплатили (подписка или Boost)',
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`;

/** Bars drawn with plain divs: no chart library for a few small charts. */
function Bars({ values, labels, tone }: { values: number[]; labels: string[]; tone: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-28 items-end gap-[2px]">
      {values.map((v, i) => (
        <div key={labels[i]} className="flex-1" title={`${labels[i]}: ${v}`}>
          <div className={`w-full rounded-t ${tone}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Owner 2026-10-15: our own analytics (free, in our database). */
export function AnalyticsAdmin() {
  const [days, setDays] = useState('30');
  const q = useQuery({
    queryKey: ['analytics', days],
    queryFn: async () => (await api.GET('/admin/analytics', { params: { query: { days: Number(days) } } })).data!.data,
  });
  const d = q.data;
  const cell = (label: string, value: string | number, hint?: string) => (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {hint ? <div className="text-xs text-faint">{hint}</div> : null}
    </Card>
  );
  const top = d?.funnel[0]?.count ?? 0;
  const sum = (f: (x: NonNullable<typeof d>['daily'][number]) => number) => (d?.daily ?? []).reduce((n, x) => n + f(x), 0);
  return (
    <>
      <div className="mb-5">
        <Tabs
          size="sm"
          value={days}
          onChange={setDays}
          items={[
            { value: '14', label: '14 дней' },
            { value: '30', label: '30 дней' },
            { value: '90', label: '90 дней' },
          ]}
        />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {d ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cell('Заходили сегодня (DAU)', d.dau)}
            {cell('За 7 дней (WAU)', d.wau)}
            {cell('За 30 дней (MAU)', d.mau)}
            {cell('Липкость DAU / MAU', `${d.stickinessPercent}%`, 'сколько из месячных заходят каждый день')}
          </div>

          <Card className="p-4">
            <div className="mb-2 text-sm font-medium text-ink">Кто заходил по дням</div>
            <Bars values={d.daily.map((x) => x.active)} labels={d.daily.map((x) => x.day)} tone="bg-gold" />
            <div className="mt-1 text-xs text-muted">Новых за период: {sum((x) => x.signups)}</div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium text-ink">Путь нового человека за период</div>
            <div className="space-y-2">
              {d.funnel.map((s, i) => {
                const prev = i === 0 ? s.count : d.funnel[i - 1].count;
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink">{STEP[s.key] ?? s.key}</span>
                      <span className="tabular-nums text-muted">
                        {s.count}
                        {i > 0 && prev > 0 ? ` · ${Math.round((s.count / prev) * 100)}% от прошлого шага` : ''}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-gold" style={{ width: `${top > 0 ? Math.max(1, (s.count / top) * 100) : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-medium text-ink">Вернулись (пришли 7–14 дней назад)</div>
              <div className="text-sm text-muted">Людей: {d.retention.cohort}</div>
              <div className="mt-1 text-ink">
                после 1-го дня: <b>{d.retention.d1Percent}%</b> · после 7-го дня: <b>{d.retention.d7Percent}%</b>
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 text-sm font-medium text-ink">Отток: были 30–60 дней назад и пропали</div>
              <div className="text-ink">
                Клиенты: <b>{d.churn.clients.lost}</b> из {d.churn.clients.before}
                {d.churn.clients.before > 0 ? ` (${Math.round((d.churn.clients.lost / d.churn.clients.before) * 100)}%)` : ''}
              </div>
              <div className="text-ink">
                Адвокаты: <b>{d.churn.attorneys.lost}</b> из {d.churn.attorneys.before}
                {d.churn.attorneys.before > 0 ? ` (${Math.round((d.churn.attorneys.lost / d.churn.attorneys.before) * 100)}%)` : ''}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-2 text-sm font-medium text-ink">Покупки по дням: подписки и Boost</div>
            <Bars
              values={d.daily.map((x) => x.subscriptionCents + x.boostCents)}
              labels={d.daily.map((x) => `${x.day} ${usd(x.subscriptionCents + x.boostCents)}`)}
              tone="bg-success"
            />
            <div className="mt-1 text-xs text-muted">
              Подписки {usd(sum((x) => x.subscriptionCents))} · Boost {usd(sum((x) => x.boostCents))} · покупок {sum((x) => x.purchases)}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
