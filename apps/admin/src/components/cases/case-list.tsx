'use client';

import { Briefcase, Flag, MagnifyingGlass, RocketLaunch } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { CASE_STATUS, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type CaseStatus = components['schemas']['AdminCaseStatus'];
type Tab = 'all' | CaseStatus;

const STATUSES: CaseStatus[] = ['open', 'in_progress', 'pending_completion', 'disputed', 'closed', 'archived'];

/** All cases: status tabs, title search (Enter), "has reports" toggle, state filter. */
export function CaseList() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [hasReports, setHasReports] = useState(false);
  const [stateDraft, setStateDraft] = useState('');
  const [stateCode, setStateCode] = useState('');

  const list = useInfiniteQuery({
    queryKey: ['admin-cases', tab, q, hasReports, stateCode],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/cases', {
          params: {
            query: {
              cursor: pageParam,
              status: tab === 'all' ? undefined : tab,
              q: q || undefined,
              hasReports: hasReports || undefined,
              stateCode: stateCode || undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = tab !== 'all' || !!q || hasReports || !!stateCode;

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
            <Input className="w-72 pl-9" placeholder="Название кейса, Enter — искать" value={draft} onChange={(e) => setDraft(e.target.value)} />
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
        </div>
      </div>

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="Кейсов нет" text={filtered ? 'Попробуйте другие фильтры.' : 'Кейсы появятся, когда клиенты начнут их публиковать.'} />
      ) : (
        <Table>
          <thead>
            <tr>
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
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
                  <Td className="max-w-[340px]">
                    <Link href={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {c.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-faint">{c.practiceAreaName}</span>
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
