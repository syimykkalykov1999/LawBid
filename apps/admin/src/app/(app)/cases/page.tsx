'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import { CASE_STATUS, CONTACT_ISSUE_STATUS, ISSUE_TYPE, label, PARTY_ROLE, partyName, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Tab = 'disputes' | 'contact-issues';
type DisputeStatus = 'open' | 'resolved';
type IssueStatus = 'open' | 'confirmed' | 'rejected';

const DISPUTE_STATUS: Record<string, string> = { open: 'открыт', resolved: 'решён' };

/** docs/06 §2.3 item 5: the two support queues. */
export default function CasesQueuesPage() {
  const [tab, setTab] = useState<Tab>('disputes');
  const [disputeStatus, setDisputeStatus] = useState<DisputeStatus>('open');
  const [issueStatus, setIssueStatus] = useState<IssueStatus>('open');
  return (
    <>
      <PageHeader eyebrow="Кейсы" title="Кейсы" subtitle="Споры и обращения «Не могу связаться»; старые сверху." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'disputes', label: 'Споры' },
            { value: 'contact-issues', label: '«Не могу связаться»' },
          ]}
        />
        {tab === 'disputes' ? (
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
      {tab === 'disputes' ? <Disputes status={disputeStatus} /> : <ContactIssues status={issueStatus} />}
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
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Кейс</Th>
            <Th>Кто открыл</Th>
            <Th>Причина</Th>
            <Th>Стороны</Th>
            <Th>Открыт</Th>
            <Th>Статус</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {rows.map((d, i) => (
            <MotionRow key={d.id} i={i} className="cursor-pointer" onClick={() => router.push(`/cases/disputes/${d.id}`)}>
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
          ))}
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
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Кейс</Th>
            <Th>Адвокат</Th>
            <Th>Клиент</Th>
            <Th>Причина</Th>
            <Th>Подтверждено</Th>
            <Th>Статус</Th>
            <Th>Создано</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={7} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i} className="cursor-pointer" onClick={() => router.push(`/cases/contact-issues/${r.id}`)}>
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
          ))}
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
