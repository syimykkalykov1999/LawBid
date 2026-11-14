'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { HoverPrefetchLink as Link } from '@/components/ui/hover-prefetch-link';
import { useRouter } from 'next/navigation';
import { CaseList } from '@/components/cases/case-list';
import { MotionRow } from '@/components/legacy/fade-in';
import { VirtualRows } from '@/components/ui/virtual-rows';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { SortTh, Table, TableEmpty, Td } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import { CASE_STATUS, CONTACT_ISSUE_STATUS, ISSUE_TYPE, label, PARTY_ROLE, partyName, StatusPill } from '@/lib/labels';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';
import { caseTabFrom, type CaseTab as Tab } from '@/lib/case-tabs';
import { replaceSearch, useSearch, useUrlState } from '@/lib/url-state';

type DisputeStatus = 'open' | 'resolved';
type IssueStatus = 'open' | 'confirmed' | 'rejected';
const DISPUTE_TABS: readonly DisputeStatus[] = ['open', 'resolved'];
const ISSUE_TABS: readonly IssueStatus[] = ['open', 'confirmed', 'rejected'];

const DISPUTE_STATUS: Record<string, string> = { open: 'открыт', resolved: 'решён' };
/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const DISPUTE_SORT = ['case', 'opener', 'reason', 'parties', 'opened', 'status'] as const;
const ISSUE_SORT = ['case', 'attorney', 'client', 'reason', 'confirmed', 'status', 'created'] as const;

/** docs/06 §2.3 item 5: the two support queues. */
export default function CasesQueuesPage() {
  const tab = caseTabFrom(new URLSearchParams(useSearch()).get('tab'));
  // Another tab starts clean: the list filters of «Все кейсы» do not follow it.
  const setTab = (t: Tab) =>
    replaceSearch({ tab: t === 'cases' ? null : t, dstatus: null, istatus: null, status: null, q: null, reports: null, state: null, deadline: null, sort: null, disputesSort: null, issuesSort: null });
  const [disputeStatus, setDisputeStatus] = useUrlState<DisputeStatus>('dstatus', 'open', DISPUTE_TABS);
  const [issueStatus, setIssueStatus] = useUrlState<IssueStatus>('istatus', 'open', ISSUE_TABS);
  return (
    <>
      <PageHeader eyebrow="Кейсы" title="Кейсы" subtitle="Все кейсы с модерацией, споры и обращения «Не могу связаться»." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'cases', label: 'Все кейсы' },
            { value: 'disputes', label: 'Споры' },
            { value: 'contact-issues', label: '«Не могу связаться»' },
          ]}
        />
        {tab === 'cases' ? null : tab === 'disputes' ? (
          <Tabs<DisputeStatus>
            size="sm"
            value={disputeStatus}
            onChange={setDisputeStatus}
            items={[
              { value: 'open', label: 'Открытые' },
              { value: 'resolved', label: 'Решённые' },
            ]}
          />
        ) : (
          <Tabs<IssueStatus>
            size="sm"
            value={issueStatus}
            onChange={setIssueStatus}
            items={[
              { value: 'open', label: 'Открытые' },
              { value: 'confirmed', label: 'Подтверждённые' },
              { value: 'rejected', label: 'Отклонённые' },
            ]}
          />
        )}
      </div>
      {tab === 'cases' ? <CaseList /> : tab === 'disputes' ? <Disputes status={disputeStatus} /> : <ContactIssues status={issueStatus} />}
    </>
  );
}

