'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';
import {
  asReport,
  formatMetric,
  statusLabel,
  verdictLabel,
  type Experiment,
} from '@/lib/experiments';

type Pending =
  | { kind: 'start'; id: string; percent: number }
  | { kind: 'traffic'; id: string; percent: number }
  | { kind: 'stop'; id: string; reason?: string };

/**
 * Owner 2026-10-25: «Эксперименты». Create a test, start it on 5-10% of
 * people, read the result in plain words, raise the share or stop it (stop =
 * everyone goes back to how it was within seconds). Start / raise / stop ask
 * for a fresh 2FA code; there is no second admin.
 */
export default function ExperimentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [stepUp, setStepUp] = useState<Pending | null>(null);
  const q = useQuery({
    queryKey: ['experiments'],
    queryFn: async () => (await api.GET('/admin/experiments')).data!.data as Experiment[],
  });

  const act = useMutation({
    mutationFn: async (p: Pending) => {
      const path = { id: p.id };
      if (p.kind === 'start') {
        return (await api.POST('/admin/experiments/{id}/start', { params: { path }, body: { trafficPercent: p.percent } })).data;
      }
      if (p.kind === 'traffic') {
        return (await api.POST('/admin/experiments/{id}/traffic', { params: { path }, body: { trafficPercent: p.percent } })).data;
      }
      return (await api.POST('/admin/experiments/{id}/stop', { params: { path }, body: { reason: p.reason } })).data;
    },
    onSuccess: (_d, p) => {
      toast.success(p.kind === 'start' ? 'Тест запущен' : p.kind === 'traffic' ? 'Доля увеличена' : 'Тест остановлен, всё как раньше');
      void qc.invalidateQueries({ queryKey: ['experiments'] });
    },
    onError: (e, p) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(p);
      else toast.error(e);
    },
  });

  const refresh = useMutation({
    mutationFn: async (id: string) => (await api.POST('/admin/experiments/{id}/refresh', { params: { path: { id } } })).data,
    onSuccess: () => {
      toast.success('Отчёт обновлён');
      void qc.invalidateQueries({ queryKey: ['experiments'] });
    },
    onError: (e) => toast.error(e),
  });

  const list = q.data ?? [];
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Эксперименты"
        subtitle="Проверка новой формулы на небольшой части людей до того, как включать её всем. Тест начинается с 5-10% людей. Отчёт считается каждую ночь; если растут жалобы или ошибки, тест останавливается сам. «Остановить» возвращает всем прежнюю работу за несколько секунд."
        actions={<Button onClick={() => setCreating(true)}>Новый тест</Button>}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
      ) : list.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          Тестов пока нет. Нажмите «Новый тест». Пока тест не запущен, у людей ничего не меняется.
        </Card>
      ) : (
        <div className="grid gap-4">
          {list.map((e) => (
            <ExperimentCard
              key={e.id}
              e={e}
              busy={act.isPending || refresh.isPending}
              onAct={(p) => act.mutate(p)}
              onRefresh={() => refresh.mutate(e.id)}
            />
          ))}
        </div>
      )}
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void qc.invalidateQueries({ queryKey: ['experiments'] });
        }}
      />
      <StepUpDialog
        open={stepUp !== null}
        description="Запуск, увеличение доли и остановка теста требуют свежий код из приложения-аутентификатора."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const p = stepUp;
          setStepUp(null);
          if (p) act.mutate(p);
        }}
      />
    </>
  );
}

