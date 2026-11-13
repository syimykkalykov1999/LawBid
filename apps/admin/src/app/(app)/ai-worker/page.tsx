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
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import {
  DECISION_LABEL,
  DECISION_TONE,
  LANE_HINT,
  LANE_LABEL,
  RUN_LABEL,
  agreementText,
  runProgress,
  usdFromCents,
  type Lane,
} from '@/lib/ai-worker';
import { formatDateTime } from '@/lib/utils';

const LANES: readonly Lane[] = ['priority', 'audit', 'bulk'];
const DECISIONS = ['approve', 'reject', 'request_info', 'unclear'] as const;

/**
 * Owner 2026-11-12: Система → «ИИ-сотрудник» (owner only). The owner writes a
 * role once; the AI makes a first pass over the whole queue in the
 * background and only PROPOSES. Proposals are routed by confidence (the
 * trust-and-safety pattern of large platforms): «Сначала вам», a random
 * «Выборочная проверка» and «Уверенные» for one-tap approval. Every change
 * asks for a fresh 2FA code.
 */
export default function AiWorkerPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const page = useQuery({
    queryKey: ['ai-worker'],
    queryFn: async () => (await api.GET('/admin/ai-worker')).data!.data,
  });
  const [lane, setLane] = useState<Lane>('priority');
  const items = useQuery({
    queryKey: ['ai-worker', 'items', lane],
    queryFn: async () =>
      (await api.GET('/admin/ai-worker/items', { params: { query: { status: 'proposed', lane } } })).data!.data,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [fix, setFix] = useState<{ decision: string; note: string }>({ decision: 'reject', note: '' });
  const [form, setForm] = useState({ name: '', instructions: '', queue: 'attorney_verification', model: '', confidenceMin: 90, auditPct: 10 });
  // The action waiting for a fresh 2FA code (re-run after the code).
  const [pending, setPending] = useState<null | (() => void)>(null);
  // Owner 2026-11-12 (row 48): example screenshots of a new role, and the
  // pictures of a correction.
  const [roleImages, setRoleImages] = useState<AttachedImage[]>([]);
  const [fixImages, setFixImages] = useState<AttachedImage[]>([]);

  const refresh = () => {
    setSelected([]);
    void qc.invalidateQueries({ queryKey: ['ai-worker'] });
  };
  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      refresh();
      toast.success('Сохранено');
    },
    onError: (e, fn) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setPending(() => () => act.mutate(fn));
      else toast.error(e);
    },
  });
  const run = (fn: () => Promise<{ error?: unknown }>) =>
    act.mutate(async () => {
      const r = await fn();
      if (r.error) throw r.error;
    });

  const review = (
    ids: string[],
    verdict: 'approved' | 'rejected',
    correction?: { decision: string; note: string; imageFileIds?: string[] },
  ) =>
    run(() =>
      api.POST('/admin/ai-worker/items/review', {
        body: {
          ids,
          verdict,
          ...(correction ? { ownerDecision: correction.decision as never, ownerNote: correction.note || undefined } : {}),
          ...(correction?.imageFileIds?.length ? { imageFileIds: correction.imageFileIds } : {}),
        },
      }),
    );

  const d = page.data;
  const list = items.data?.items ?? [];
  // Owner 2026-11-12 (row 55): a new role starts on its queue's model.
  const queueModel = d?.queues.find((q) => q.key === form.queue)?.defaultModel ?? d?.defaultModel ?? '';
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="ИИ-сотрудник"
        subtitle="Опишите роль один раз — ИИ пройдёт всю очередь в фоне и подготовит предложения. Решаете вы: ИИ сам ничего не одобряет и не отклоняет."
      />
      <ErrorNote text={page.error ? errorText(page.error) : null} />
      {!d ? (
        <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          {!d.enabled ? (
            <Card className="mb-5 p-4 text-sm text-muted">
              Режим ИИ выключен: включите мастер-тумблер «Режим ИИ для сотрудников» в Настройках (staff.ai_enabled) и
              сохраните ключ Claude в «Ключи и сервисы». Пока он выключен — ни одного вызова ИИ.
            </Card>
          ) : null}
          <Card className="mb-6 flex flex-wrap items-center gap-3 p-4 text-sm">
            <Badge tone={d.enabled ? 'success' : 'neutral'} dot>
              {d.enabled ? 'ИИ включён' : 'ИИ выключен'}
            </Badge>
            <span className="text-muted">
              Расход за месяц: {usdFromCents(d.spentCents)} из {usdFromCents(d.budgetCents)} (Настройки → staff.ai.monthly_cents)
            </span>
            <span className="text-muted">Ждут решения: {d.toReview}</span>
          </Card>

          {d.proposals.length ? <SectionTitle>Могу взять на себя</SectionTitle> : null}
          {d.proposals.map((p) => (
            <Card key={p.queue} className="mb-4 grid gap-2 p-4 text-sm">
              <p className="font-medium text-heading">{p.text}</p>
              <ul className="list-disc pl-5 text-muted">
                {p.examples.map((e) => (
                  <li key={e.itemId}>{e.summary}</li>
                ))}
              </ul>
              <div>
                {p.roleId ? (
                  <Button size="sm" loading={act.isPending} onClick={() => run(() => api.POST('/admin/ai-worker/roles/{id}/runs', { params: { path: { id: p.roleId! } }, body: {} }))}>
                    Запустить
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, queue: p.queue, name: f.name || p.label }))}>
                    Описать роль
                  </Button>
                )}
              </div>
            </Card>
          ))}

          <SectionTitle>Предложения ИИ</SectionTitle>
          <Card className="mb-3 flex flex-wrap items-center gap-2 p-3 text-sm">
            {LANES.map((l) => (
              <Button key={l} size="sm" variant={lane === l ? 'gold' : 'outline'} onClick={() => { setLane(l); setSelected([]); }}>
                {LANE_LABEL[l]} · {d.toReviewByLane[l]}
              </Button>
            ))}
            <span className="w-full text-xs text-muted">{LANE_HINT[lane]}</span>
          </Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={!selected.length || act.isPending} onClick={() => review(selected, 'approved')}>
              Утвердить выбранные ({selected.length})
            </Button>
            {lane === 'bulk' ? (
              <Button size="sm" variant="outline" disabled={!d.toReviewByLane.bulk || act.isPending} onClick={() => run(() => api.POST('/admin/ai-worker/items/approve-bulk', { body: {} }))}>
                Утвердить весь список ({d.toReviewByLane.bulk})
              </Button>
            ) : null}
          </div>
          <Table className="mb-6">
            <thead>
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    aria-label="Выбрать все"
                    checked={list.length > 0 && selected.length === list.length}
                    onChange={(e) => setSelected(e.target.checked ? list.map((i) => i.id) : [])}
                  />
                </Th>
                <Th>Предложение</Th>
                <Th>Почему</Th>
                <Th>Флаги</Th>
                <Th>Решение</Th>
              </tr>
            </thead>
            <tbody>
              {items.isLoading || list.length === 0 ? (
                <TableEmpty colSpan={5} loading={items.isLoading}>
                  Здесь пусто.
                </TableEmpty>
              ) : (
                list.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label="Выбрать"
                        checked={selected.includes(i.id)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))}
                      />
                    </Td>
                    <Td>
                      <Badge tone={DECISION_TONE[i.decision ?? 'unclear'] ?? 'neutral'} dot>
                        {DECISION_LABEL[i.decision ?? 'unclear'] ?? i.decision}
                      </Badge>
                      <div className="mt-1 text-xs text-muted">
                        уверенность {i.confidence ?? '—'} % · {i.roleName}
                      </div>
                      <a href={`/verification/${i.itemId}`} className="text-xs text-gold-600 hover:underline">
                        Открыть заявку
                      </a>
                      {i.injectionSuspected ? (
                        <div className="mt-1">
                          <Badge tone="danger">Попытка обмана ИИ</Badge>
                        </div>
                      ) : null}
                    </Td>
                    <Td className="max-w-md">
                      <ul className="list-disc pl-4">
                        {i.reasons.map((r, n) => (
                          <li key={n}>{r}</li>
                        ))}
                      </ul>
                      {i.evidence.length ? (
                        <p className="mt-1 text-xs text-muted">
                          Откуда: {i.evidence.map((e) => `${e.source} — ${e.note}`).join('; ')}
                        </p>
                      ) : null}
                      {i.draftNote ? <p className="mt-1 text-xs text-muted">Черновик: {i.draftNote}</p> : null}
                    </Td>
                    <Td className="text-xs text-muted">{i.flags.length ? i.flags.join(', ') : 'нет'}</Td>
                    <Td>
                      {correcting === i.id ? (
                        <div className="grid min-w-48 gap-2">
                          <Select aria-label="Как правильно" value={fix.decision} onChange={(e) => setFix((f) => ({ ...f, decision: e.target.value }))}>
                            {DECISIONS.map((x) => (
                              <option key={x} value={x}>
                                {DECISION_LABEL[x]}
                              </option>
                            ))}
                          </Select>
                          <ImageAttach value={fixImages} onChange={setFixImages} label="Скриншот">
                            <Input aria-label="Почему" placeholder="Почему (ИИ учтёт)" maxLength={1000} value={fix.note} onChange={(e) => setFix((f) => ({ ...f, note: e.target.value }))} />
                          </ImageAttach>
                          <div className="flex gap-2">
                            <Button size="sm" variant="danger" disabled={anyUploading(fixImages)} onClick={() => { review([i.id], 'rejected', { ...fix, imageFileIds: readyIds(fixImages) }); setFixImages([]); setCorrecting(null); }}>
                              Сохранить
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setFixImages([]); setCorrecting(null); }}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={act.isPending} onClick={() => review([i.id], 'approved')}>
                            Верно
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setCorrecting(i.id); setFix({ decision: i.decision === 'approve' ? 'reject' : 'approve', note: '' }); }}>
                            Неверно
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          <SectionTitle>Роли</SectionTitle>
          <Table className="mb-4">
            <thead>
              <tr>
                <Th>Роль</Th>
                <Th>Очередь</Th>
                <Th>Модель</Th>
                <Th>Уверенные от / выборка</Th>
                <Th>Совпадает с вами</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {d.roles.length === 0 ? (
                <TableEmpty colSpan={6}>Ролей пока нет — опишите первую ниже.</TableEmpty>
              ) : (
                d.roles.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <div className="font-medium text-heading">{r.name}</div>
                      <div className="line-clamp-2 max-w-sm text-xs text-muted">{r.instructions}</div>
                      {r.images.length ? <div className="text-xs text-faint">Картинок: {r.images.length}</div> : null}
                    </Td>
                    <Td>{d.queues.find((q) => q.key === r.queue)?.label ?? r.queue}</Td>
                    <Td className="text-xs">{r.model}</Td>
                    <Td>
                      {r.confidenceMin} % / {r.auditPct} %
                    </Td>
                    <Td>{agreementText(r)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!d.enabled || act.isPending} onClick={() => run(() => api.POST('/admin/ai-worker/roles/{id}/runs', { params: { path: { id: r.id } }, body: {} }))}>
                          Запустить
                        </Button>
                        <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run(() => api.POST('/admin/ai-worker/roles/{id}/archive', { params: { path: { id: r.id } } }))}>
                          Убрать
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          <Card className="mb-6 grid gap-3 p-4">
            <Field label="Название роли" htmlFor="ai-role-name">
              <Input id="ai-role-name" maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Очередь" htmlFor="ai-role-queue">
              <Select id="ai-role-queue" value={form.queue} onChange={(e) => setForm((f) => ({ ...f, queue: e.target.value }))}>
                {d.queues.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.label}
                  </option>
                ))}
              </Select>
            </Field>
            <ImageAttach value={roleImages} onChange={setRoleImages} label="Примеры и инструкции картинками">
              <Field label="Что делать (своими словами)" htmlFor="ai-role-text" hint="Например: проверяй лицензию, штат, срок и совпадение имени; при истёкшей лицензии — отклонить.">
                <Textarea id="ai-role-text" maxLength={8000} value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
              </Field>
            </ImageAttach>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Модель" htmlFor="ai-role-model">
                <Select id="ai-role-model" value={form.model || queueModel} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
                  {d.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="«Уверенные» от, %" htmlFor="ai-role-conf">
                <Input id="ai-role-conf" type="number" min={0} max={100} value={form.confidenceMin} onChange={(e) => setForm((f) => ({ ...f, confidenceMin: Number(e.target.value) }))} />
              </Field>
              <Field label="Выборочная проверка, %" htmlFor="ai-role-audit">
                <Input id="ai-role-audit" type="number" min={0} max={100} value={form.auditPct} onChange={(e) => setForm((f) => ({ ...f, auditPct: Number(e.target.value) }))} />
              </Field>
            </div>
            <div>
              <Button
                loading={act.isPending}
                disabled={form.name.trim().length < 2 || form.instructions.trim().length < 10 || anyUploading(roleImages)}
                onClick={() =>
                  run(async () => {
                    const r = await api.POST('/admin/ai-worker/roles', {
                      body: {
                        name: form.name,
                        instructions: form.instructions,
                        queue: form.queue as never,
                        model: (form.model || queueModel) as never,
                        confidenceMin: form.confidenceMin,
                        auditPct: form.auditPct,
                        ...(readyIds(roleImages).length ? { imageFileIds: readyIds(roleImages) } : {}),
                      },
                    });
                    if (!r.error) {
                      setForm((f) => ({ ...f, name: '', instructions: '' }));
                      setRoleImages([]);
                    }
                    return r;
                  })
                }
              >
                Сохранить роль
              </Button>
            </div>
          </Card>

          <AiRetentionPanel scope="worker" />

          <SectionTitle>Запуски</SectionTitle>
          <Card className="divide-y divide-line">
            {d.runs.length === 0 ? (
              <p className="p-4 text-sm text-muted">Запусков ещё не было.</p>
            ) : (
              d.runs.map((r) => {
                const s = RUN_LABEL[r.status] ?? { text: r.status, tone: 'neutral' as const };
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <Badge tone={s.tone} dot className="shrink-0">
                      {s.text}
                    </Badge>
                    <span className="min-w-0 flex-1 break-words">
                      <span className="font-medium text-heading">{r.roleName}</span>
                      <span className="text-muted">
                        {' '}
                        · {runProgress(r)} % · предложений {r.proposed} из {r.total}
                        {r.failed ? ` · пропущено ${r.failed}` : ''} · {usdFromCents(r.costCents)} · {formatDateTime(r.createdAt)}
                      </span>
                      {r.error ? <span className="block text-xs text-danger">{r.error}</span> : null}
                    </span>
                    {r.status === 'queued' || r.status === 'running' ? (
                      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run(() => api.POST('/admin/ai-worker/runs/{id}/cancel', { params: { path: { id: r.id } } }))}>
                        Остановить
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </Card>
        </>
      )}
      <StepUpDialog
        open={pending !== null}
        description="Изменение в ИИ-сотруднике. Подтвердите, что это вы."
        onCancel={() => setPending(null)}
        onDone={() => {
          const p = pending;
          setPending(null);
          p?.();
        }}
      />
    </>
  );
}
