'use client';

import { ArrowClockwise, ArrowDown, ArrowUp, Pause, Play, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { ScaleSwitches } from '@/components/scale-switches';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { ApiError, api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import {
  autoscaleWord,
  buildAlarms,
  ladder,
  parseCeiling,
  poolerLine,
  searchLine,
  usageLine,
  type AlarmAction,
  type Economy,
  type Health,
  type ScaleExtras,
} from '@/lib/scale';
import { usd } from '@/lib/economy';
import { budgetPercent, budgetTone, parseLimit, type AwsBudget, type AwsBudgets } from '@/lib/launch';
import { LIGHT_TONE } from '@/lib/system-health';

type Target = 'db' | 'redis';
type Action = AlarmAction | { kind: 'decrease'; target: Target };

/**
 * Owner 2026-10-24 (batch D, item 17): every part that grows by itself, in
 * one place: how big it is now, how far it can go, the buttons that move
 * it, and the open alarms with what the system already did about them.
 * Reuses the data and the endpoints of «Экономика» and «Здоровье системы»;
 * the decisions live in lib/scale.ts.
 */
export default function ScalePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const economy = useQuery({
    queryKey: ['economy'],
    queryFn: async () => (await api.GET('/admin/economy')).data!.data as Economy,
    refetchOnWindowFocus: true,
  });
  const health = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => (await api.GET('/admin/system-health')).data!.data as Health,
    refetchInterval: livePoll(),
  });
  const extras = useQuery({
    queryKey: ['scale-extras'],
    queryFn: async () => (await api.GET('/admin/system-health/scale')).data!.data as ScaleExtras,
    refetchOnWindowFocus: true,
  });
  const budgets = useQuery({
    queryKey: ['aws-budgets'],
    queryFn: async () => (await api.GET('/admin/launch/budgets')).data!.data as AwsBudgets,
    refetchOnWindowFocus: true,
  });
  const e = economy.data;
  const h = health.data;
  const x = extras.data;

  // Owner 2026-10-24: the AWS budgets. A change needs the 2FA code (the API
  // client asks for it); a second admin only if admin.dual_control is on.
  const [limitFor, setLimitFor] = useState<AwsBudget | null>(null);
  const [limitText, setLimitText] = useState('');
  const [deleteFor, setDeleteFor] = useState<AwsBudget | null>(null);
  const newLimit = parseLimit(limitText);
  const afterBudgetChange = () => {
    void qc.invalidateQueries({ queryKey: ['aws-budgets'] });
    void qc.invalidateQueries({ queryKey: ['launch'] });
    void qc.invalidateQueries({ queryKey: ['system-health'] });
  };
  const changeLimit = useMutation({
    mutationFn: async (v: { name: string; limitUsd: number }) =>
      (await api.POST('/admin/launch/budgets/limit', { body: v })).data!.data as AwsBudgets,
    onSuccess: (r) => {
      qc.setQueryData(['aws-budgets'], r);
      setLimitFor(null);
      toast.success('Месячный потолок расходов изменён');
      afterBudgetChange();
    },
    onError: (err) => {
      toast.error(err);
      if (err instanceof ApiError && err.code === 'ADMIN_APPROVAL_PENDING') setLimitFor(null);
    },
  });
  const removeBudget = useMutation({
    mutationFn: async (name: string) =>
      (await api.POST('/admin/launch/budgets/delete', { body: { name } })).data!.data as AwsBudgets,
    onSuccess: (r) => {
      qc.setQueryData(['aws-budgets'], r);
      setDeleteFor(null);
      toast.success('Старый бюджет удалён');
      afterBudgetChange();
    },
    onError: (err) => {
      toast.error(err);
      setDeleteFor(null);
    },
  });

  const setE = (r: Economy) => qc.setQueryData(['economy'], r);
  const setH = (r: Health) => qc.setQueryData(['system-health'], r);

  const [confirm, setConfirm] = useState<Action | null>(null);
  const [stepUp, setStepUp] = useState<Action | null>(null);

  const run = useMutation({
    mutationFn: async (a: Action) => {
      switch (a.kind) {
        case 'restart':
          return { h: (await api.POST('/admin/system-health/restart-worker')).data!.data as Health };
        case 'pause':
          return { h: (await api.POST('/admin/system-health/heavy-jobs', { body: { paused: a.paused } })).data!.data as Health };
        case 'scale':
          return { h: (await api.POST('/admin/system-health/scale', { body: { mode: a.mode } })).data!.data as Health };
        case 'increase':
          return { e: (await api.POST('/admin/economy/increase', { body: { target: a.target } })).data!.data as Economy };
        case 'decrease':
          return { e: (await api.POST('/admin/economy/decrease', { body: { target: a.target } })).data!.data as Economy };
        default:
          return {};
      }
    },
    onSuccess: (r, a) => {
      if (r.h) setH(r.h);
      if (r.e) setE(r.e);
      toast.success(doneText(a));
    },
    onError: (err, a) => {
      if (err instanceof ApiError && err.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(a);
      else toast.error(err);
    },
  });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.PATCH('/admin/economy/settings', { body })).data!.data as Economy,
    onSuccess: (r) => {
      setE(r);
      toast.success('Потолок сохранён');
    },
    onError: (err) => toast.error(err),
  });

  // Ceiling drafts; reset when the server value changes.
  const [capApi, setCapApi] = useState('');
  const [capWorker, setCapWorker] = useState('');
  const s = e?.settings;
  useEffect(() => {
    if (!s) return;
    setCapApi(String(s.manualApi));
    setCapWorker(String(s.manualWorker));
  }, [s]);

  /** The button on an alarm: a plain click, or the confirm box for a resize. */
  const press = (a: AlarmAction) => {
    if (a.kind === 'ceiling') {
      document.getElementById('scale-ceilings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (a.kind === 'increase') setConfirm(a);
    else run.mutate(a);
  };

  const alarms = h ? buildAlarms(h, e) : [];
  const onAws = e?.containers.onAws ?? false;
  const dbL = e ? ladder(e.capacity.dbTiers) : null;
  const redisL = e ? ladder(e.capacity.redisTiers) : null;
  const busy = (a: Action) => run.isPending && JSON.stringify(run.variables) === JSON.stringify(a);

  const containers = e
    ? ([
        ['API (запросы людей)', e.containers.api, capApi, setCapApi, 'api'],
        ['Фоновые задачи', e.containers.worker, capWorker, setCapWorker, 'worker'],
      ] as const)
    : [];
  const apiCap = parseCeiling(capApi, e?.containers.api.hardCap ?? 1);
  const workerCap = parseCeiling(capWorker, e?.containers.worker.hardCap ?? 1);

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Масштаб"
        subtitle="Всё, что растёт само: серверы, база, Redis, пулер, поиск. Сколько сейчас, докуда может вырасти и какими кнопками это двигать. Сверху — тревоги: что случилось, что система сделала сама и что нажать."
        actions={e ? <UpdatedAgo at={economy.dataUpdatedAt} /> : null}
      />
      <ErrorNote text={economy.error ? errorText(economy.error) : health.error ? errorText(health.error) : null} />

      {!e || !h ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <SectionTitle>Тревоги</SectionTitle>
          {alarms.length === 0 ? (
            <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
              <Badge tone="success" dot>
                Тревог нет
              </Badge>
              <span className="min-w-0 flex-1 text-sm text-muted">
                Все части работают. Если что-то сломается, карточка появится здесь, а письмо придёт дежурным.
              </span>
            </Card>
          ) : (
            <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {alarms.map((a) => (
                <Card key={a.id} className="flex min-w-0 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-sm font-medium text-heading">{a.title}</div>
                    <Badge tone={a.tone} dot className="shrink-0">
                      {a.tone === 'danger' ? 'Проблема' : 'Внимание'}
                    </Badge>
                  </div>
                  {a.span ? <div className="text-xs text-muted">{a.span}</div> : null}
                  <p className="break-words text-sm text-ink">
                    <span className="font-medium">Что случилось: </span>
                    {a.what}
                  </p>
                  <div className="break-words text-sm text-ink">
                    <span className="font-medium">Что система сделала сама: </span>
                    {a.auto.length === 0 ? (
                      <span className="text-muted">пока ничего, вмешательства не требовалось</span>
                    ) : (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                        {a.auto.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {a.action ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto self-start"
                      loading={busy(a.action.action)}
                      onClick={() => press(a.action!.action)}
                    >
                      {a.action.label}
                    </Button>
                  ) : null}
                </Card>
              ))}
            </div>
          )}

          <SectionTitle>Серверы приложения</SectionTitle>
          {!onAws ? (
            <p className="mb-3 text-sm text-muted">Потолок меняется только на AWS. Здесь (на Mac) цифры справочные.</p>
          ) : null}
          <div id="scale-ceilings" className="mb-3 grid scroll-mt-4 gap-3 md:grid-cols-2">
            {containers.map(([title, c, value, setValue]) => {
              const parsed = parseCeiling(value, c.hardCap);
              return (
                <Card key={title} className="flex flex-col gap-3 p-4">
                  <div className="text-sm font-medium text-heading">{title}</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
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
                  <div className="text-xs text-muted">Один контейнер ≈ {usd(c.taskUsd)} в месяц.</div>
                  <Field
                    label="Новый потолок"
                    htmlFor={`cap-${title}`}
                    hint={parsed === null ? `Целое число от 1 до ${c.hardCap}.` : undefined}
                  >
                    <Input
                      id={`cap-${title}`}
                      inputMode="numeric"
                      value={value}
                      onChange={(ev) => setValue(ev.target.value)}
                    />
                  </Field>
                </Card>
              );
            })}
          </div>
          <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
            <Button
              disabled={!onAws || apiCap === null || workerCap === null}
              loading={save.isPending}
              onClick={() => save.mutate({ ceilingMode: 'manual', manualApi: apiCap, manualWorker: workerCap })}
            >
              Сохранить потолок
            </Button>
            <span className="min-w-0 flex-1 text-sm text-muted">
              Потолок станет ручным: {s?.ceilingMode === 'manual' ? 'он уже ручной' : 'сейчас он автоматический'}. Вернуть
              автомат и правило расходов можно в{' '}
              <Link href="/economy" className="text-gold-600 underline-offset-2 hover:underline">
                «Экономике»
              </Link>
              .
            </span>
          </Card>

          <SectionTitle>База данных и Redis</SectionTitle>
          {!e.capacity.onAws ? (
            <p className="mb-3 text-sm text-muted">Нагрузка читается, а кнопки работают только на AWS.</p>
          ) : null}
          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {(
              [
                ['База данных (PostgreSQL)', 'db', e.capacity.dbClass, dbL, x?.dbAutoscale],
                ['Redis', 'redis', e.capacity.redisClass, redisL, x?.redisAutoscale],
              ] as const
            ).map(([title, target, cls, l, mode]) => {
              const auto = autoscaleWord(mode);
              return (
                <Card key={target} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-sm font-medium text-heading">{title}</div>
                    <Badge tone={auto.tone} dot className="shrink-0">
                      {mode === 'on' ? 'Автомасштаб' : mode === 'off' ? 'Вручную' : '—'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted">
                    Размер: <span className="text-ink">{cls ?? '—'}</span>
                    {l?.position ? <span> ({l.position})</span> : null}
                    {l?.current ? <span>, ≈ {usd(l.current.monthUsd)} в месяц</span> : null}
                  </div>
                  <div className="text-sm text-muted">{auto.label}.</div>
                  {target === 'db' ? (
                    <div className="text-sm text-muted">
                      Процессор: <span className="text-ink">{pct(e.capacity.dbCpuPercent)}</span>, соединения:{' '}
                      <span className="text-ink">
                        {e.capacity.dbConnections != null ? Math.round(e.capacity.dbConnections) : '—'} из{' '}
                        {e.capacity.dbMaxConnections ?? '—'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted">
                      Память: <span className="text-ink">{pct(e.capacity.redisMemoryPercent)}</span>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!e.capacity.onAws || !l?.next}
                      loading={busy({ kind: 'increase', target })}
                      onClick={() => setConfirm({ kind: 'increase', target })}
                    >
                      <ArrowUp size={14} /> {l?.next ? `Увеличить до ${l.next.name}` : 'Больше некуда'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!e.capacity.onAws || !l?.prev}
                      loading={busy({ kind: 'decrease', target })}
                      onClick={() => setConfirm({ kind: 'decrease', target })}
                    >
                      <ArrowDown size={14} /> {l?.prev ? `Уменьшить до ${l.prev.name}` : 'Меньше некуда'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <SectionTitle>База: копия для чтения и разделение таблиц</SectionTitle>
          <ScaleSwitches />

          <SectionTitle>Пулер, поиск и внешние сервисы</SectionTitle>
          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoCard
              title="Пулер соединений (PgBouncer)"
              badge={x ? <Badge tone={poolerLine(x).tone} dot>{poolerLine(x).label}</Badge> : null}
              line={x ? poolerLine(x).line : 'Загрузка…'}
            />
            <InfoCard
              title="Поиск"
              badge={<Badge tone="neutral">{x ? searchLine(x.searchEngine) : '…'}</Badge>}
              line="Движок задаёт настройка search.engine. Переключается без выката, откат так же."
              footer={
                <Link href="/config" className="text-xs text-gold-600 underline-offset-2 hover:underline">
                  Открыть настройки и переключить поиск
                </Link>
              }
            />
            <InfoCard
              title="Звонки: трафик Cloudflare"
              badge={<Badge tone={usageLine(h.items, 'cloudflare_usage').tone} dot>{LABEL[usageLine(h.items, 'cloudflare_usage').tone]}</Badge>}
              line={usageLine(h.items, 'cloudflare_usage').line}
            />
            <InfoCard
              title="Видео: трафик и хранилище Bunny"
              badge={<Badge tone={usageLine(h.items, 'bunny_usage').tone} dot>{LABEL[usageLine(h.items, 'bunny_usage').tone]}</Badge>}
              line={usageLine(h.items, 'bunny_usage').line}
            />
            <InfoCard
              title="Разделить базу"
              badge={<Badge tone="neutral">Пока недоступно</Badge>}
              line="Разнос данных по двум базам, когда одной станет тесно. Кнопка включится, когда будут готовы проверки и откат."
              footer={
                <Button variant="outline" size="sm" disabled className="self-start">
                  Разделить базу
                </Button>
              }
              note="появится после шагов 9-10"
            />
          </div>

          <SectionTitle>Бюджеты AWS (потолок расходов в месяц)</SectionTitle>
          <div className="mb-6 grid gap-3 md:grid-cols-2" data-testid="aws-budgets">
            {budgets.data && !budgets.data.available ? (
              <Card className="p-4 text-sm text-muted md:col-span-2">Бюджеты читаются только на AWS (боевой сервер).</Card>
            ) : null}
            {(budgets.data?.items ?? []).map((b) => {
              const pct = budgetPercent(b);
              return (
                <Card key={b.name} className="flex min-w-0 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 break-words text-sm font-medium text-heading">{b.name}</div>
                    <Badge tone={b.obsolete ? 'warning' : budgetTone(pct)} dot className="shrink-0">
                      {b.obsolete ? 'Старый' : b.prod ? 'Боевой' : 'Другой'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted">Потолок</div>
                      <div className="text-lg font-semibold text-heading">{b.limitUsd != null ? usd(b.limitUsd) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Потрачено</div>
                      <div className="text-lg font-semibold text-heading">{b.actualUsd != null ? usd(b.actualUsd) : '—'}{pct !== null ? ` (${pct}%)` : ''}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Прогноз</div>
                      <div className="text-lg font-semibold text-heading">{b.forecastUsd != null ? usd(b.forecastUsd) : '—'}</div>
                    </div>
                  </div>
                  {b.prod ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto self-start"
                      onClick={() => {
                        setLimitText(String(b.limitUsd ?? ''));
                        setLimitFor(b);
                      }}
                    >
                      Изменить потолок
                    </Button>
                  ) : null}
                  {b.obsolete ? (
                    <Button variant="outline" size="sm" className="mt-auto self-start" onClick={() => setDeleteFor(b)}>
                      Удалить старый бюджет
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <SectionTitle>Кнопки на крайний случай</SectionTitle>
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">Перезапустить фоновые задачи</div>
              <p className="flex-1 text-sm text-muted">Если «Фоновые задачи» красные больше 10 минут. Текущая задача доделается.</p>
              <Button variant="outline" disabled={!h.actions.onAws} loading={busy({ kind: 'restart' })} onClick={() => run.mutate({ kind: 'restart' })}>
                <ArrowClockwise size={16} /> Перезапустить
              </Button>
            </Card>
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">{h.heavyPause ? 'Тяжёлые задачи на паузе' : 'Пауза тяжёлых задач'}</div>
              <p className="flex-1 text-sm text-muted">
                {h.heavyPause?.by === 'auto'
                  ? 'Поставлено системой: база была медленной. Снимется само.'
                  : 'Останавливает пересчёты и выгрузки, чтобы разгрузить базу. Приложение работает как обычно.'}
              </p>
              <Button
                variant="outline"
                loading={busy({ kind: 'pause', paused: !h.heavyPause })}
                onClick={() => run.mutate({ kind: 'pause', paused: !h.heavyPause })}
              >
                {h.heavyPause ? <Play size={16} /> : <Pause size={16} />} {h.heavyPause ? 'Снять паузу' : 'Поставить на паузу'}
              </Button>
            </Card>
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">{h.scaleMode?.mode === 'min' ? 'Сервер на минимуме' : 'Режим сервера: обычный'}</div>
              <p className="flex-1 text-sm text-muted">
                {h.scaleMode?.mode === 'min'
                  ? h.scaleMode.by === 'auto'
                    ? 'Включено системой: бюджет месяца исчерпан.'
                    : 'Включено вручную: сервер не растёт с нагрузкой.'
                  : '«Минимум» запрещает рост серверов, чтобы счёт не вырос.'}
              </p>
              <Button
                variant="outline"
                disabled={!h.actions.onAws}
                loading={busy({ kind: 'scale', mode: h.scaleMode?.mode === 'min' ? 'normal' : 'min' })}
                onClick={() => run.mutate({ kind: 'scale', mode: h.scaleMode?.mode === 'min' ? 'normal' : 'min' })}
              >
                {h.scaleMode?.mode === 'min' ? <TrendUp size={16} /> : <TrendDown size={16} />}{' '}
                {h.scaleMode?.mode === 'min' ? 'Обычный режим' : 'Держать минимум'}
              </Button>
            </Card>
          </div>
          <p className="mb-6 text-xs text-muted">
            Общее состояние:{' '}
            <Badge tone={LIGHT_TONE[h.overall]} dot>
              {h.overall === 'green' ? 'всё в порядке' : h.overall === 'yellow' ? 'есть на что посмотреть' : 'есть проблема'}
            </Badge>{' '}
            Подробности по каждой части — в{' '}
            <Link href="/system-health" className="text-gold-600 underline-offset-2 hover:underline">
              «Здоровье системы»
            </Link>
            .
          </p>
        </>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirmTitle(confirm)}
        description={e ? confirmText(confirm, e) : ''}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              const a = confirm;
              setConfirm(null);
              if (a) run.mutate(a);
            }}
          >
            {confirm?.kind === 'decrease' ? 'Уменьшить' : 'Увеличить'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={limitFor !== null}
        onClose={() => setLimitFor(null)}
        title="Изменить месячный потолок расходов"
        description="Это сумма, при которой AWS пришлёт письма, а сервер сам снизится до минимума. Нужен код из аутентификатора. Terraform этот потолок больше не перезаписывает."
      >
        <Field label="Новый потолок, $ в месяц" htmlFor="budget-limit" hint={newLimit === null ? 'Число от 1 до 100000.' : undefined}>
          <Input id="budget-limit" inputMode="decimal" value={limitText} onChange={(ev) => setLimitText(ev.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLimitFor(null)}>
            Отмена
          </Button>
          <Button
            variant="gold"
            disabled={newLimit === null}
            loading={changeLimit.isPending}
            onClick={() => limitFor && newLimit !== null && changeLimit.mutate({ name: limitFor.name, limitUsd: newLimit })}
          >
            Сохранить
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleteFor !== null}
        onClose={() => setDeleteFor(null)}
        title="Удалить старый бюджет?"
        description={`«${deleteFor?.name ?? ''}» с потолком ${deleteFor?.limitUsd != null ? usd(deleteFor.limitUsd) : '—'} больше не нужен: рабочий бюджет остаётся. Нужен код из аутентификатора. Отменить нельзя.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteFor(null)}>
            Отмена
          </Button>
          <Button variant="gold" loading={removeBudget.isPending} onClick={() => deleteFor && removeBudget.mutate(deleteFor.name)}>
            Удалить
          </Button>
        </div>
      </Dialog>

      <StepUpDialog
        open={stepUp !== null}
        description="Это действие меняет сервер, базу данных или Redis на AWS. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const a = stepUp;
          setStepUp(null);
          if (a) run.mutate(a);
        }}
      />
    </>
  );
}

const LABEL = { success: 'Норма', warning: 'Внимание', danger: 'Проблема', neutral: 'Нет данных' } as const;

function InfoCard({
  title,
  badge,
  line,
  footer,
  note,
}: {
  title: string;
  badge: React.ReactNode;
  line: string;
  footer?: React.ReactNode;
  note?: string;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">{title}</div>
        <span className="shrink-0">{badge}</span>
      </div>
      <p className="break-words text-sm text-muted">{line}</p>
      {footer}
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </Card>
  );
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

function doneText(a: Action): string {
  switch (a.kind) {
    case 'restart':
      return 'Фоновые задачи перезапускаются (1–2 минуты)';
    case 'pause':
      return a.paused ? 'Тяжёлые задачи на паузе' : 'Тяжёлые задачи снова работают';
    case 'scale':
      return a.mode === 'min' ? 'Сервер держится на минимуме' : 'Обычный режим: сервер снова растёт с нагрузкой';
    case 'increase':
      return a.target === 'db' ? 'База увеличивается: 1–5 минут' : 'Redis увеличивается: 1–5 минут';
    case 'decrease':
      return a.target === 'db' ? 'База уменьшается: 1–5 минут' : 'Redis уменьшается: 1–5 минут';
    default:
      return 'Готово';
  }
}

function confirmTitle(a: Action | null): string {
  if (!a || (a.kind !== 'increase' && a.kind !== 'decrease')) return '';
  const what = a.target === 'db' ? 'базу данных' : 'Redis';
  return `${a.kind === 'increase' ? 'Увеличить' : 'Уменьшить'} ${what}?`;
}

function confirmText(a: Action | null, e: Economy): string {
  if (!a || (a.kind !== 'increase' && a.kind !== 'decrease')) return '';
  const db = a.target === 'db';
  const l = ladder(db ? e.capacity.dbTiers : e.capacity.redisTiers);
  const from = l.current?.name ?? '';
  const to = (a.kind === 'increase' ? l.next : l.prev)?.name ?? '';
  const restart = db
    ? 'База переключится на запасную копию: около минуты приложение может отвечать с ошибками.'
    : 'Redis перезапустится на 1–5 минут: вход и чаты могут подвисать.';
  return a.kind === 'increase'
    ? `Размер ${from} → ${to}. ${restart} Счёт вырастет примерно на разницу цен ступеней.`
    : `Размер ${from} → ${to}. ${restart} Сервер разрешит уменьшение, только если нагрузка низкая; иначе откажет и скажет почему. Счёт уменьшится.`;
}
