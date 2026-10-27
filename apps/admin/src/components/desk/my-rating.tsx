'use client';

import { Medal } from '@phosphor-icons/react';
import { Badge, Card, type Tone } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { SectionTitle } from '@/components/page-header';
import { useMyPiecework, useMyProgress, type DeskSettingsView, type MyProgress, type PieceworkMine } from '@/lib/desk-data';
import { money } from '@/lib/payroll';

const BAND: Record<string, { label: string; tone: Tone; text: string }> = {
  green: { label: 'Отлично', tone: 'success', text: 'Вы в числе лучших в своей команде.' },
  ok: { label: 'В норме', tone: 'info', text: 'Работа на уровне нормы.' },
  yellow: { label: 'Стоит подтянуть', tone: 'warning', text: 'Рейтинг ниже нормы: посмотрите, что тянет его вниз.' },
  red: { label: 'Нужно внимание', tone: 'danger', text: 'Рейтинг сильно ниже нормы: посмотрите, что тянет его вниз.' },
  low_data: { label: 'Мало данных', tone: 'neutral', text: 'Решений пока мало, чтобы считать рейтинг честно. Он появится, когда наберётся достаточно.' },
};

/** What the worker is told about themselves: only the soft, helpful ones. */
const SOFT_SUGGESTION: Record<string, string> = {
  reward: 'Вы работаете лучше большинства: за это положен бонус.',
  retrain: 'Можно пройти короткое обучение, чтобы поднять рейтинг.',
  more_review: 'Часть ваших решений будет проверяться чаще обычного: это не наказание, а помощь.',
};

const PARTS: { key: keyof MyProgress; label: string; hint: string }[] = [
  { key: 'accuracy', label: 'Точность', hint: 'как часто ваши решения подтверждаются при проверке' },
  { key: 'clean', label: 'Без отмен и жалоб', hint: 'решения, которые не вернулись и не обжаловались' },
  { key: 'usersVerdict', label: 'Оценка людей', hint: 'что пишут и ставят пользователи' },
  { key: 'speed', label: 'Скорость', hint: 'укладываетесь ли в сроки' },
];

export function MyRating({ settings }: { settings: DeskSettingsView }) {
  const showRating = settings.on('staff.rating_enabled') && settings.on('staff.worker_progress_enabled');
  const progress = useMyProgress(showRating);
  const showPay = settings.on('staff.piecework_enabled');
  const pay = useMyPiecework(showPay);
  return (
    <div className="space-y-6">
      <RatingCard enabled={showRating} q={progress} />
      {showPay ? (
        <>
          <SectionTitle>Моя оплата</SectionTitle>
          <PayCard q={pay} />
        </>
      ) : null}
    </div>
  );
}

function RatingCard({ enabled, q }: { enabled: boolean; q: ReturnType<typeof useMyProgress> }) {
  if (!enabled) {
    return <EmptyState icon={Medal} title="Рейтинг пока не показывается" text="Когда владелец включит личный рейтинг, он появится здесь: оценка, из чего она сложилась и что улучшить." />;
  }
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (!q.data || !q.data.ok) {
    return <EmptyState icon={Medal} title="Рейтинг ещё не готов" text="Он считается раз в ночь. Загляните завтра." />;
  }
  const p = q.data.data;
  const band = BAND[p.status] ?? BAND.ok;
  const soft = p.suggestionKinds.filter((k) => SOFT_SUGGESTION[k]);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <div className="text-center">
          <div className="font-serif text-5xl font-semibold tabular-nums text-heading" data-testid="my-rating-score">
            {p.rating == null ? '—' : Math.round(p.rating)}
          </div>
          <div className="text-xs text-faint">из 100, за 30 дней</div>
        </div>
        <div className="min-w-0 flex-1">
          <Badge tone={band.tone}>{band.label}</Badge>
          <p className="mt-2 text-sm text-muted">{band.text}</p>
          <p className="mt-1 text-xs text-faint">
            {p.decisions != null ? `Решений за период: ${p.decisions}.` : ''}
          </p>
        </div>
      </Card>
      {p.rating != null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {PARTS.map((part) => {
            const v = p[part.key] as number | null;
            return (
              <Card key={part.key} className="p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-heading">{part.label}</span>
                  <span className="tabular-nums text-heading">{v == null ? '—' : Math.round(v)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-faint">{part.hint}</p>
              </Card>
            );
          })}
        </div>
      ) : null}
      {p.trend.length > 1 ? (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium text-heading">Последние недели</div>
          <div className="flex h-16 items-end gap-1.5" aria-label="Рейтинг по неделям">
            {p.trend.slice(-8).map((v, i) => (
              <div key={i} className="flex-1 rounded-t bg-gold/70" style={{ height: `${Math.max(6, Math.min(100, v))}%` }} title={String(Math.round(v))} />
            ))}
          </div>
        </Card>
      ) : null}
      {soft.length > 0 ? (
        <Card className="space-y-1 p-4">
          <div className="text-sm font-medium text-heading">Для вас</div>
          {soft.map((k) => (
            <p key={k} className="text-sm text-muted">
              {SOFT_SUGGESTION[k]}
            </p>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function PayCard({ q }: { q: ReturnType<typeof useMyPiecework> }) {
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  const r = q.data;
  if (!r || !r.ok) {
    return <EmptyState icon={Medal} title="Оплата за решения пока не считается" text="Здесь будет сумма за месяц и по дням, когда владелец включит сдельную оплату." />;
  }
  return <PayBody d={r.data} />;
}

export function PayBody({ d }: { d: PieceworkMine }) {
  const me = d.scope === 'self' ? d.people[0] : undefined;
  if (!me) {
    return <Card className="p-4 text-sm text-muted">Личной сдельной оплаты у вас нет: считается только у исполнителей очередей.</Card>;
  }
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <div>
          <div className="font-serif text-3xl font-semibold tabular-nums text-heading" data-testid="my-pay-total">
            {money(me.amountCents ?? 0, d.currency)}
          </div>
          <div className="text-xs text-faint">за {d.period}</div>
        </div>
        <p className="min-w-0 flex-1 text-sm text-muted">
          Принятых решений: <span className="tabular-nums text-heading">{me.units}</span>
          {me.heldUnits > 0 ? <>. Не оплачено после перепроверки: <span className="tabular-nums text-heading">{me.heldUnits}</span></> : null}.
          Сумма попадает в «Зарплаты» после ночного расчёта.
        </p>
      </Card>
      {me.days.length > 0 ? (
        <Card className="divide-y divide-line">
          {me.days.slice(-14).reverse().map((day) => (
            <div key={day.day} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-24 text-muted">{day.day}</span>
              <span className="flex-1 tabular-nums">{day.units} реш.</span>
              <span className="tabular-nums text-faint">×{day.qualityMult.toFixed(2)}</span>
              <span className="w-24 text-right tabular-nums text-heading">{money(day.amountCents, d.currency)}</span>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
