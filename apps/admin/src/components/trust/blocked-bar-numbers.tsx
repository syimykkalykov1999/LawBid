'use client';

import { ArrowSquareOut } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { TRUST_NOTE_MAX } from '@/components/trust/document-request-dialog';
import { invalidateTrust } from '@/components/trust/trust-panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { attorneyName, BLOCK_EVENT_RU, BLOCK_SOURCE_RU, staffName, TRUST_ACTOR_RU, type BlockSource } from '@/lib/trust-labels';
import { cn, formatDateTime } from '@/lib/utils';

type Block = components['schemas']['BarNumberBlockDto'];
type Status = 'active' | 'unblocked' | 'all';

const LIMIT = 200;
const STATUS_ITEMS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'unblocked', label: 'Разблокированные' },
  { value: 'all', label: 'Все' },
];

/** Every list a block / unblock changes. */
function invalidateBlocks(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['trust-blocked'] });
  void qc.invalidateQueries({ queryKey: ['trust-attorneys'] });
  invalidateTrust(qc);
}

/**
 * Owner 2026-10-05 07:00 — «Заблокированные номера»: bar numbers that cannot be
 * registered again (rejected / suspended attorneys, or blocked by hand), who
 * blocked them and how many times somebody tried anyway. A click on a row
 * opens the history; «Разблокировать» needs a reason.
 */
