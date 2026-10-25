'use client';

import { ArrowClockwise, BellRinging, LinkSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { api, errorText } from '@/lib/api/client';
import {
  groupItems,
  LAUNCH_TONE,
  launchSummary,
  PAGING_WORD,
  type LaunchItem,
  type LaunchReport,
  type PagingStatus,
} from '@/lib/launch';
import { livePoll } from '@/lib/live';

/**
 * Owner 2026-10-24: «Запуск» — the owner's launch steps with a light each.
 * Green/yellow/red are detected by the server (read-only, cached 5 minutes);
 * what nothing can detect is a checkbox. PagerDuty gets its own block:
 * the subscription state and the test alarm.
 */
export default function LaunchPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const report = useQuery({
    queryKey: ['launch'],
    queryFn: async () => (await api.GET('/admin/launch')).data!.data as LaunchReport,
    refetchInterval: livePoll(),
  });
  const paging = useQuery({
    queryKey: ['launch-paging'],
    queryFn: async () => (await api.GET('/admin/launch/pagerduty')).data!.data as PagingStatus,
    refetchInterval: livePoll(),
  });
  const [drill, setDrill] = useState(false);
  const [note, setNote] = useState('');
  const [confirmTest, setConfirmTest] = useState(false);

  const setReport = (r: LaunchReport) => qc.setQueryData(['launch'], r);

  const refresh = useMutation({
    mutationFn: async () => (await api.POST('/admin/launch/refresh')).data!.data as LaunchReport,
    onSuccess: (r) => {
      setReport(r);
      void paging.refetch();
    },
    onError: (e) => toast.error(e),
  });
  const tick = useMutation({
    mutationFn: async (v: { id: string; done: boolean }) =>
      (await api.POST('/admin/launch/ticks/{id}', { params: { path: { id: v.id } }, body: { done: v.done } })).data!
        .data as LaunchReport,
    onSuccess: setReport,
    onError: (e) => toast.error(e),
  });
  const recordDrill = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/launch/restore-drill', { body: note.trim() ? { note: note.trim() } : {} })).data!
        .data as LaunchReport,
    onSuccess: (r) => {
      setReport(r);
      setDrill(false);
      setNote('');
      toast.success('Учебное восстановление отмечено на сегодня');
    },
    onError: (e) => toast.error(e),
  });
  const sync = useMutation({
    mutationFn: async () => (await api.POST('/admin/launch/pagerduty/sync')).data!.data as PagingStatus,
    onSuccess: (s) => {
      qc.setQueryData(['launch-paging'], s);
      void qc.invalidateQueries({ queryKey: ['launch'] });
      toast.success('Ссылка подписана на топик тревог');
    },
    onError: (e) => toast.error(e),
  });
  const test = useMutation({
    mutationFn: async () => (await api.POST('/admin/launch/pagerduty/test')).data!.data as PagingStatus,
    onSuccess: (s) => {
      qc.setQueryData(['launch-paging'], s);
      setConfirmTest(false);
      toast.success('Тестовая тревога отправлена: телефон должен зазвонить в течение минуты');
    },
    onError: (e) => {
      setConfirmTest(false);
      toast.error(e);
    },
  });

  const r = report.data;
  const p = paging.data;
  const word = p ? PAGING_WORD[p.state] : null;

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Запуск"
        subtitle="Ваши шаги перед запуском. Зелёное — проверено само, красное — ещё нужно сделать, серое — отметьте галочкой, когда сделаете. Проверки только читают и обновляются раз в 5 минут."
        actions={
          <>
            {r ? <UpdatedAgo at={report.dataUpdatedAt} /> : null}
            <Button variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              <ArrowClockwise size={16} /> Проверить заново
            </Button>
          </>
        }
      />
      <ErrorNote text={report.error ? errorText(report.error) : null} />

      {!r ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
            <Badge tone={r.greenCount === r.total ? 'success' : 'warning'} dot>
              {launchSummary(r)}
            </Badge>
            <span className="min-w-0 flex-1 text-sm text-muted">
              Ключи и сервисы вводятся в{' '}
              <Link href="/integrations" className="text-gold-600 underline-offset-2 hover:underline">
                «Ключах и сервисах»
              </Link>
              , потолок расходов меняется на{' '}
              <Link href="/scale" className="text-gold-600 underline-offset-2 hover:underline">
                «Масштабе»
              </Link>
              , деньги по сервисам — в{' '}
              <Link href="/spend" className="text-gold-600 underline-offset-2 hover:underline">
                «Расходах»
              </Link>
              .
            </span>
          </Card>

          <SectionTitle>Тревоги на телефон (PagerDuty)</SectionTitle>
          <Card className="mb-6 flex flex-col gap-3 p-4">
            {!p ? (
              <Skeleton className="h-16" />
            ) : !p.available ? (
              <p className="text-sm text-muted">Подписка работает только на AWS (боевой сервер). Здесь, на Mac, её не видно.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {word ? (
                    <Badge tone={word.tone} dot>
                      {word.label}
                    </Badge>
                  ) : null}
                  <span className="min-w-0 break-all text-sm text-muted">
                    {p.configured ? `Ссылка сохранена: ${p.endpointMasked}` : 'Ссылка PagerDuty ещё не сохранена.'}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {!p.configured ? (
                    <>
                      Вставьте Integration URL из PagerDuty в{' '}
                      <Link href="/integrations" className="text-gold-600 underline-offset-2 hover:underline">
                        «Ключи и сервисы» → PagerDuty
                      </Link>{' '}
                      и нажмите «Включить»: сервер сам подпишет ссылку на топик.
                    </>
                  ) : (
                    (word?.line ?? '')
                  )}
                  {p.stale ? ' Сохранённая ссылка отличается от подписанной: нажмите «Подписать».' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!p.configured && !p.stale}
                    loading={sync.isPending}
                    onClick={() => sync.mutate()}
                  >
                    <LinkSimple size={14} /> Подписать заново
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={p.state !== 'confirmed'}
                    onClick={() => setConfirmTest(true)}
                  >
                    <BellRinging size={14} /> Отправить тестовую тревогу
                  </Button>
                </div>
              </>
            )}
          </Card>

          {groupItems(r.items).map((g) => (
            <section key={g.group}>
              <SectionTitle>{g.title}</SectionTitle>
              <div className="mb-6 grid gap-3 md:grid-cols-2">
                {g.items.map((i) => (
                  <ItemCard
                    key={i.id}
                    item={i}
                    busy={tick.isPending && tick.variables?.id === i.id}
                    onTick={(done) => tick.mutate({ id: i.id, done })}
                    onDrill={() => setDrill(true)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <Dialog
        open={confirmTest}
        onClose={() => setConfirmTest(false)}
        title="Отправить тестовую тревогу?"
        description="PagerDuty позвонит на ваш телефон. Это 1 из 100 бесплатных звонков в месяц. Нажмите Acknowledge, потом Resolve."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmTest(false)}>
            Отмена
          </Button>
          <Button variant="gold" loading={test.isPending} onClick={() => test.mutate()}>
            Отправить
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={drill}
        onClose={() => setDrill(false)}
        title="Отметить учебное восстановление"
        description="Запустите на Mac scripts/ops/restore-drill.sh. Когда он напечатал строку «OK», нажмите «Отметить». Если хотите, впишите время восстановления."
      >
        <Field label="Заметка (необязательно)" htmlFor="drill-note">
          <Input id="drill-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: 41 минута" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDrill(false)}>
            Отмена
          </Button>
          <Button variant="gold" loading={recordDrill.isPending} onClick={() => recordDrill.mutate()}>
            Отметить, что сделал
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function ItemCard({
  item,
  busy,
  onTick,
  onDrill,
}: {
  item: LaunchItem;
  busy: boolean;
  onTick: (done: boolean) => void;
  onDrill: () => void;
}) {
  const tone = LAUNCH_TONE[item.status] ?? LAUNCH_TONE.manual;
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4" data-testid={`launch-${item.id}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">{item.title}</div>
        <Badge tone={tone.tone} dot className="shrink-0">
          {tone.label}
        </Badge>
      </div>
      <p className="break-words text-sm text-ink">{item.detail}</p>
      {item.status !== 'green' && item.hint ? <p className="break-words text-sm text-muted">Что делать: {item.hint}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        {item.manualTick ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={item.ticked}
              disabled={busy}
              onChange={(e) => onTick(e.target.checked)}
            />
            Сделано
          </label>
        ) : null}
        {item.action === 'restore_drill' ? (
          <Button variant="outline" size="sm" onClick={onDrill}>
            Отметить, что сделал
          </Button>
        ) : null}
        <Link href={`/guides?step=${item.id}`} className="text-sm text-gold-600 underline-offset-2 hover:underline">
          Инструкция
        </Link>
        {item.runbook ? <code className="text-xs text-faint">{item.runbook}</code> : null}
      </div>
    </Card>
  );
}
