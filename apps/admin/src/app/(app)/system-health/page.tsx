'use client';

import { ArrowClockwise, ArrowsClockwise, Pause, Play, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { ApiError, api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import {
  LIGHT_LABEL,
  LIGHT_TONE,
  RUNBOOK_BASE,
  componentTitle,
  incidentSpan,
  word,
  type SystemHealth,
} from '@/lib/system-health';
import { formatDateTime } from '@/lib/utils';

type Action = { kind: 'restart' } | { kind: 'scale'; mode: 'min' | 'normal' } | { kind: 'reencrypt' };

/**
 * Owner 2026-10-05 «я не понимаю серверы и базы»: one screen that says
 * whether everything is fine, in plain words, with the few buttons an
 * owner may ever need. Everything else the system does by itself.
 */
export default function SystemHealthPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const health = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => (await api.GET('/admin/system-health')).data!.data,
    refetchInterval: livePoll(),
  });
  const set = (h: SystemHealth) => qc.setQueryData(['system-health'], h);

  const [stepUp, setStepUp] = useState<Action | null>(null);
  const run = useMutation({
    mutationFn: async (a: Action) =>
      a.kind === 'restart'
        ? (await api.POST('/admin/system-health/restart-worker')).data!.data
        : a.kind === 'reencrypt'
          ? // Owner 2026-10-22: the message-key re-encryption pass, from the start.
            (await api.POST('/admin/system-health/message-reencrypt/restart')).data!.data
          : (await api.POST('/admin/system-health/scale', { body: { mode: a.mode } })).data!.data,
    onSuccess: (h, a) => {
      set(h);
      toast.success(
        a.kind === 'restart'
          ? 'Фоновые задачи перезапускаются (1–2 минуты)'
          : a.kind === 'reencrypt'
            ? 'Перешифровка запущена заново: строки переписываются по 500 за раз'
            : a.mode === 'min'
            ? 'Сервер держится на минимуме: счёт не вырастет'
            : 'Обычный режим: сервер снова растёт с нагрузкой',
      );
    },
    onError: (e, a) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(a);
      else toast.error(e);
    },
  });
  const pause = useMutation({
    mutationFn: async (paused: boolean) =>
      (await api.POST('/admin/system-health/heavy-jobs', { body: { paused } })).data!.data,
    onSuccess: (h, paused) => {
      set(h);
      toast.success(paused ? 'Тяжёлые задачи на паузе' : 'Тяжёлые задачи снова работают');
    },
    onError: (e) => toast.error(e),
  });
  const settings = useMutation({
    mutationFn: async (body: { autoPauseHeavyJobs?: boolean; autoScaleDownOnBudget?: boolean }) =>
      (await api.PATCH('/admin/system-health/settings', { body })).data!.data,
    onSuccess: (h) => {
      set(h);
      toast.success('Сохранено');
    },
    onError: (e) => toast.error(e),
  });

  const h = health.data;
  const onAws = h?.actions.onAws ?? false;
  const paused = !!h?.heavyPause;
  const minMode = h?.scaleMode?.mode === 'min';

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Здоровье системы"
        subtitle="Система следит за собой сама: перезапускает упавшее, растёт и сжимается с нагрузкой, сдерживает расходы и проверяет бэкапы. Если что-то сломается, письмо придёт на почту с тем, что делать."
        actions={h ? <UpdatedAgo at={health.dataUpdatedAt} /> : null}
      />
      <ErrorNote text={health.error ? errorText(health.error) : null} />

      {!h ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Card className="mb-5 flex flex-wrap items-center gap-3 p-5">
            <Badge tone={LIGHT_TONE[h.overall]} dot className="text-sm">
              {h.overall === 'green' ? 'Всё в порядке' : h.overall === 'yellow' ? 'Есть на что посмотреть' : 'Есть проблема'}
            </Badge>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {h.overall === 'green'
                ? 'Делать ничего не нужно.'
                : 'Под каждой жёлтой или красной строкой написано, что делать. Чаще всего система уже исправляет это сама.'}
            </span>
          </Card>

          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {h.items.map((item) => {
              const w = word(item);
              return (
                <Card key={item.key} className="flex min-w-0 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-sm font-medium text-heading">{w.title}</div>
                    <Badge tone={LIGHT_TONE[item.status]} dot className="shrink-0">
                      {LIGHT_LABEL[item.status]}
                    </Badge>
                  </div>
                  <p className="break-words text-sm text-muted">{w.line}</p>
                  {w.todo ? (
                    <p className="break-words text-sm text-ink">
                      <span className="font-medium">Что делать: </span>
                      {w.todo}
                    </p>
                  ) : null}
                  {w.todo && w.runbook ? (
                    <a
                      className="text-xs text-gold-600 underline-offset-2 hover:underline"
                      href={RUNBOOK_BASE + w.runbook}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Подробная инструкция
                    </a>
                  ) : null}
                  {item.key === 'message_keys' && item.status !== 'grey' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      loading={run.isPending && run.variables?.kind === 'reencrypt'}
                      onClick={() => run.mutate({ kind: 'reencrypt' })}
                    >
                      <ArrowsClockwise size={14} /> Перешифровать заново
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <SectionTitle>Сбои за последние 24 часа</SectionTitle>
          <Card className="mb-6 divide-y divide-line">
            {(h.incidents ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted">Сбоев не было. Проверка идёт каждую минуту.</p>
            ) : (
              (h.incidents ?? []).map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <Badge tone={i.closedAt ? 'success' : 'danger'} dot className="shrink-0">
                    {i.closedAt ? 'Устранён' : 'Идёт сейчас'}
                  </Badge>
                  <span className="min-w-0 flex-1 break-words font-medium text-heading">
                    {componentTitle(i.component)}
                  </span>
                  <span className="text-xs text-muted">
                    с {formatDateTime(i.openedAt)}, {incidentSpan(i.openedAt, i.closedAt)}
                  </span>
                </div>
              ))
            )}
            <p className="p-4 text-xs text-muted">
              Дежурные (право «Дежурный» и включённый переключатель в Профиле) получают пуш и письмо при сбое,
              напоминание каждые 15 минут, пока сбой идёт, и сообщение, когда всё починилось.
            </p>
          </Card>

          <SectionTitle>Кнопки на крайний случай</SectionTitle>
          {!onAws ? (
            <p className="mb-3 text-sm text-muted">
              Перезапуск и режимы сервера работают только на AWS. Здесь (на Mac) они выключены.
            </p>
          ) : null}
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">Перезапустить фоновые задачи</div>
              <p className="flex-1 text-sm text-muted">
                Если «Фоновые задачи» красные больше 10 минут. Ничего не теряется: текущая задача доделается.
              </p>
              <Button
                variant="outline"
                disabled={!onAws}
                loading={run.isPending && run.variables?.kind === 'restart'}
                onClick={() => run.mutate({ kind: 'restart' })}
              >
                <ArrowClockwise size={16} /> Перезапустить
              </Button>
            </Card>
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">
                {paused ? 'Тяжёлые задачи на паузе' : 'Пауза тяжёлых задач'}
              </div>
              <p className="flex-1 text-sm text-muted">
                {paused
                  ? h.heavyPause?.by === 'auto'
                    ? 'Поставлено системой само: база была медленной. Снимется само через 15 минут после того, как база придёт в норму.'
                    : 'Поставлено вручную. Пересчёт рекомендаций и рейтингов и выгрузки ждут.'
                  : 'Временно останавливает пересчёт рекомендаций, рейтингов и выгрузки файлов, чтобы разгрузить базу. Приложение работает как обычно.'}
              </p>
              <Button variant="outline" loading={pause.isPending} onClick={() => pause.mutate(!paused)}>
                {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'Снять паузу' : 'Поставить на паузу'}
              </Button>
            </Card>
            <Card className="flex flex-col gap-3 p-4">
              <div className="text-sm font-medium text-heading">
                {minMode ? 'Сервер на минимуме' : 'Режим сервера: обычный'}
              </div>
              <p className="flex-1 text-sm text-muted">
                {minMode
                  ? h.scaleMode?.by === 'auto'
                    ? 'Включено системой: бюджет месяца исчерпан. В новом месяце вернётся само.'
                    : 'Включено вручную. Сервер не растёт с нагрузкой — при наплыве людей приложение может замедлиться.'
                  : 'Сервер сам добавляет мощность при наплыве людей и убирает её ночью. «Минимум» запрещает рост, чтобы счёт не вырос.'}
              </p>
              <Button
                variant="outline"
                disabled={!onAws}
                loading={run.isPending && run.variables?.kind === 'scale'}
                onClick={() => run.mutate({ kind: 'scale', mode: minMode ? 'normal' : 'min' })}
              >
                {minMode ? <TrendUp size={16} /> : <TrendDown size={16} />} {minMode ? 'Обычный режим' : 'Держать минимум'}
              </Button>
            </Card>
          </div>

          <SectionTitle>Что система делает сама</SectionTitle>
          <Card className="divide-y divide-line">
            <div className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-heading">Пауза тяжёлых задач, когда база медленная</div>
                <div className="mt-0.5 text-xs text-muted">
                  База отвечает дольше {h.settings.dbSlowMs} мс — пересчёты ждут 15 минут, потом продолжаются сами.
                </div>
              </div>
              <Switch
                label="Пауза тяжёлых задач, когда база медленная"
                checked={h.settings.autoPauseHeavyJobs}
                disabled={settings.isPending}
                onChange={(v) => settings.mutate({ autoPauseHeavyJobs: v })}
              />
            </div>
            <div className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-heading">Минимум сервера, когда бюджет AWS исчерпан</div>
                <div className="mt-0.5 text-xs text-muted">
                  Счёт за месяц не уйдёт сильно выше бюджета. Приложение продолжает работать, просто не растёт.
                </div>
              </div>
              <Switch
                label="Минимум сервера, когда бюджет AWS исчерпан"
                checked={h.settings.autoScaleDownOnBudget}
                disabled={settings.isPending}
                onChange={(v) => settings.mutate({ autoScaleDownOnBudget: v })}
              />
            </div>
            <div className="p-4 text-xs text-muted">
              Всегда включено: перезапуск упавших серверов и фоновых задач, откат неудачного обновления, рост и
              сжатие с нагрузкой, ежедневная проверка бэкапов и тревог, письма на почту при проблемах.
            </div>
          </Card>
        </>
      )}

      <StepUpDialog
        open={stepUp !== null}
        description={
          stepUp?.kind === 'reencrypt'
            ? 'Перешифровка переписывает все сообщения новым ключом. Подтвердите, что это вы.'
            : 'Это действие меняет сервер на AWS. Подтвердите, что это вы.'
        }
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
