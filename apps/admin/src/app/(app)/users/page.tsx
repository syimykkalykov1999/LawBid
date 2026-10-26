'use client';

import { ArrowCounterClockwise, MagnifyingGlass, Prohibit, SignOut } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BulkBar,
  bulkData,
  EMPTY_FILTER,
  FilterFields,
  type ListFilter,
  PageSelectBox,
  RowSelectBox,
  useBulkRun,
  useSelection,
} from '@/components/bulk/bulk-controls';
import { CsvButton } from '@/components/csv-button';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { VerifiedBadge } from '@/components/verified-badge';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { dayBounds, type Noun } from '@/lib/bulk';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { US_STATES } from '@/lib/us-states';
import { ROLE_TEXT, STATUS_LABEL, StatusBadge, StatusPill, VERIFICATION_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** The server's `role` filter enum (no `assistant` there yet). */
type Role = '' | 'client' | 'attorney' | 'admin';
type Status = '' | 'active' | 'suspended' | 'deletion_pending' | 'deleted';
const ROLE_FILTER: Exclude<Role, ''>[] = ['client', 'attorney', 'admin'];
type BulkAction = components['schemas']['AdminUsersBulkAction'];
/** Mirrors the server's BULK_PREVIEW_CAP (admin-users.service.ts). */
const BULK_CAP = 500;
const USERS: Noun = ['пользователь', 'пользователя', 'пользователей'];

/** Owner 2026-10-04: bulk actions on users, same rights as the single ones. */
const ACTION_TEXT: Record<BulkAction, { verb: string; done: string; describe: string; danger?: boolean }> = {
  suspend: {
    verb: 'Заблокировать',
    done: 'Заблокировано',
    describe: 'Сеансы завершатся сразу, открытые дела клиентов уйдут в архив, профили адвокатов скроются. Уже заблокированные пропустим.',
    danger: true,
  },
  restore: { verb: 'Разблокировать', done: 'Разблокировано', describe: 'Аккаунты снова станут активны. Не заблокированные пропустим.' },
  logout: { verb: 'Завершить сеансы', done: 'Сеансы завершены', describe: 'Пользователям придётся войти заново на всех устройствах.' },
};

/** docs/06 §2.3 item 3: search by name, email, phone, @username, id. */
export default function UsersPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [role, setRole] = useState<Role>('');
  const [status, setStatus] = useState<Status>('');
  const [stateCode, setStateCode] = useState('');
  const [dates, setDates] = useState<ListFilter>(EMPTY_FILTER);
  const search = useDebounced(text.trim(), 300);
  const filters = { q: search, role, status, stateCode, ...dayBounds(dates.from, dates.to) };
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canWrite = can(me, 'users', 'manage');
  const sel = useSelection(JSON.stringify(filters));
  // S18-10: «select all by filter» keeps the FILTER, not 2 000 ids: the
  // server resolves the users itself (preview count first).
  const [byFilter, setByFilter] = useState<{ count: number; capped: boolean } | null>(null);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setByFilter(null), [filterKey]);
  const filterBody = {
    q: filters.q || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
    stateCode: filters.stateCode || undefined,
    from: filters.from,
    to: filters.to,
  };
  const bulk = useBulkRun();
  const fetchPage = async (cursor?: string, limit = 20) =>
    (
      await api.GET('/admin/users', {
        params: {
          query: {
            q: filters.q || undefined,
            role: filters.role || undefined,
            status: filters.status || undefined,
            stateCode: filters.stateCode || undefined,
            from: filters.from,
            to: filters.to,
            cursor,
            limit,
          },
        },
      })
    ).data!;
  const onBulk = (action: BulkAction) => {
    const t = ACTION_TEXT[action];
    bulk.run({
      ids: byFilter ? [] : [...sel.selected],
      count: byFilter?.count,
      sendAll: byFilter
        ? async (reason) =>
            bulkData(await api.POST('/admin/users/bulk', { body: { action, filter: filterBody, reason } }))
        : undefined,
      verb: t.verb,
      doneVerb: t.done,
      noun: USERS,
      danger: t.danger,
      description: t.describe,
      send: async (ids, reason) => bulkData(await api.POST('/admin/users/bulk', { body: { action, ids, reason } })),
      onDone: () => {
        sel.clear();
        setByFilter(null);
        void qc.invalidateQueries({ queryKey: ['users'] });
      },
    });
  };

  const q = useInfiniteQuery({
    queryKey: ['users', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader eyebrow="Люди" title="Пользователи" subtitle="Поиск по имени, email, телефону, @username или id." />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
        <div className="min-w-0 flex-1 space-y-1 sm:min-w-72">
          <Label htmlFor="q">Поиск</Label>
          <div className="relative">
            <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input
              id="q"
              autoFocus
              className="pl-9"
              placeholder="jane@example.com · (212) 555-0199 · @jane_esq · Jane Doe"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="role">Роль</Label>
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="">любая</option>
            {ROLE_FILTER.map((r) => (
              <option key={r} value={r}>
                {ROLE_TEXT[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="status">Статус</Label>
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="">любой</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="state">Штат</Label>
          <Select id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
            <option value="">любой</option>
            {US_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.code} · {st.name}
              </option>
            ))}
          </Select>
        </div>
        <FilterFields id="uf" value={dates} onChange={setDates} />
        <CsvButton entity="users" />
      </div>
      {bulk.dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={byFilter ? byFilter.count : sel.selected.size}
          noun={USERS}
          cap={BULK_CAP}
          onClear={() => {
            sel.clear();
            setByFilter(null);
          }}
          onSelectAll={async () => {
            const p = (await api.POST('/admin/users/bulk/preview', { body: { filter: filterBody } })).data!.data;
            sel.clear();
            setByFilter({ count: p.matched, capped: p.capped });
            return p.capped;
          }}
        >
          <Button size="sm" variant="outline" className="text-danger" disabled={bulk.pending} onClick={() => onBulk('suspend')}>
            <Prohibit size={14} /> Заблокировать
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.pending} onClick={() => onBulk('restore')}>
            <ArrowCounterClockwise size={14} /> Разблокировать
          </Button>
          <Button size="sm" variant="outline" disabled={bulk.pending} onClick={() => onBulk('logout')}>
            <SignOut size={14} /> Завершить сеансы
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canWrite ? (
              <Th className="w-8">
                <PageSelectBox selected={sel.selected} ids={rows.map((u) => u.id)} onToggle={(ids) => {
                    setByFilter(null);
                    sel.togglePage(ids);
                  }}
                />
              </Th>
            ) : null}
            <Th>Пользователь</Th>
            <Th>Роль</Th>
            <Th>Статус</Th>
            <Th>Верификация</Th>
            <Th>Создан</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={canWrite ? 6 : 5} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={canWrite ? 6 : 5}>Никого не нашли. Измените запрос или фильтры.</TableEmpty>
          ) : (
            rows.map((u, i) => (
              <MotionRow key={u.id} i={i} className="cursor-pointer" onClick={() => router.push(`/users/${u.id}`)}>
                {canWrite ? (
                  <Td>
                    <RowSelectBox selected={sel.selected} id={u.id} onToggle={(id) => {
                      setByFilter(null);
                      sel.toggle(id);
                    }}
                  />
                  </Td>
                ) : null}
                <Td>
                  <Link
                    href={`/users/${u.id}`}
                    className="font-medium text-heading hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—'}
                  </Link>
                  {u.verificationStatus === 'verified' ? (
                    <VerifiedBadge kind="attorney" className="ml-1.5" />
                  ) : null}
                  <div className="text-xs text-faint">
                    {u.username ? `@${u.username} · ` : ''}
                    <span className="font-mono">{u.id}</span>
                  </div>
                </Td>
                <Td>
                  {u.role ? ROLE_TEXT[u.role] ?? u.role : '—'}
                  {u.countryCode && u.countryCode !== 'US' ? (
                    <span className="ml-1.5 font-mono text-xs text-faint">{u.countryCode}</span>
                  ) : null}
                </Td>
                <Td>
                  <StatusBadge status={u.status} />
                </Td>
                <Td>
                  <StatusPill map={VERIFICATION_STATUS} value={u.verificationStatus} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(u.createdAt)}</Td>
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
