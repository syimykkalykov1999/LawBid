'use client';

import { Archive, ArrowCounterClockwise, Briefcase, EyeSlash, Flag, LockSimple, MagnifyingGlass, RocketLaunch } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { DossierBadge } from '@/components/cases/dossier';
import { BulkBar, bulkData, PageSelectBox, RowSelectBox, useBulkRun, useSelection } from '@/components/bulk/bulk-controls';
import { CsvButton } from '@/components/csv-button';
import { UrgencyBadge } from '@/components/cases/urgency';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { collectIds, type Noun } from '@/lib/bulk';
import { useMe } from '@/lib/hooks';
import { CASE_STATUS, StatusPill } from '@/lib/labels';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type CaseStatus = components['schemas']['AdminCaseStatus'];
type Tab = 'all' | CaseStatus;

const STATUSES: CaseStatus[] = ['open', 'in_progress', 'pending_completion', 'disputed', 'closed', 'archived'];
type BulkAction = components['schemas']['AdminCasesBulkAction'];
const CASES: Noun = ['кейс', 'кейса', 'кейсов'];

/** Owner 2026-10-04: the case card's actions for many cases at once. */
const ACTION_TEXT: Record<BulkAction, { verb: string; done: string; describe: string; icon: typeof Archive; danger?: boolean }> = {
  hide: { verb: 'Скрыть', done: 'Скрыто', icon: EyeSlash, danger: true, describe: 'Открытые кейсы уйдут из ленты, ставки отклонятся, клиенты получат причину. Остальные пропустим.' },
  close: { verb: 'Закрыть', done: 'Закрыто', icon: LockSimple, danger: true, describe: 'Открытые кейсы закроются, активные ставки отклонятся. Остальные пропустим.' },
  archive: { verb: 'В архив', done: 'В архиве', icon: Archive, describe: 'Открытые кейсы уйдут в архив, активные ставки отклонятся. Остальные пропустим.' },
  restore: { verb: 'Вернуть', done: 'Возвращено', icon: ArrowCounterClockwise, describe: 'Кейсы из архива снова станут открытыми. Остальные пропустим.' },
};

/** All cases: status tabs, title search (Enter), "has reports" and "with a date" toggles, state filter. */
export function CaseList() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [hasReports, setHasReports] = useState(false);
  const [stateDraft, setStateDraft] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [withDeadline, setWithDeadline] = useState(false);

  const qc = useQueryClient();
  const { data: me } = useMe();
  const canWrite = can(me, 'cases', 'manage');
  const sel = useSelection(`${tab}|${q}|${hasReports}|${stateCode}|${withDeadline}`);
  const bulk = useBulkRun();
  const fetchPage = async (cursor?: string) =>
    (
      await api.GET('/admin/cases', {
        params: {
          query: {
            cursor,
            status: tab === 'all' ? undefined : tab,
            q: q || undefined,
            hasReports: hasReports || undefined,
            stateCode: stateCode || undefined,
            withDeadline: withDeadline || undefined,
          },
        },
      })
    ).data!;
  const onBulk = (action: BulkAction) => {
    const t = ACTION_TEXT[action];
    bulk.run({
      ids: [...sel.selected],
      verb: t.verb,
      doneVerb: t.done,
      noun: CASES,
      danger: t.danger,
      description: t.describe,
      send: async (ids, reason) => bulkData(await api.POST('/admin/cases/bulk', { body: { action, ids, reason } })),
      onDone: () => {
        sel.clear();
        void qc.invalidateQueries({ queryKey: ['admin-cases'] });
      },
    });
  };

  const list = useInfiniteQuery({
    queryKey: ['admin-cases', tab, q, hasReports, stateCode, withDeadline],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = tab !== 'all' || !!q || hasReports || !!stateCode || withDeadline;

  return (
    <>
      <div className="mb-4 space-y-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[{ value: 'all' as Tab, label: 'Все' }, ...STATUSES.map((s) => ({ value: s as Tab, label: CASE_STATUS[s] }))]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draft.trim());
            }}
          >
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input className="w-full pl-9 sm:w-72" placeholder="Название кейса, Enter — искать" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStateCode(stateDraft.trim().toUpperCase());
            }}
          >
            <Input
              className="w-28 font-mono uppercase"
              placeholder="Штат"
              maxLength={2}
              aria-label="Код штата, Enter — применить"
              value={stateDraft}
              onChange={(e) => setStateDraft(e.target.value)}
              onBlur={() => setStateCode(stateDraft.trim().toUpperCase())}
            />
          </form>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch checked={hasReports} onChange={setHasReports} label="Только с жалобами" />
            Только с жалобами
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch checked={withDeadline} onChange={setWithDeadline} label="С датой (суд, срок подачи)" />
            С датой (суд, срок подачи)
          </label>
          <CsvButton entity="cases" />
        </div>
      </div>
      {bulk.dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={CASES}
          onClear={sel.clear}
          onSelectAll={async () => {
            const r = await collectIds(async (c) => {
              const p = await fetchPage(c);
              return { data: p.data, nextCursor: p.meta?.nextCursor };
            });
            sel.replace(r.ids);
            return r.capped;
          }}
        >
          {(Object.keys(ACTION_TEXT) as BulkAction[]).map((a) => {
            const t = ACTION_TEXT[a];
            return (
              <Button key={a} size="sm" variant="outline" className={t.danger ? 'text-danger' : undefined} disabled={bulk.pending} onClick={() => onBulk(a)}>
                <t.icon size={14} /> {t.verb}
              </Button>
            );
          })}
        </BulkBar>
      ) : null}

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="Кейсов нет" text={filtered ? 'Попробуйте другие фильтры.' : 'Кейсы появятся, когда клиенты начнут их публиковать.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              {canWrite ? (
                <Th className="w-8">
                  <PageSelectBox selected={sel.selected} ids={rows.map((c) => c.id)} onToggle={sel.togglePage} />
                </Th>
              ) : null}
              <Th>Кейс</Th>
              <Th>Клиент</Th>
              <Th>Статус</Th>
              <Th>Штат</Th>
              <Th className="text-right">Ставки</Th>
              <Th>Активность</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={canWrite ? 7 : 6} loading />
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
                  {canWrite ? (
                    <Td>
                      <RowSelectBox selected={sel.selected} id={c.id} onToggle={sel.toggle} />
                    </Td>
                  ) : null}
                  <Td className="max-w-[340px]">
                    <Link href={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {c.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-faint">{c.practiceAreaName}</span>
                      <UrgencyBadge c={c} />
                      <DossierBadge c={c} />
                      {c.openReports > 0 ? (
                        <Badge tone="danger">
                          <Flag size={11} /> {c.openReports}
                        </Badge>
                      ) : null}
                      {c.promoted ? (
                        <Badge tone="gold">
                          <RocketLaunch size={11} /> продвигается
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-muted">{c.clientName}</Td>
                  <Td>
                    <StatusPill map={CASE_STATUS} value={c.status} />
                  </Td>
                  <Td className="font-mono text-xs">{c.stateCode}</Td>
                  <Td className="text-right tabular-nums">{c.bidsCount}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(c.lastActivityAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}
