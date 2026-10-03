'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { VerifiedBadge } from '@/components/verified-badge';
import { api, errorText } from '@/lib/api/client';
import { ROLE_TEXT, STATUS_LABEL, StatusBadge, StatusPill, VERIFICATION_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** The server's `role` filter enum (no `assistant` there yet). */
type Role = '' | 'client' | 'attorney' | 'admin';
type Status = '' | 'active' | 'suspended' | 'deletion_pending' | 'deleted';
const ROLE_FILTER: Exclude<Role, ''>[] = ['client', 'attorney', 'admin'];

/** docs/06 §2.3 item 3: search by name, email, phone, @username, id. */
export default function UsersPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [role, setRole] = useState<Role>('');
  const [status, setStatus] = useState<Status>('');
  const search = useDebounced(text.trim(), 300);
  const filters = { q: search, role, status };

  const q = useInfiniteQuery({
    queryKey: ['users', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/users', {
          params: {
            query: {
              q: filters.q || undefined,
              role: filters.role || undefined,
              status: filters.status || undefined,
              cursor: pageParam,
              limit: 20,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader eyebrow="Люди" title="Пользователи" subtitle="Поиск по имени, email, телефону, @username или id." />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
        <div className="min-w-72 flex-1 space-y-1">
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
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Пользователь</Th>
            <Th>Роль</Th>
            <Th>Статус</Th>
            <Th>Верификация</Th>
            <Th>Создан</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={5} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={5}>Никого не нашли. Измените запрос или фильтры.</TableEmpty>
          ) : (
            rows.map((u, i) => (
              <MotionRow key={u.id} i={i} className="cursor-pointer" onClick={() => router.push(`/users/${u.id}`)}>
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
                <Td>{u.role ? ROLE_TEXT[u.role] ?? u.role : '—'}</Td>
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
