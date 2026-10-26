'use client';

import { ArrowCounterClockwise, CheckCircle, Database, Play, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import {
  activeMoves,
  canRollback,
  etaWord,
  readinessChecks,
  statusWord,
  summarize,
  type Readiness,
} from '@/lib/shard-split';
import { formatDateTime } from '@/lib/utils';

/**
 * Shard-ready step 10: «Разделить базу». One card on the system-health page:
 * the plan preview (which parts move, how many rows, how long), the check
 * that the new database is ready, the live progress and the rollback button.
 * Starting needs one fresh 2FA code (the client asks by itself); no second
 * administrator (the owner forbids four-eyes).
 */
export function ShardSplitCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [toDb, setToDb] = useState('db1');
  const [planFor, setPlanFor] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ['shards-overview'],
    queryFn: async () => (await api.GET('/admin/shards/overview')).data!.data,
    refetchInterval: livePoll(),
  });
  const plan = useQuery({
    queryKey: ['shards-plan', planFor],
    enabled: planFor !== null,
    queryFn: async () =>
      (await api.GET('/admin/shards/split-plan', { params: { query: { toDb: planFor! } } })).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['shards-overview'] });
  };
  const start = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/shards/split', { body: { toDb: plan.data!.toDb, shards: plan.data!.shards } })).data!
        .data,
    onSuccess: () => {
      toast.success('Разделение запущено. Прогресс ниже.');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const rollback = useMutation({
    mutationFn: async (id: string) =>
      (await api.POST('/admin/shards/moves/{id}/rollback', { params: { path: { id } } })).data!.data,
    onSuccess: () => {
      toast.success('Откат выполнен');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const resume = useMutation({
    mutationFn: async (id: string) =>
      (await api.POST('/admin/shards/moves/{id}/resume', { params: { path: { id } } })).data!.data,
    onSuccess: () => {
      toast.success('Продолжаем с того места, где остановилось');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const o = overview.data;
  const moves = activeMoves(o?.moves ?? []);
  const sum = summarize(moves);
  const readiness = plan.data?.readiness as Readiness | undefined;
  const busy = moves.some((m) => m.status === 'running');

  return (
    <>
      <SectionTitle>Разделить базу на два сервера</SectionTitle>
      <Card className="mb-6 flex flex-col gap-4 p-4">
        <p className="text-sm text-muted">
          Сейчас вся информация лежит на одном сервере. Эта кнопка переносит половину данных на второй сервер без
          остановки приложения: запись замирает на несколько секунд при переключении каждой части. Старые данные
          хранятся 7 дней, всё можно откатить. Запускать стоит, когда сервер упирается в нагрузку (см. «Здоровье базы»
          выше).
        </p>
        {o ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            {o.distribution.map((d) => (
              <Badge key={`${String(d.database)}-${String(d.state)}`} tone="neutral">
                {String(d.database)}: {String(d.shards)} из 256 частей
                {d.state !== 'active' ? ` (${String(d.state)})` : ''}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Имя нового сервера (ключ в DATABASE_URL_SHARDS)
            <Input value={toDb} onChange={(e) => setToDb(e.target.value.trim())} className="w-48" />
          </label>
          <Button variant="outline" disabled={!toDb} loading={plan.isFetching} onClick={() => setPlanFor(toDb)}>
            <Database size={16} /> Показать план
          </Button>
        </div>

        {plan.error ? <p className="text-sm text-danger">{errorText(plan.error)}</p> : null}
        {plan.data && readiness ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line p-3">
            <div className="text-sm font-medium text-heading">Что будет сделано</div>
            <ul className="flex flex-col gap-1 text-sm">
              <li>
                Переедут {plan.data.shards.length} из 256 частей с «{plan.data.fromDb}» на «{plan.data.toDb}».
              </li>
              <li>Строк в этих частях: {plan.data.rows.toLocaleString('ru-RU')}.</li>
              <li>Время: {etaWord(plan.data.estimatedSeconds)}.</li>
            </ul>
            <div className="text-sm font-medium text-heading">Готов ли новый сервер</div>
            <ul className="flex flex-col gap-1 text-sm">
              {readinessChecks(readiness).map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2">
                  {ok ? (
                    <CheckCircle size={16} className="text-success" />
                  ) : (
                    <WarningCircle size={16} className="text-danger" />
                  )}
                  {label}
                </li>
              ))}
            </ul>
            {readiness.problems.length > 0 ? (
              <p className="break-words text-sm text-danger">{readiness.problems.join('. ')}</p>
            ) : null}
            <p className="text-xs text-muted">
              Запуск потребует свежий код 2FA.
            </p>
            <Button
              className="self-start"
              disabled={!readiness.ok || plan.data.shards.length === 0 || busy}
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              <Play size={16} /> Разделить базу
            </Button>
          </div>
        ) : null}

        {moves.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-heading">
              Ход переноса: готово {sum.finished} из {sum.total}
              {sum.failed ? `, с ошибкой ${sum.failed}` : ''} ({sum.percent} %)
            </div>
            {moves.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-line p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-heading">
                    Часть {m.logicalShard}: {m.fromDb} → {m.toDb}
                  </div>
                  <div className="text-xs text-muted">
                    {statusWord(m)}
                    {m.note ? ` · ${m.note}` : ''}
                    {m.status === 'waiting' && m.cleanupAfter ? ` · очистка ${formatDateTime(m.cleanupAfter)}` : ''}
                  </div>
                  {m.error ? <div className="break-words text-xs text-danger">{m.error}</div> : null}
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-gold-600" style={{ width: `${m.percent}%` }} />
                  </div>
                </div>
                {m.status === 'failed' ? (
                  <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate(m.id)}>
                    <Play size={14} /> Продолжить
                  </Button>
                ) : null}
                {canRollback(m) ? (
                  <Button size="sm" variant="outline" loading={rollback.isPending} onClick={() => rollback.mutate(m.id)}>
                    <ArrowCounterClockwise size={14} /> Откатить
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {o?.orphans ? (
          <p className="text-xs text-muted">
            Ночная проверка связей между серверами: найдено «осиротевших» записей —{' '}
            {String((o.orphans as { totalOrphans?: number }).totalOrphans ?? 0)}.
          </p>
        ) : null}
      </Card>
    </>
  );
}