export function BlockedBarNumbers({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [status, setStatus] = useState<Status>('active');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const [blockOpen, setBlockOpen] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['trust-blocked', status, search],
    queryFn: async () =>
      (
        await api.GET('/admin/trust/blocked-bar-numbers', {
          params: { query: { status: status === 'all' ? undefined : status, q: search || undefined, limit: LIMIT } },
        })
      ).data!.data,
  });
  const rows = q.data ?? [];

  const unblock = useMutation({
    mutationFn: async (b: Block) => {
      const a = await ask({
        title: `Разблокировать — ${b.stateCode} № ${b.barNumber}`,
        description: 'Номер снова можно будет указать при регистрации. Причина обязательна и останется в истории блокировки.',
        label: 'Причина (что объяснил или доказал человек)',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Разблокировать',
      });
      if (!a) return null;
      return api.POST('/admin/trust/blocked-bar-numbers/{id}/unblock', { params: { path: { id: b.id } }, body: { reason: a.text } });
    },
    onSuccess: (x) => {
      if (!x) return;
      toast.success('Номер разблокирован');
      invalidateBlocks(qc);
    },
    onError: (e) => toast.error(e),
  });

  const block = useMutation({
    mutationFn: async (body: components['schemas']['BlockBarNumberDto']) =>
      (await api.POST('/admin/trust/blocked-bar-numbers', { body })).data!.data,
    onSuccess: () => {
      setBlockOpen(false);
      toast.success('Номер заблокирован');
      invalidateBlocks(qc);
    },
    onError: (e) => toast.error(e),
  });

  const cols = canManage ? 9 : 8;

  return (
    <>
      {dialog}
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} pending={block.isPending} onSubmit={(v) => block.mutate(v)} />
      <HistoryDialog id={historyId} onClose={() => setHistoryId(null)} />
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Номера лицензий, которые нельзя зарегистрировать снова: отклонённые или приостановленные адвокаты не заведут новый аккаунт на тот же номер под
        другим именем. Попытки считаются. Разблокировать можно с причиной — она останется в истории.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Status> size="sm" value={status} onChange={setStatus} items={STATUS_ITEMS} />
        <Input aria-label="Поиск" className="w-64" placeholder="Номер, штат, имя или e-mail" value={text} onChange={(e) => setText(e.target.value)} />
        {canManage ? (
          <Button size="sm" variant="danger-soft" className="ml-auto w-44" onClick={() => setBlockOpen(true)}>
            Заблокировать номер
          </Button>
        ) : null}
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Номер</Th>
            <Th>Причина</Th>
            <Th>Источник</Th>
            <Th>Адвокат</Th>
            <Th>Кто заблокировал</Th>
            <Th>Попыток</Th>
            <Th>Контакты</Th>
            <Th>Реестр</Th>
            {canManage ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={cols} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={cols}>
              {search ? 'Ничего не нашли — измените поиск или статус.' : status === 'active' ? 'Заблокированных номеров нет.' : 'Записей нет.'}
            </TableEmpty>
          ) : (
            rows.map((b, i) => {
              const src = BLOCK_SOURCE_RU[b.source as BlockSource] ?? { text: b.source, tone: 'neutral' as const };
              return (
                <MotionRow key={b.id} i={i} className="cursor-pointer" onClick={() => setHistoryId(b.id)}>
                  <Td className="whitespace-nowrap">
                    <div className="font-medium text-heading">
                      {b.stateCode} <span className="font-mono">№ {b.barNumber}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {b.active ? (
                        <Badge tone="danger" dot>
                          заблокирован
                        </Badge>
                      ) : (
                        <Badge tone="success" dot>
                          разблокирован
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-64 text-xs text-ink" title={b.reason}>
                      <span className="line-clamp-2">{b.reason}</span>
                    </div>
                    {!b.active && b.unblockReason ? (
                      <div className="mt-1 max-w-64 text-xs text-muted" title={b.unblockReason}>
                        <span className="line-clamp-2">снят: {b.unblockReason}</span>
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={src.tone}>{src.text}</Badge>
                  </Td>
                  <Td>
                    {b.attorney ? (
                      <>
                        <Link
                          href={`/verification/trust/${b.attorney.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-heading hover:underline"
                        >
                          {attorneyName(b.attorney)}
                        </Link>
                        <div className="text-xs text-faint">@{b.attorney.username}</div>
                      </>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    <div className="text-ink">{b.blockedBy ? staffName(b.blockedBy) : 'система'}</div>
                    <div className="text-muted">{formatDateTime(b.blockedAt)}</div>
                    {!b.active && b.unblockedAt ? (
                      <div className="mt-1 text-muted">
                        снял {b.unblockedBy ? staffName(b.unblockedBy) : 'система'} · {formatDateTime(b.unblockedAt)}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className={cn('tabular-nums', b.attempts > 0 ? 'font-medium text-warning' : 'text-muted')}>{b.attempts}</span>
                    {b.lastAttemptAt ? <div className="text-xs text-muted">{formatDateTime(b.lastAttemptAt)}</div> : null}
                  </Td>
                  <Td className="text-xs">
                    {b.blockContacts ? (
                      <>
                        <Badge tone="warning">+ e-mail/телефон</Badge>
                        {b.email || b.phone ? (
                          <div className="mt-1 font-mono text-[11px] text-muted">
                            {b.email ? <div>{b.email}</div> : null}
                            {b.phone ? <div>{b.phone}</div> : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">только номер</span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {b.lookupUrl ? (
                      <a
                        href={b.lookupUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-primary underline"
                      >
                        <ArrowSquareOut size={13} /> Открыть в реестре
                      </a>
                    ) : (
                      <span className="text-muted">ссылки нет</span>
                    )}
                  </Td>
                  {canManage ? (
                    <Td>
                      <div className="flex flex-col items-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-32"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryId(b.id);
                          }}
                        >
                          История
                        </Button>
                        {b.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-32"
                            loading={unblock.isPending && unblock.variables?.id === b.id}
                            disabled={unblock.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              unblock.mutate(b);
                            }}
                          >
                            Разблокировать
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  ) : null}
                </MotionRow>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}

/** «Заблокировать номер»: state, number, reason, and whether the holder's contacts go with it. */
function BlockDialog({
  open,
  onClose,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSubmit: (v: components['schemas']['BlockBarNumberDto']) => void;
}) {
  const [stateCode, setStateCode] = useState('');
  const [barNumber, setBarNumber] = useState('');
  const [reason, setReason] = useState('');
  const [blockContacts, setBlockContacts] = useState(false);
  const trimmedReason = reason.trim();
  const trimmedNumber = barNumber.trim();
  const ok = /^[A-Z]{2}$/.test(stateCode) && trimmedNumber.length > 0 && trimmedReason.length >= 3 && trimmedReason.length <= TRUST_NOTE_MAX;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Подтверждение"
      title="Заблокировать номер"
      description="Этот номер лицензии нельзя будет указать при регистрации нового аккаунта. Причина останется в истории."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !pending) onSubmit({ stateCode, barNumber: trimmedNumber, reason: trimmedReason, ...(blockContacts ? { blockContacts } : {}) });
        }}
      >
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Штат" htmlFor="bb-state" hint="2 буквы">
            <Input
              id="bb-state"
              autoFocus
              value={stateCode}
              maxLength={2}
              placeholder="CA"
              className="font-mono uppercase"
              onChange={(e) => setStateCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2))}
            />
          </Field>
          <Field label="Номер лицензии" htmlFor="bb-number">
            <Input id="bb-number" value={barNumber} placeholder="123456" className="font-mono" onChange={(e) => setBarNumber(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-1.5">
          <Field label="Причина" htmlFor="bb-reason" hint={trimmedReason.length < 3 ? `не короче 3 символов — ещё ${3 - trimmedReason.length}` : undefined}>
            <Textarea id="bb-reason" rows={3} maxLength={TRUST_NOTE_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="text-right text-xs text-faint">
            {trimmedReason.length}/{TRUST_NOTE_MAX}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gold" checked={blockContacts} onChange={(e) => setBlockContacts(e.target.checked)} />
          <span>
            Также блокировать e-mail и телефон владельца
            <span className="block text-xs text-muted">Если номер сейчас у кого-то в профиле, его e-mail и телефон тоже не примут при регистрации.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" disabled={!ok} loading={pending}>
            Заблокировать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** «История»: `GET /admin/trust/blocked-bar-numbers/:id` — blocked / unblocked / attempts, newest first as the API gives. */
function HistoryDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['trust-blocked', 'one', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.GET('/admin/trust/blocked-bar-numbers/{id}', { params: { path: { id: id! } } })).data!.data,
  });
  const b = q.data;
  const src = b ? (BLOCK_SOURCE_RU[b.source as BlockSource] ?? { text: b.source, tone: 'neutral' as const }) : null;
  return (
    <Dialog
      open={Boolean(id)}
      onClose={onClose}
      wide
      eyebrow="Блок-лист"
      title={b ? `${b.stateCode} № ${b.barNumber}` : 'История'}
      description={
        b ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            {b.active ? (
              <Badge tone="danger" dot>
                заблокирован
              </Badge>
            ) : (
              <Badge tone="success" dot>
                разблокирован
              </Badge>
            )}
            {src ? <Badge tone={src.tone}>{src.text}</Badge> : null}
            {b.blockContacts ? <Badge tone="warning">+ e-mail/телефон</Badge> : null}
            {b.attorney ? (
              <Link href={`/verification/trust/${b.attorney.id}`} className="text-gold-600 hover:underline">
                {attorneyName(b.attorney)}
              </Link>
            ) : null}
          </span>
        ) : undefined
      }
    >
      {q.isPending && id ? <Skeleton className="h-40 rounded-[var(--radius-lg)]" /> : null}
      {q.error ? <ErrorNote text={errorText(q.error)} /> : null}
      {b ? (
        <div className="space-y-4 text-sm">
          <ul className="space-y-1.5">
            <Row k="Причина" v={b.reason} />
            <Row k="Заблокировал" v={`${b.blockedBy ? staffName(b.blockedBy) : 'система'} · ${formatDateTime(b.blockedAt)}`} />
            {!b.active ? (
              <Row
                k="Разблокировал"
                v={`${b.unblockedBy ? staffName(b.unblockedBy) : 'система'} · ${formatDateTime(b.unblockedAt)}${b.unblockReason ? ` · ${b.unblockReason}` : ''}`}
              />
            ) : null}
            <Row k="Попыток регистрации" v={`${b.attempts}${b.lastAttemptAt ? ` · последняя ${formatDateTime(b.lastAttemptAt)}` : ''}`} />
            {b.email || b.phone ? <Row k="Контакты" v={[b.email, b.phone].filter(Boolean).join(' · ')} /> : null}
            {b.lookupUrl ? (
              <Row
                k="Реестр"
                v={
                  <a href={b.lookupUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                    <ArrowSquareOut size={13} /> Открыть в реестре
                  </a>
                }
              />
            ) : null}
          </ul>
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">События</h4>
            {b.events.length === 0 ? <p className="text-muted">Нет</p> : null}
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {b.events.map((e) => {
                const kind = BLOCK_EVENT_RU[e.kind] ?? { text: e.kind, tone: 'neutral' as const };
                return (
                  <li key={e.id} className="rounded-xl bg-surface-2 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={kind.tone} dot>
                        {kind.text}
                      </Badge>
                      <span className="shrink-0 text-xs text-faint">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {e.actor ? staffName(e.actor) : (TRUST_ACTOR_RU[e.actorType] ?? e.actorType)}
                      {e.reason ? ` · ${e.reason}` : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="shrink-0 text-muted">{k}</span>
      <span className="min-w-0 text-right break-words">{v}</span>
    </li>
  );
}
