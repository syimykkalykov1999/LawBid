'use client';

import { ArrowUp } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { ApiError, api, errorText } from '@/lib/api/client';
import { economyLine, usd, type Economy } from '@/lib/economy';
import { formatDateTime } from '@/lib/utils';

type Target = 'db' | 'redis';

/**
 * Owner 2026-10-16 «чтобы мы не уходили в минус, платя только сторонним
 * системам»: revenue against what third-party services cost, the rule
 * (X % of 30-day revenue, not below $Y), the container ceiling (automatic
 * or a number) and the database / Redis tiers with a one-click raise.
 */
export default function EconomyPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['economy'],
    queryFn: async () => (await api.GET('/admin/economy')).data!.data as Economy,
    // Owner 2026-10-23 (admin economy pass): no timer — revalidated when
    // the admin comes back to the tab (stale-while-revalidate).
    refetchOnWindowFocus: true,
  });
  const set = (r: Economy) => qc.setQueryData(['economy'], r);
  const e = q.data;

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.PATCH('/admin/economy/settings', { body })).data!.data as Economy,
    onSuccess: (r) => {
      set(r);
      toast.success('Сохранено');
    },
    onError: (err) => toast.error(err),
  });

  const [confirm, setConfirm] = useState<Target | null>(null);
  const [stepUp, setStepUp] = useState<Target | null>(null);
  const raise = useMutation({
    mutationFn: async (target: Target) =>
      (await api.POST('/admin/economy/increase', { body: { target } })).data!.data as Economy,
    onSuccess: (r, target) => {
      set(r);
      toast.success(target === 'db' ? 'База увеличивается: 1–5 минут' : 'Redis увеличивается: 1–5 минут');
    },
    onError: (err, target) => {
      if (err instanceof ApiError && err.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(target);
      else toast.error(err);
    },
  });

  // Drafts of the editable fields; reset when the server value changes.
  const [percent, setPercent] = useState('');
  const [threshold, setThreshold] = useState('');
  const [manualApi, setManualApi] = useState('');
  const [manualWorker, setManualWorker] = useState('');
  const [prices, setPrices] = useState({ sms: '', video: '', translate: '', aws: '' });
  const s = e?.settings;
  useEffect(() => {
    if (!s) return;
    setPercent(String(s.percent));
    setThreshold(String(s.thresholdUsd));
    setManualApi(String(s.manualApi));
    setManualWorker(String(s.manualWorker));
    setPrices({
      sms: String(s.smsUnitUsd),
      video: String(s.videoUnitUsd),
      translate: String(s.translateUnitUsd),
      aws: String(s.awsFallbackUsd),
    });
  }, [s]);

  const limited = e?.guard === 'limited';
  const used = e && e.figures.allowedUsd > 0 ? e.figures.projectedUsd / e.figures.allowedUsd : 0;

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Экономика"
        subtitle="Сколько приложение зарабатывает и сколько уходит сторонним сервисам. Если расходы превышают правило, система сама включает ограничения, а когда всё в норме, снимает их. Потолок серверов растёт с доходом без правок кода."
        actions={e ? <UpdatedAgo at={q.dataUpdatedAt} /> : null}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      {!e ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Card className="mb-5 flex flex-wrap items-center gap-3 p-5">
            <Badge tone={!e.enabled ? 'neutral' : limited ? 'danger' : 'success'} dot className="text-sm">
              {!e.enabled ? 'Автоматика выключена' : limited ? 'Ограничения включены' : 'Расходы в норме'}
            </Badge>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {!e.enabled
                ? 'Ничего не ограничивается. Включите переключатель ниже, чтобы система следила за расходами.'
                : limited
                  ? `С ${formatDateTime(e.since)}: лимиты сервисов на минимуме, новые видео на паузе, SMS только для входа и сброса пароля, контейнеры на минимуме. Снимется само, когда прогноз расходов упадёт ниже 90% допустимого.`
                  : 'Прогноз расходов на сторонние сервисы укладывается в правило. Делать ничего не нужно.'}
            </span>
          </Card>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted">Доход за 30 дней</div>
              <div className="mt-1 text-2xl font-semibold text-heading">{usd(e.figures.revenue30dUsd)}</div>
              <div className="mt-1 text-xs text-muted">Этот месяц: {usd(e.figures.revenueMonthUsd)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted">Сторонним сервисам, прогноз за месяц</div>
              <div className="mt-1 text-2xl font-semibold text-heading">{usd(e.figures.projectedUsd)}</div>
              <div className="mt-1 text-xs text-muted">Уже потрачено: {usd(e.figures.monthToDateUsd)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted">Допустимо по правилу</div>
              <div className="mt-1 text-2xl font-semibold text-heading">{usd(e.figures.allowedUsd)}</div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuenow={Math.round(used * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогноз расходов от допустимого"
              >
                <div
                  className={`h-full rounded-full ${used > 1 ? 'bg-danger' : used > 0.9 ? 'bg-warning' : 'bg-success'}`}
                  style={{ width: `${Math.min(100, Math.round(used * 100))}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted">Прогноз — {Math.round(used * 100)}% от допустимого</div>
            </Card>
          </div>

          <SectionTitle>На что уходят деньги</SectionTitle>
          <Card className="mb-6 overflow-x-auto">
            <table className="sticky-first w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="p-3 font-medium">Сервис</th>
                  <th className="p-3 font-medium">Уже за месяц</th>
                  <th className="p-3 font-medium">Прогноз на месяц</th>
                  <th className="p-3 font-medium">Откуда цифра</th>
                </tr>
              </thead>
              <tbody>
                {e.figures.lines.map((l) => {
                  const w = economyLine(l.key);
                  return (
                    <tr key={l.key} className="border-b border-line last:border-0">
                      <td className="p-3">
                        <div className="font-medium text-heading">{w.title}</div>
                        <div className="text-xs text-muted">{w.hint}</div>
                      </td>
                      <td className="p-3">{usd(l.monthToDateUsd)}</td>
                      <td className="p-3">{usd(l.projectedUsd)}</td>
                      <td className="p-3">
                        <Badge tone={l.source === 'actual' ? 'success' : 'neutral'}>
                          {l.source === 'actual' ? 'факт из AWS' : 'оценка'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <SectionTitle>Правило</SectionTitle>
          <Card className="mb-6 space-y-4 p-4">
            <p className="text-sm text-muted">
              Сторонние сервисы могут стоить не больше X% дохода за последние 30 дней, но не меньше порога: пока доход
              маленький, остаётся на что жить.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Доля дохода, %" htmlFor="eco-percent" hint="От 1 до 100. Обычно 50.">
                <Input id="eco-percent" inputMode="numeric" value={percent} onChange={(ev) => setPercent(ev.target.value)} />
              </Field>
              <Field label="Порог, $ в месяц" htmlFor="eco-threshold" hint="Не меньше этой суммы. Обычно 350.">
                <Input id="eco-threshold" inputMode="decimal" value={threshold} onChange={(ev) => setThreshold(ev.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button
                  loading={save.isPending}
                  onClick={() => save.mutate({ percent: Number(percent), thresholdUsd: Number(threshold) })}
                >
                  Сохранить правило
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-4 border-t border-line pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-heading">Автоматика экономики</div>
                <div className="mt-0.5 text-xs text-muted">
                  Выключите, чтобы откатить всё: ограничения снимутся, система перестанет менять лимиты и потолок.
                </div>
              </div>
              <Switch
                label="Автоматика экономики"
                checked={e.enabled}
                disabled={save.isPending}
                onChange={(v) => save.mutate({ guardEnabled: v })}
              />
            </div>
          </Card>

          <SectionTitle>Контейнеры и потолок</SectionTitle>
          {!e.containers.onAws ? (
            <p className="mb-3 text-sm text-muted">
              Потолок меняется только на AWS. Здесь (на Mac) цифры справочные.
            </p>
          ) : null}
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            {(
              [
                ['API (запросы людей)', e.containers.api],
                ['Фоновые задачи', e.containers.worker],
              ] as const
            ).map(([title, c]) => (
              <Card key={title} className="p-4">
                <div className="text-sm font-medium text-heading">{title}</div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted">Работает</div>
                    <div className="text-lg font-semibold text-heading">{c.running ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Потолок сейчас</div>
                    <div className="text-lg font-semibold text-heading">{c.ceiling ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Предел Terraform</div>
                    <div className="text-lg font-semibold text-heading">{c.hardCap}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted">Один контейнер ≈ {usd(c.taskUsd)} в месяц.</div>
              </Card>
            ))}
          </div>
          <Card className="mb-6 space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={s?.ceilingMode === 'auto' ? 'gold' : 'outline'}
                loading={save.isPending && save.variables?.ceilingMode === 'auto'}
                onClick={() => save.mutate({ ceilingMode: 'auto' })}
              >
                Потолок: автомат
              </Button>
              <Button
                variant={s?.ceilingMode === 'manual' ? 'gold' : 'outline'}
                loading={save.isPending && save.variables?.ceilingMode === 'manual'}
                onClick={() => save.mutate({ ceilingMode: 'manual' })}
              >
                Потолок: вручную
              </Button>
            </div>
            <p className="text-sm text-muted">
              {s?.ceilingMode === 'auto'
                ? 'Автомат: потолок растёт, когда доход позволяет, и снижается до минимума, если расходы превысили правило. Растёт не быстрее 5 контейнеров за 5 минут.'
                : 'Вручную: потолок равен вашим числам, но не выше предела Terraform. Ограничения экономики всё равно могут опустить его до минимума.'}
            </p>
            {s?.ceilingMode === 'manual' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Максимум API" htmlFor="eco-api">
                  <Input id="eco-api" inputMode="numeric" value={manualApi} onChange={(ev) => setManualApi(ev.target.value)} />
                </Field>
                <Field label="Максимум фоновых" htmlFor="eco-worker">
                  <Input id="eco-worker" inputMode="numeric" value={manualWorker} onChange={(ev) => setManualWorker(ev.target.value)} />
                </Field>
                <div className="flex items-end">
                  <Button
                    loading={save.isPending}
                    onClick={() => save.mutate({ manualApi: Number(manualApi), manualWorker: Number(manualWorker) })}
                  >
                    Сохранить числа
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted">
              Предел Terraform — потолок, выше которого сервер не поднимется никогда. Его выше 50 (API) и 20 (фон) без
              правки инфраструктуры не поднять; перед этим нужна квота Fargate vCPU в AWS.
            </p>
          </Card>

          <SectionTitle>База данных и Redis</SectionTitle>
          {!e.capacity.onAws ? (
            <p className="mb-3 text-sm text-muted">
              Нагрузка базы и Redis читается, а кнопки работают только на AWS.
            </p>
          ) : null}
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <Card className="flex flex-col gap-2 p-4">
              <div className="text-sm font-medium text-heading">База данных (PostgreSQL)</div>
              <div className="text-sm text-muted">
                Размер: <span className="text-ink">{e.capacity.dbClass ?? '—'}</span>
              </div>
              <div className="text-sm text-muted">
                Процессор: <span className="text-ink">{pct(e.capacity.dbCpuPercent)}</span> (тревога выше 70%)
              </div>
              <div className="text-sm text-muted">
                Соединения:{' '}
                <span className="text-ink">
                  {e.capacity.dbConnections != null ? Math.round(e.capacity.dbConnections) : '—'} из{' '}
                  {e.capacity.dbMaxConnections ?? '—'}
                </span>{' '}
                (тревога выше 80%)
              </div>
              <Button
                className="mt-auto self-start"
                variant="outline"
                disabled={!e.capacity.onAws || !e.capacity.dbNext}
                loading={raise.isPending && raise.variables === 'db'}
                onClick={() => setConfirm('db')}
              >
                <ArrowUp size={16} /> {e.capacity.dbNext ? `Увеличить до ${e.capacity.dbNext}` : 'Больше некуда'}
              </Button>
            </Card>
            <Card className="flex flex-col gap-2 p-4">
              <div className="text-sm font-medium text-heading">Redis</div>
              <div className="text-sm text-muted">
                Размер: <span className="text-ink">{e.capacity.redisClass ?? '—'}</span>
              </div>
              <div className="text-sm text-muted">
                Память: <span className="text-ink">{pct(e.capacity.redisMemoryPercent)}</span> (тревога выше 75%)
              </div>
              <Button
                className="mt-auto self-start"
                variant="outline"
                disabled={!e.capacity.onAws || !e.capacity.redisNext}
                loading={raise.isPending && raise.variables === 'redis'}
                onClick={() => setConfirm('redis')}
              >
                <ArrowUp size={16} /> {e.capacity.redisNext ? `Увеличить до ${e.capacity.redisNext}` : 'Больше некуда'}
              </Button>
            </Card>
          </div>
          <Card className="mb-6 overflow-x-auto">
            <table className="sticky-first w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="p-3 font-medium">Ступень</th>
                  <th className="p-3 font-medium">Память</th>
                  <th className="p-3 font-medium">≈ в месяц</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...e.capacity.dbTiers.map((t) => ({ ...t, kind: 'База' })),
                  ...e.capacity.redisTiers.map((t) => ({ ...t, kind: 'Redis' })),
                ].map((t) => (
                  <tr key={t.name} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <span className="text-xs text-muted">{t.kind}</span> {t.name}{' '}
                      {t.current ? <Badge tone="gold">сейчас</Badge> : null}
                    </td>
                    <td className="p-3">{t.memoryGb} ГБ</td>
                    <td className="p-3">{usd(t.monthUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <SectionTitle>Что было</SectionTitle>
          <Card className="mb-6 divide-y divide-line">
            {e.events.length === 0 ? (
              <div className="p-4 text-sm text-muted">Пока ничего: ограничения не включались, тревог не было.</div>
            ) : (
              e.events.map((ev, i) => (
                <div key={`${ev.at}-${i}`} className="p-4">
                  <div className="text-xs text-muted">{formatDateTime(ev.at)}</div>
                  <div className="mt-0.5 break-words text-sm text-ink">{ev.text}</div>
                </div>
              ))
            )}
          </Card>

          <SectionTitle>Цены для оценки расходов</SectionTitle>
          <Card className="mb-6 space-y-3 p-4">
            <p className="text-sm text-muted">
              Сколько стоит одна единица у поставщика. Поставщики меняют цены, поэтому поля можно править. AWS читается
              из бюджета; запасная сумма нужна, если прочитать его нельзя.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="SMS, $ за штуку" htmlFor="eco-sms">
                <Input id="eco-sms" inputMode="decimal" value={prices.sms} onChange={(ev) => setPrices({ ...prices, sms: ev.target.value })} />
              </Field>
              <Field label="Загрузка видео, $" htmlFor="eco-video">
                <Input id="eco-video" inputMode="decimal" value={prices.video} onChange={(ev) => setPrices({ ...prices, video: ev.target.value })} />
              </Field>
              <Field label="Перевод, $ за штуку" htmlFor="eco-translate">
                <Input id="eco-translate" inputMode="decimal" value={prices.translate} onChange={(ev) => setPrices({ ...prices, translate: ev.target.value })} />
              </Field>
              <Field label="AWS запасная сумма, $/мес" htmlFor="eco-aws">
                <Input id="eco-aws" inputMode="decimal" value={prices.aws} onChange={(ev) => setPrices({ ...prices, aws: ev.target.value })} />
              </Field>
            </div>
            <Button
              variant="outline"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  smsUnitUsd: Number(prices.sms),
                  videoUnitUsd: Number(prices.video),
                  translateUnitUsd: Number(prices.translate),
                  awsFallbackUsd: Number(prices.aws),
                })
              }
            >
              Сохранить цены
            </Button>
          </Card>
        </>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'db' ? 'Увеличить базу данных?' : 'Увеличить Redis?'}
        description={
          confirm === 'db'
            ? `Размер ${e?.capacity.dbClass ?? ''} → ${e?.capacity.dbNext ?? ''}. База перезапустится на 1–5 минут: приложение в это время может отвечать с ошибками. Счёт вырастет примерно на разницу цен ступеней. Вернуть обратно можно только вручную.`
            : `Размер ${e?.capacity.redisClass ?? ''} → ${e?.capacity.redisNext ?? ''}. Redis перезапустится на 1–5 минут: вход и чаты могут подвисать. Счёт вырастет примерно на разницу цен ступеней.`
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              const t = confirm;
              setConfirm(null);
              if (t) raise.mutate(t);
            }}
          >
            Увеличить
          </Button>
        </div>
      </Dialog>

      <StepUpDialog
        open={stepUp !== null}
        description="Это действие меняет базу данных или Redis на AWS. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const t = stepUp;
          setStepUp(null);
          if (t) raise.mutate(t);
        }}
      />
    </>
  );
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}
