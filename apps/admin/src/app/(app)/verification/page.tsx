'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { RegistryFlags } from '@/components/registries/registry-flags';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SortTh, Table, TableEmpty, Td } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import { REQUEST_STATUS, StatusPill } from '@/lib/labels';
import { queueSearch } from '@/lib/registry-conveyor';
import { VERIFICATION_REVIEW_PATH } from '@/lib/review-flow';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { useUrlSearchText, useUrlState } from '@/lib/url-state';
import { WAIT_TONE_CLASS, waitThresholds, waitTone, waitToneTitle } from '@/lib/verification-sla';

type QueueStatus = '' | 'submitted' | 'needs_more_info' | 'in_review' | 'registry';
/** Row 57: click-to-sort headers (the loaded rows; default order = the server's, old first). */
const SORT_KEYS = ['attorney', 'states', 'status', 'submitted', 'waiting', 'reviewer'] as const;
const QUEUE_STATUSES: readonly QueueStatus[] = ['', 'submitted', 'needs_more_info', 'in_review', 'registry'];

/** docs/06 §2.3 item 2 — the verifier queue over the file-03 API. */
export default function VerificationQueuePage() {
  const router = useRouter();
  // Scout 13.11 (row 96): the tab and the state live in the address — the
  // same `?status=…&stateCode=…` the card carries — so «Назад» from a card
  // and «К списку» come back to this filter.
  const [status, setStatus] = useUrlState<QueueStatus>('status', '', QUEUE_STATUSES);
  const { text: stateText, setText: setStateText, value: stateRaw } = useUrlSearchText('stateCode');
  const stateCode = stateRaw.toUpperCase();
  // The amber / red thresholds (settings; the shared ['config'] cache, kept 10 minutes).
  const config = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data,
    staleTime: 10 * 60_000,
  });
  const sla = waitThresholds(config.data);
  const registry = status === 'registry';
  const filters = { status: registry ? '' : status, stateCode };
  const q = useInfiniteQuery({
    queryKey: ['verification-queue', filters],
    enabled: !registry,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/verification/requests', {
          params: {
            query: {
              status: filters.status || undefined,
              stateCode: filters.stateCode.length === 2 ? filters.stateCode : undefined,
              cursor: pageParam,
              limit: 50,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const now = Date.now();
  const { sort, header } = useTableSort(SORT_KEYS);
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    attorney: (r) => [r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || r.attorney.username,
    states: (r) => r.stateCodes.join(', '),
    status: (r) => REQUEST_STATUS[r.status] ?? r.status,
    submitted: (r) => r.submittedAt,
    // waiting longer = submitted earlier
    waiting: (r) => (r.submittedAt ? now - new Date(r.submittedAt).getTime() : null),
    reviewer: (r) => r.reviewerId,
  });
  // R-400: the card carries the filter, so «после решения — следующая» stays inside it.
  const href = (id: string) => `/verification/${id}${queueSearch(filters)}`;

  return (
    <>
      <PageHeader
        eyebrow="Люди"
        title="Верификация"
        subtitle="Очередь заявок адвокатов, старые сверху."
        actions={
          // Owner 2026-10-28: review one after another without coming back here.
          <Link href={VERIFICATION_REVIEW_PATH} className={buttonVariants({ variant: 'gold', size: 'sm' })}>
            Проверять подряд
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<QueueStatus>
          value={status}
          onChange={setStatus}
          items={[
            { value: '', label: 'Все ожидающие' },
            { value: 'submitted', label: REQUEST_STATUS.submitted },
            { value: 'in_review', label: REQUEST_STATUS.in_review },
            { value: 'needs_more_info', label: REQUEST_STATUS.needs_more_info },
            // Owner 2026-10-05: self-attested licenses the state registry did not confirm.
            { value: 'registry', label: 'Сверка с реестром' },
          ]}
        />
        {registry ? null : (
          <Input
            aria-label="Штат"
            className="w-28 uppercase"
            maxLength={2}
            placeholder="Штат: NY"
            value={stateText}
            onChange={(e) => setStateText(e.target.value)}
          />
        )}
      </div>
      {registry ? (
        <RegistryFlags />
      ) : (
        <>
          <ErrorNote text={q.error ? errorText(q.error) : null} />
          <Table>
            <thead>
              <tr>
                <SortTh {...header('attorney')}>Адвокат</SortTh>
                <SortTh {...header('states')}>Штаты</SortTh>
                <SortTh {...header('status')}>Статус</SortTh>
                <SortTh {...header('submitted')}>Подана</SortTh>
                <SortTh {...header('waiting')}>Ожидает</SortTh>
                <SortTh {...header('reviewer')}>Проверяющий</SortTh>
              </tr>
            </thead>
            <tbody>
              {q.isPending ? (
                <TableEmpty colSpan={6} loading />
              ) : rows.length === 0 && !q.isError ? (
                <TableEmpty colSpan={6}>Очередь пуста — новых заявок нет.</TableEmpty>
              ) : (
                rows.map((r, i) => (
                  <MotionRow
                    key={r.id}
                    i={i}
                    className="cursor-pointer"
                    onClick={() => router.push(href(r.id))}
                  >
                    <Td>
                      <Link
                        href={href(r.id)}
                        className="font-medium text-heading hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') ||
                          `@${r.attorney.username}`}
                      </Link>
                      <div className="text-xs text-faint">
                        @{r.attorney.username}
                        {r.adminNote ? ` · ${r.adminNote}` : ''}
                      </div>
                    </Td>
                    <Td>
                      {r.stateCodes.join(', ')}
                      {/* Owner 2026-10-18: a number sent for manual review. */}
                      {r.formatReview ? (
                        <div className="mt-1">
                          <Badge tone="warning">Номер не по формату штата — проверить вручную</Badge>
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusPill map={REQUEST_STATUS} value={r.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(r.submittedAt)}</Td>
                    {(() => {
                      const waited = r.submittedAt ? Math.floor((now - new Date(r.submittedAt).getTime()) / 1000) : null;
                      const tone = waitTone(waited, sla);
                      return (
                        <Td className={`whitespace-nowrap tabular-nums ${WAIT_TONE_CLASS[tone]}`}>
                          <span title={waitToneTitle(tone, sla)} data-wait-tone={tone}>
                            {waited === null ? '—' : formatDuration(waited)}
                          </span>
                        </Td>
                      );
                    })()}
                    <Td className="font-mono text-xs text-muted">{r.reviewerId ? r.reviewerId.slice(0, 8) : '—'}</Td>
                  </MotionRow>
                ))
              )}
            </tbody>
          </Table>
          <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
        </>
      )}
    </>
  );
}
