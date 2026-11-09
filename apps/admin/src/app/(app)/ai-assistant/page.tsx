'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import { taskLine } from '@/lib/ai-assistant';
import { formatDateTime } from '@/lib/utils';

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * 09.11.2026: «Задача для ИИ». The owner writes a task; it becomes a GitHub
 * issue the AI assistant workflow picks up; its PR and the cost of each run
 * come back here. Nothing is merged by the assistant.
 */
export default function AiAssistantPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const page = useQuery({
    queryKey: ['ai-assistant'],
    queryFn: async () => (await api.GET('/admin/ai-assistant')).data!.data,
  });
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [stepUp, setStepUp] = useState(false);

  const create = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/ai-assistant/tasks', { body: { title, details } })).data!.data,
    onSuccess: (d) => {
      setTitle('');
      setDetails('');
      void qc.invalidateQueries({ queryKey: ['ai-assistant'] });
      toast.success(`Задача #${d.number} создана`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(true);
      else toast.error(e);
    },
  });

  const d = page.data;
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Задача для ИИ"
        subtitle="Напишите, что починить. ИИ-помощник сделает исправление и тесты и откроет PR; влить его решаете вы. Деньги, ключи, облако, магазины и данные на проде ему запрещены."
      />
      <ErrorNote text={page.error ? errorText(page.error) : null} />
      {!d ? (
        <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          {!d.allowed ? (
            <Card className="mb-5 p-4 text-sm text-muted">
              {d.reason ?? 'Не подключено.'} Шаги подключения: docs/runbooks/AI_ASSISTANT.md.
            </Card>
          ) : null}
          <Card className="mb-6 flex flex-wrap items-center gap-3 p-4 text-sm">
            <Badge tone={d.mode === 'on' ? 'success' : 'neutral'} dot>
              {d.mode === 'on' ? 'Включён' : 'Выключен'}
            </Badge>
            <Badge tone={d.connected ? 'success' : 'danger'} dot>
              {d.connected ? 'GitHub подключён' : 'GitHub не подключён'}
            </Badge>
            <span className="text-muted">
              Расход за месяц: {usd(d.monthUsd)} из {usd(d.maxUsd)} (Настройки → ai.monthly_max_usd)
            </span>
          </Card>

          <SectionTitle>Новая задача</SectionTitle>
          <Card className="mb-6 grid gap-3 p-4">
            <Field label="Коротко: что не так" htmlFor="ai-title">
              <Input id="ai-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Подробно: где, как повторить, что должно быть" htmlFor="ai-details">
              <Textarea id="ai-details" maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            <p className="text-xs text-muted">
              Репозиторий открытый: не пишите имена, телефоны, почту и тексты людей.
            </p>
            <div>
              <Button
                loading={create.isPending}
                disabled={!d.connected || d.mode !== 'on' || title.trim().length < 5 || details.trim().length < 10}
                onClick={() => create.mutate()}
              >
                Отдать ИИ
              </Button>
            </div>
          </Card>

          <SectionTitle>Задачи</SectionTitle>
          <Card className="mb-6 divide-y divide-line">
            {d.tasksError ? <p className="p-4 text-sm text-danger">{d.tasksError}</p> : null}
            {d.tasks.length === 0 ? (
              <p className="p-4 text-sm text-muted">Пока задач нет.</p>
            ) : (
              d.tasks.map((t) => {
                const line = taskLine(t);
                return (
                  <div key={t.number} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <Badge tone={line.tone} dot className="shrink-0">
                      {line.text}
                    </Badge>
                    <span className="min-w-0 flex-1 break-words">
                      <a href={t.url} target="_blank" rel="noreferrer" className="font-medium text-heading hover:underline">
                        #{t.number} {t.title}
                      </a>
                      <span className="text-muted"> · {formatDateTime(t.createdAt)}</span>
                    </span>
                    {t.pulls.map((p) => (
                      <a key={p.number} href={p.url} target="_blank" rel="noreferrer" className="text-gold-600 underline-offset-2 hover:underline">
                        PR #{p.number}
                      </a>
                    ))}
                  </div>
                );
              })
            )}
          </Card>

          <SectionTitle>Запуски</SectionTitle>
          <Card className="divide-y divide-line">
            {d.runs.length === 0 ? (
              <p className="p-4 text-sm text-muted">Запусков ещё не было.</p>
            ) : (
              d.runs.map((r) => (
                <div key={`${r.at}-${r.runUrl}`} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <Badge tone={r.conclusion === 'success' ? 'success' : r.conclusion === 'blocked' ? 'danger' : 'neutral'} dot>
                    {r.kind === 'task' ? `Задача #${r.issueNumber ?? '—'}` : 'Проверка по расписанию'}
                  </Badge>
                  <span className="flex-1 text-muted">
                    {formatDateTime(r.at)} · {usd(r.costUsd)} · {r.conclusion}
                  </span>
                  {r.prUrl ? (
                    <a href={r.prUrl} target="_blank" rel="noreferrer" className="text-gold-600 underline-offset-2 hover:underline">
                      PR
                    </a>
                  ) : null}
                  <a href={r.runUrl} target="_blank" rel="noreferrer" className="text-gold-600 underline-offset-2 hover:underline">
                    Журнал
                  </a>
                </div>
              ))
            )}
          </Card>
        </>
      )}
      <StepUpDialog
        open={stepUp}
        description="Задача попадёт в открытый репозиторий GitHub. Подтвердите, что это вы."
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          create.mutate();
        }}
      />
    </>
  );
}
