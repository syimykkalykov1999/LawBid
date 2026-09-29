'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { CASE_STATUS, ISSUE_TYPE, partyName } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';

type Tab = 'disputes' | 'contact-issues';

/** docs/06 §2.3 item 5: the two support queues. */
export default function CasesQueuesPage() {
  const [tab, setTab] = useState<Tab>('disputes');
  const [resolved, setResolved] = useState(false);
  return (
    <>
      <PageHeader title="Кейсы" subtitle="Споры и обращения «Не могу связаться»; старые сверху." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['disputes', 'contact-issues'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm',
              tab === t ? 'border-navy bg-navy text-white' : 'border-line bg-surface hover:bg-canvas',
            )}
          >
            {t === 'disputes' ? 'Споры' : '«Не могу связаться»'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
          показать решённые
        </label>
      </div>
      {tab === 'disputes' ? <Disputes resolved={resolved} /> : <ContactIssues resolved={resolved} />}
    </>
  );
}

function Disputes({ resolved }: { resolved: boolean }) {
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
          {rows.map((d) => (
            <tr key={d.id} className="hover:bg-canvas">
              <Td>
                <Link href={`/cases/disputes/${d.id}`} className="font-medium text-navy hover:underline">
                  {d.case.title}
                </Link>
                <div className="text-xs text-muted">{CASE_STATUS[d.case.status] ?? d.case.status} · {d.case.stateCode}</div>
              </Td>
              <Td>{d.openedByRole === 'client' ? 'клиент' : d.openedByRole === 'attorney' ? 'адвокат' : '—'}</Td>
              <Td className="max-w-md text-xs">{d.reason}</Td>
              <Td className="text-xs">
                {partyName(d.case.client)} · {partyName(d.case.attorney)}
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(d.createdAt)}</Td>
              <Td>
                <Badge tone={d.status === 'open' ? 'gold' : 'neutral'}>{d.status === 'open' ? 'открыт' : 'решён'}</Badge>
              </Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Пусто
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function ContactIssues({ resolved }: { resolved: boolean }) {
  const q = useInfiniteQuery({
    queryKey: ['contact-issues', resolved],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/contact-issues', {
          params: { query: { status: resolved ? 'confirmed' : 'open', cursor: pageParam, limit: 30 } },
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
            <Th>Создано</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td>
                <Link href={`/cases/contact-issues/${r.id}`} className="font-medium text-navy hover:underline">
                  {r.case.title}
                </Link>
                <div className="text-xs text-muted">{CASE_STATUS[r.case.status] ?? r.case.status}</div>
              </Td>
              <Td className="text-xs">{partyName(r.attorney)}</Td>
              <Td className="text-xs">
                {r.case.client ? (
                  <Link href={`/users/${r.case.client.id}`} className="text-navy underline">
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
              <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Пусто
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
        Показать ещё
      </Button>
    </div>
  );
}
