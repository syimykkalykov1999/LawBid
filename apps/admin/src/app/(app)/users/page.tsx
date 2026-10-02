'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { ROLE_TEXT, STATUS_LABEL, StatusBadge } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Role = '' | 'client' | 'attorney' | 'admin';
type Status = '' | 'active' | 'suspended' | 'deletion_pending' | 'deleted';

/** docs/06 §2.3 item 3: search by name, email, phone, @username, id. */
export default function UsersPage() {
  const [draft, setDraft] = useState({ q: '', role: '' as Role, status: '' as Status });
  const [filters, setFilters] = useState(draft);
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
      <PageHeader title="Пользователи" subtitle="Имя, email, телефон, @username или id." />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <div className="min-w-72 flex-1 space-y-1">
          <Label htmlFor="q">Поиск</Label>
          <Input
            id="q"
            autoFocus
            placeholder="jane@example.com · (212) 555-0199 · @jane_esq · Jane Doe"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="role">Роль</Label>
          <Select id="role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            <option value="">любая</option>
            <option value="client">клиент</option>
            <option value="attorney">адвокат</option>
            <option value="admin">админ</option>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="status">Статус</Label>
          <Select id="status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
            <option value="">любой</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Найти</Button>
      </form>
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
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-surface-2">
              <Td>
                <Link href={`/users/${u.id}`} className="font-medium text-navy hover:underline">
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                </Link>
                <div className="text-xs text-muted">
                  {u.username ? `@${u.username} · ` : ''}
                  {u.id}
                </div>
              </Td>
              <Td>{u.role ? ROLE_TEXT[u.role] ?? u.role : '—'}</Td>
              <Td>
                <StatusBadge status={u.status} />
              </Td>
              <Td>{u.verificationStatus ?? ''}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(u.createdAt)}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-muted">
                Ничего не найдено
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}