function Disputes({ status }: { status: DisputeStatus }) {
  const router = useRouter();
  const resolved = status === 'resolved';
  const q = useInfiniteQuery({
    queryKey: ['disputes', resolved],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/case-disputes', {
          params: { query: { status: resolved ? 'resolved' : 'open', cursor: pageParam, limit: 30 } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(DISPUTE_SORT, 'disputesSort');
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    case: (d) => d.case.title,
    opener: (d) => label(PARTY_ROLE, d.openedByRole),
    reason: (d) => d.reason,
    parties: (d) => `${partyName(d.case.client)} · ${partyName(d.case.attorney)}`,
    opened: (d) => d.createdAt,
    status: (d) => DISPUTE_STATUS[d.status] ?? d.status,
  });
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <SortTh {...header('case')}>Кейс</SortTh>
            <SortTh {...header('opener')}>Кто открыл</SortTh>
            <SortTh {...header('reason')}>Причина</SortTh>
            <SortTh {...header('parties')}>Стороны</SortTh>
            <SortTh {...header('opened')}>Открыт</SortTh>
            <SortTh {...header('status')}>Статус</SortTh>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          <VirtualRows rows={rows} colSpan={6}>
            {(d, i, vp) => (
            <MotionRow key={d.id} i={i} {...vp} className="cursor-pointer" onClick={() => router.push(`/cases/disputes/${d.id}`)}>
              <Td>
                <Link
                  href={`/cases/disputes/${d.id}`}
                  className="font-medium text-heading hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {d.case.title}
                </Link>
                <div className="text-xs text-muted">
                  {label(CASE_STATUS, d.case.status)} · {d.case.stateCode}
                </div>
              </Td>
              <Td>{label(PARTY_ROLE, d.openedByRole)}</Td>
              <Td className="max-w-md text-xs">{d.reason}</Td>
              <Td className="text-xs">
                {partyName(d.case.client)} · {partyName(d.case.attorney)}
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDateTime(d.createdAt)}</Td>
              <Td>
                <StatusPill map={DISPUTE_STATUS} value={d.status} />
              </Td>
            </MotionRow>
            )}
          </VirtualRows>
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={6}>{resolved ? 'Решённых споров нет' : 'Открытых споров нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function ContactIssues({ status }: { status: IssueStatus }) {
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ['contact-issues', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/contact-issues', {
          params: { query: { status, cursor: pageParam, limit: 30 } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(ISSUE_SORT, 'issuesSort');
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    case: (r) => r.case.title,
    attorney: (r) => partyName(r.attorney),
    client: (r) => (r.case.client ? partyName(r.case.client) : null),
    reason: (r) => ISSUE_TYPE[r.issueType] ?? r.issueType,
    confirmed: (r) => r.clientConfirmedReports,
    status: (r) => CONTACT_ISSUE_STATUS[r.status] ?? r.status,
    created: (r) => r.createdAt,
  });
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <SortTh {...header('case')}>Кейс</SortTh>
            <SortTh {...header('attorney')}>Адвокат</SortTh>
            <SortTh {...header('client')}>Клиент</SortTh>
            <SortTh {...header('reason')}>Причина</SortTh>
            <SortTh {...header('confirmed')}>Подтверждено</SortTh>
            <SortTh {...header('status')}>Статус</SortTh>
            <SortTh {...header('created')}>Создано</SortTh>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={7} loading /> : null}
          <VirtualRows rows={rows} colSpan={7}>
            {(r, i, vp) => (
            <MotionRow key={r.id} i={i} {...vp} className="cursor-pointer" onClick={() => router.push(`/cases/contact-issues/${r.id}`)}>
              <Td>
                <Link
                  href={`/cases/contact-issues/${r.id}`}
                  className="font-medium text-heading hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.case.title}
                </Link>
                <div className="text-xs text-muted">{label(CASE_STATUS, r.case.status)}</div>
              </Td>
              <Td className="text-xs">{partyName(r.attorney)}</Td>
              <Td className="text-xs">
                {r.case.client ? (
                  <Link
                    href={`/users/${r.case.client.id}`}
                    className="text-gold-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {partyName(r.case.client)}
                  </Link>
                ) : '—'}
              </Td>
              <Td className="text-xs">
                {ISSUE_TYPE[r.issueType] ?? r.issueType}
                {r.note ? <div className="text-muted">{r.note}</div> : null}
              </Td>
              <Td>
                <Badge tone={r.clientConfirmedReports >= r.suspendThreshold - 1 ? 'danger' : 'neutral'}>
                  {r.clientConfirmedReports} / {r.suspendThreshold}
                </Badge>
              </Td>
              <Td>
                <StatusPill map={CONTACT_ISSUE_STATUS} value={r.status} />
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
            </MotionRow>
            )}
          </VirtualRows>
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={7}>
              {status === 'open' ? 'Открытых обращений нет' : `Нет обращений со статусом «${CONTACT_ISSUE_STATUS[status]}»`}
            </TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  return <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />;
}
