'use client';

import { Archive, ArrowCounterClockwise, Briefcase, EyeSlash, Flag, LockSimple, MagnifyingGlass, RocketLaunch } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { HoverPrefetchLink as Link } from '@/components/ui/hover-prefetch-link';
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
import { SortTh, Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { VirtualRows } from '@/components/ui/virtual-rows';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { collectIds, type Noun } from '@/lib/bulk';
import { useMe } from '@/lib/hooks';
import { CASE_STATUS, StatusPill } from '@/lib/labels';
import { can } from '@/lib/rbac';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';
import { useUrlDraft, useUrlFlag, useUrlState } from '@/lib/url-state';

type CaseStatus = components['schemas']['AdminCaseStatus'];
/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const SORT_KEYS = ['title', 'client', 'status', 'state', 'bids', 'activity'] as const;
type Tab = 'all' | CaseStatus;

const STATUSES: CaseStatus[] = ['open', 'in_progress', 'pending_completion', 'disputed', 'closed', 'archived'];
const TABS: readonly Tab[] = ['all', ...STATUSES];
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
  // Scout 13.11 (row 96): every filter lives in the address (lib/url-state.ts).
  const [tab, setTab] = useUrlState<Tab>('status', 'all', TABS);
  const { draft, setDraft, value: q, apply: setQ } = useUrlDraft('q');
  const [hasReports, setHasReports] = useUrlFlag('reports');
  const { draft: stateDraft, setDraft: setStateDraft, value: stateCode, apply: setStateCode } = useUrlDraft('state');
  const [withDeadline, setWithDeadline] = useUrlFlag('deadline');

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
  const { sort, header } = useTableSort(SORT_KEYS);
  const rows = sortRows(list.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    title: (c) => c.title,
    client: (c) => c.clientName,
    status: (c) => CASE_STATUS[c.status] ?? c.status,
    state: (c) => c.stateCode,
    bids: (c) => c.bidsCount,
    activity: (c) => c.lastActivityAt,
  });
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
              <SortTh {...header('title')}>Кейс</SortTh>
              <SortTh {...header('client')}>Клиент</SortTh>
              <SortTh {...header('status')}>Статус</SortTh>
              <SortTh {...header('state')}>Штат</SortTh>
              <SortTh {...header('bids')} className="text-right">Ставки</SortTh>
              <SortTh {...header('activity')}>Активность</SortTh>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={canWrite ? 7 : 6} loading />
            ) : (
              <VirtualRows rows={rows} colSpan={canWrite ? 7 : 6}>
                {(c, _i, vp) => (
                <tr key={c.id} {...vp} className="cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
                  {canWrite ? (
                    <Td>
                      <RowSelectBox selected={sel.selected} id={c.id} onToggle={sel.toggle} order={() => rows.map((x) => x.id)} />
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
                )}
              </VirtualRows>
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}
