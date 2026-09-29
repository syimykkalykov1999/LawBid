'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { StatusBadge } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** docs/06 §2.3 item 6 / §1.6: find the attorney, then the subscription
 * card on their user page (view for support, extend for finance). */
export default function SubscriptionsPage() {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['subscriptions-attorneys', q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/users', { params: { query: { q: q || undefined, role: 'attorney', cursor: pageParam, limit: 20 } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader title="Подписки и платежи" subtitle="Найдите адвоката — подписка, платежи, ссылка в Stripe и продление находятся в его карточке." />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft);
        }}
      >
        <div className="min-w-72 flex-1 space-y-1">
          <Label htmlFor="sq">Адвокат</Label>
          <Input id="sq" placeholder="имя, email, телефон, @username или id" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Статус</Th>
            <Th>Верификация</Th>
            <Th>Создан</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-canvas">
              <Td>
                <Link href={`/users/${u.id}`} className="font-medium text-navy hover:underline">
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : u.id)}
                </Link>
                {u.username ? <div className="text-xs text-muted">@{u.username}</div> : null}
              </Td>
              <Td>
                <StatusBadge status={u.status} />
              </Td>
              <Td>{u.verificationStatus ?? ''}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(u.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {list.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}