function ExperimentCard({
  e,
  busy,
  onAct,
  onRefresh,
}: {
  e: Experiment;
  busy: boolean;
  onAct: (p: Pending) => void;
  onRefresh: () => void;
}) {
  const [percent, setPercent] = useState(e.status === 'draft' ? 5 : Math.min(100, e.trafficPercent * 2 || 25));
  const report = e.latest ? asReport(e.latest.report) : null;
  const tone = e.status === 'running' ? 'success' : e.status === 'stopped' ? 'neutral' : 'gold';
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-heading">{e.name}</h3>
            <Badge tone={tone} dot={e.status === 'running'}>
              {statusLabel(e.status)}
              {e.status === 'running' ? `, ${e.trafficPercent}% людей` : ''}
            </Badge>
            {e.latest?.srmFlag ? <Badge tone="danger">деление людей сломано</Badge> : null}
            {e.stoppedBySystem ? <Badge tone="warning">остановлен защитой</Badge> : null}
          </div>
          <p className="mt-1 break-words text-xs text-faint">
            ключ <code>{e.key}</code> · где: {e.surface} · варианты: {e.variants.map((v) => `${v.key} ${v.weight}%`).join(', ')}
          </p>
          {e.hypothesis ? <p className="mt-1.5 text-sm text-muted">{e.hypothesis}</p> : null}
          {e.stopReason ? <p className="mt-1.5 text-sm text-muted">Причина остановки: {e.stopReason}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {e.status === 'draft' ? (
            <>
              <Input
                aria-label="Доля людей, %"
                type="number"
                min={1}
                max={100}
                className="w-24"
                value={percent}
                onChange={(ev) => setPercent(Number(ev.target.value))}
              />
              <Button
                variant="gold"
                disabled={busy || !(percent >= 1)}
                onClick={() => onAct({ kind: 'start', id: e.id, percent })}
              >
                Запустить на {percent}%
              </Button>
            </>
          ) : null}
          {e.status === 'running' ? (
            <>
              <Input
                aria-label="Новая доля людей, %"
                type="number"
                min={e.trafficPercent + 1}
                max={100}
                className="w-24"
                value={percent}
                onChange={(ev) => setPercent(Number(ev.target.value))}
              />
              <Button
                variant="outline"
                disabled={busy || percent <= e.trafficPercent || percent > 100}
                onClick={() => {
                  if (window.confirm(`Показывать тест ${percent}% людей?`)) onAct({ kind: 'traffic', id: e.id, percent });
                }}
              >
                Увеличить долю
              </Button>
              <Button
                variant="danger-soft"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Остановить тест? Все вернутся к прежней работе.')) {
                    onAct({ kind: 'stop', id: e.id });
                  }
                }}
              >
                Остановить
              </Button>
            </>
          ) : null}
          {e.status !== 'draft' ? (
            <Button variant="ghost" disabled={busy} onClick={onRefresh}>
              Обновить отчёт
            </Button>
          ) : null}
        </div>
      </div>

      {e.status !== 'draft' ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="text-xs text-faint">
            Людей попало в тест: {e.exposed}
            {e.latest ? ` · отчёт от ${formatDateTime(e.latest.computedAt)}` : ' · отчёта ещё нет, он появится ночью или по кнопке'}
          </div>
          {e.latest ? (
            <ul className="mt-2 space-y-1.5 text-sm text-ink">
              {e.latest.summary.map((line, i) => (
                <li key={i} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {report && report.metrics.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-faint">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Показатель</th>
                    {e.variants.map((v) => (
                      <th key={v.key} className="py-1 pr-3 font-medium">
                        {v.key}
                      </th>
                    ))}
                    <th className="py-1 font-medium">Вывод</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.key} className="border-t border-line align-top">
                      <td className="py-1.5 pr-3 text-muted">{m.label}</td>
                      {e.variants.map((v) => {
                        const val = m.variants[v.key];
                        return (
                          <td key={v.key} className="py-1.5 pr-3 whitespace-nowrap">
                            {val ? formatMetric(m.unit, val) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-1.5">
                        {Object.entries(m.vsControl).map(([k, d]) => (
                          <div key={k}>
                            {k}: {verdictLabel(d.verdict)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-faint">
                В скобках — диапазон, в котором число с вероятностью 95% лежит на самом деле. «Мало данных» — меньше 100 людей или дел в варианте.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [surface, setSurface] = useState('case_feed');
  const [hypothesis, setHypothesis] = useState('');
  const [newWeight, setNewWeight] = useState(50);
  const [variantKey, setVariantKey] = useState('new_formula');
  const [reportsPct, setReportsPct] = useState(25);
  const [errorsPct, setErrorsPct] = useState(25);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/experiments', {
          body: {
            key,
            name,
            surface,
            hypothesis: hypothesis || undefined,
            variants: [
              { key: 'control', weight: 100 - newWeight },
              { key: variantKey, weight: newWeight },
            ],
            guardrails: { reportsRelIncreasePct: reportsPct, errorsRelIncreasePct: errorsPct },
          },
        })
      ).data,
    onSuccess: () => {
      toast.success('Тест создан. Пока он не запущен, у людей ничего не меняется.');
      onCreated();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Новый тест" description="Два варианта: «control» (как сейчас) и новый. Запуск — отдельным шагом, начиная с 5-10% людей.">
      <div className="grid gap-3">
        <div>
          <Label>Название</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая формула ленты дел" />
        </div>
        <div>
          <Label>Ключ (латиница, его указывает разработчик в коде)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="case_feed_v2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Где (раздел)</Label>
            <Input value={surface} onChange={(e) => setSurface(e.target.value.toLowerCase())} />
          </div>
          <div>
            <Label>Имя нового варианта</Label>
            <Input value={variantKey} onChange={(e) => setVariantKey(e.target.value.toLowerCase())} />
          </div>
        </div>
        <div>
          <Label>Доля нового варианта среди попавших в тест, %</Label>
          <Input type="number" min={1} max={99} value={newWeight} onChange={(e) => setNewWeight(Number(e.target.value))} />
        </div>
        <div>
          <Label>Что хотим проверить (по желанию)</Label>
          <Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} maxLength={500} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Остановить, если жалоб больше на, %</Label>
            <Input type="number" min={1} max={500} value={reportsPct} onChange={(e) => setReportsPct(Number(e.target.value))} />
          </div>
          <div>
            <Label>Остановить, если ошибок больше на, %</Label>
            <Input type="number" min={1} max={500} value={errorsPct} onChange={(e) => setErrorsPct(Number(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={create.isPending} disabled={!key || !name || !variantKey} onClick={() => create.mutate()}>
            Создать
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
