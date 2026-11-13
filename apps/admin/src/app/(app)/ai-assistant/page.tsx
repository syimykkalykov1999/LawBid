'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ImageAttach, anyUploading, readyIds, type AttachedImage } from '@/components/ai/image-attach';
import { AiRetentionPanel } from '@/components/ai/retention-panel';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import { taskLine } from '@/lib/ai-assistant';
import { formatDateTime } from '@/lib/utils';

const usd = (n: number) => `$${n.toFixed(2)}`;
type Mode = 'off' | 'on' | 'auto';
const MODES: readonly Mode[] = ['off', 'on', 'auto'];
const MODE_LABEL: Record<Mode, string> = { off: 'Выкл', on: 'Вкл', auto: 'Авто' };
const CHECKS: Record<string, { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  success: { text: 'CI зелёный', tone: 'success' },
  pending: { text: 'CI идёт', tone: 'warning' },
  failure: { text: 'CI красный', tone: 'danger' },
  none: { text: 'CI не запускался', tone: 'neutral' },
  unknown: { text: 'CI не прочитан', tone: 'neutral' },
};

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
  // Owner 2026-11-12 (row 48): screenshots for the task (ids only reach GitHub).
  const [images, setImages] = useState<AttachedImage[]>([]);
  // What waits for a fresh 2FA code: the task, or a switch position.
  const [stepUp, setStepUp] = useState<null | { kind: 'task' } | { kind: 'mode'; mode: Mode }>(null);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/ai-assistant/tasks', {
          body: { title, details, ...(readyIds(images).length ? { imageFileIds: readyIds(images) } : {}) },
        })
      ).data!.data,
    onSuccess: (d) => {
      setTitle('');
      setDetails('');
      setImages([]);
      void qc.invalidateQueries({ queryKey: ['ai-assistant'] });
      toast.success(`Задача #${d.number} создана`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp({ kind: 'task' });
      else toast.error(e);
    },
  });

  // Owner rule 5c: Выкл / Вкл / Авто (default Авто), the same buttons as «Масштаб».
  const setMode = useMutation({
    mutationFn: async (mode: Mode) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: 'ai.assistant_mode' } }, body: { value: mode } as never }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-assistant'] });
      toast.success('Сохранено');
    },
    onError: (e, mode) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp({ kind: 'mode', mode });
      else toast.error(e);
    },
  });

  // Owner 2026-11-12 (row 55): the model of the runs (a fresh 2FA code; the
  // panel's global prompt asks and the request repeats by itself).
  const setModel = useMutation({
    mutationFn: async (model: string) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: 'ai.assistant_model' } }, body: { value: model } as never }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-assistant'] });
      toast.success('Модель сохранена');
    },
    onError: (e) => toast.error(e),
  });

  // 12.11.2026: the AI's PRs wait here for «Разрешить» (2FA) or «Отклонить».
  const pulls = useQuery({
    queryKey: ['ai-assistant', 'pulls'],
    queryFn: async () => (await api.GET('/admin/ai-assistant/pulls')).data!.data,
  });
  const pullDone = (text: string) => {
    void qc.invalidateQueries({ queryKey: ['ai-assistant'] });
    toast.success(text);
  };
  // A step-up (fresh 2FA code) is asked by the panel's global prompt and the
  // request repeats by itself (registerStepUpPrompt).
  const approve = useMutation({
    mutationFn: async (p: { number: number; headSha: string }) =>
      (
        await api.POST('/admin/ai-assistant/pulls/{n}/approve', {
          params: { path: { n: p.number } },
          body: { headSha: p.headSha },
        })
      ).data!.data,
    onSuccess: (r) => pullDone(`PR #${r.number} влит`),
    onError: (e) => toast.error(e),
  });
  const reject = useMutation({
    mutationFn: async (n: number) =>
      (await api.POST('/admin/ai-assistant/pulls/{n}/reject', { params: { path: { n } }, body: {} })).data!.data,
    onSuccess: (r) => pullDone(`PR #${r.number} отклонён`),
    onError: (e) => toast.error(e),
  });

  const d = page.data;
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Задача для ИИ"
        subtitle="Авто: ИИ-помощник сам следит за ошибками и тревогами и открывает PR с исправлением. Вкл: ещё и берёт ваши задачи. Выкл: ничего. Влить PR решаете вы кодом 2FA; платежи, чужие данные и ключи ему запрещены."
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
            <span className="text-xs text-muted">Помощник:</span>
            {MODES.map((m) => (
              <Button
                key={m}
                variant={d.mode === m ? 'gold' : 'outline'}
                size="sm"
                disabled={d.mode === m || setMode.isPending}
                onClick={() => setMode.mutate(m)}
              >
                {MODE_LABEL[m]}
              </Button>
            ))}
            <Badge tone={d.connected ? 'success' : 'danger'} dot>
              {d.connected ? 'GitHub подключён' : 'GitHub не подключён'}
            </Badge>
            <span className="text-muted">
              Расход за месяц: {usd(d.monthUsd)} из {usd(d.maxUsd)} (Настройки → ai.monthly_max_usd)
            </span>
            <label className="flex items-center gap-2 text-xs text-muted" htmlFor="ai-model">
              Модель:
              <Select
                id="ai-model"
                value={d.model}
                disabled={setModel.isPending}
                onChange={(e) => setModel.mutate(e.target.value)}
                className="w-auto"
              >
                {d.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
          </Card>

          <SectionTitle>Новая задача</SectionTitle>
          <Card className="mb-6 grid gap-3 p-4">
            <Field label="Коротко: что не так" htmlFor="ai-title">
              <Input id="ai-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <ImageAttach value={images} onChange={setImages} label="Скриншоты">
              <Field label="Подробно: где, как повторить, что должно быть" htmlFor="ai-details">
                <Textarea id="ai-details" maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} />
              </Field>
            </ImageAttach>
            <p className="text-xs text-muted">
              Репозиторий открытый: не пишите имена, телефоны, почту и тексты людей.
            </p>
            {d.tasksReason ? <p className="text-xs text-muted">{d.tasksReason}</p> : null}
            <div>
              <Button
                loading={create.isPending}
                disabled={!d.tasksAllowed || title.trim().length < 5 || details.trim().length < 10 || anyUploading(images)}
                onClick={() => create.mutate()}
              >
                Отдать ИИ
              </Button>
            </div>
          </Card>

          <SectionTitle>PR от ИИ: ждут вашего решения</SectionTitle>
          <Card className="mb-6 divide-y divide-line">
            {pulls.data?.error ? <p className="p-4 text-sm text-danger">{pulls.data.error}</p> : null}
            {!pulls.data ? (
              <p className="p-4 text-sm text-muted">Загрузка…</p>
            ) : pulls.data.pulls.length === 0 ? (
              <p className="p-4 text-sm text-muted">Открытых PR от ИИ нет.</p>
            ) : (
              pulls.data.pulls.map((p) => {
                const ci = CHECKS[p.checks] ?? CHECKS.unknown;
                return (
                  <div key={p.number} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <Badge tone={ci.tone} dot className="shrink-0">
                      {ci.text}
                    </Badge>
                    <span className="min-w-0 flex-1 break-words">
                      <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-heading hover:underline">
                        PR #{p.number} {p.title}
                      </a>
                      <span className="text-muted">
                        {' '}
                        · {formatDateTime(p.createdAt)}
                        {p.costUsd !== null ? ` · ${usd(p.costUsd)}` : ''}
                      </span>
                      {p.summary ? (
                        <span className="mt-1 block whitespace-pre-line text-xs text-muted">{p.summary}</span>
                      ) : null}
                    </span>
                    <Button
                      size="sm"
                      variant="gold"
                      loading={approve.isPending && approve.variables?.number === p.number}
                      disabled={p.checks !== 'success' || approve.isPending || reject.isPending}
                      onClick={() => approve.mutate({ number: p.number, headSha: p.headSha })}
                    >
                      Разрешить (код 2FA)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={reject.isPending && reject.variables === p.number}
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => reject.mutate(p.number)}
                    >
                      Отклонить
                    </Button>
                  </div>
                );
              })
            )}
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

          <AiRetentionPanel scope="technician" />

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
        open={stepUp !== null}
        description={
          stepUp?.kind === 'mode'
            ? 'Меняется, тратит ли ИИ-помощник деньги. Подтвердите, что это вы.'
            : 'Задача попадёт в открытый репозиторий GitHub. Подтвердите, что это вы.'
        }
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const s = stepUp;
          setStepUp(null);
          if (s?.kind === 'mode') setMode.mutate(s.mode);
          else if (s) create.mutate();
        }}
      />
    </>
  );
}
