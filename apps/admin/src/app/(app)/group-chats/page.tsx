'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = { owner: 'владелец', admin: 'админ', member: 'участник' };

/**
 * Owner 2026-10-20: group chats. Find a group by title, look at who is in
 * it, remove a person, or close the whole group. Every action lands in the
 * audit log by itself.
 */
export default function GroupChatsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['group-chats', term],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/group-chats', {
          params: { query: { q: term || undefined, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const detail = useQuery({
    queryKey: ['group-chat', open],
    enabled: open !== null,
    queryFn: async () =>
      (await api.GET('/admin/group-chats/{id}', { params: { path: { id: open! } } })).data!.data,
  });

  const removeMember = useMutation({
    mutationFn: async (input: { id: string; userId: string; name: string }) => {
      const ok = await confirm({
        title: `Убрать «${input.name}» из группы?`,
        description: 'Человек сразу потеряет доступ к группе и её переписке.',
        confirm: 'Убрать',
        danger: true,
      });
      if (!ok) return false;
      const r = await api.DELETE('/admin/group-chats/{id}/members/{userId}', {
        params: { path: { id: input.id, userId: input.userId } },
      });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Участник убран');
      void qc.invalidateQueries({ queryKey: ['group-chat'] });
      void qc.invalidateQueries({ queryKey: ['group-chats'] });
    },
    onError: (e) => toast.error(e),
  });

  const closeGroup = useMutation({
    mutationFn: async (input: { id: string; title: string }) => {
      const ok = await confirm({
        title: `Закрыть группу «${input.title}»?`,
        description: 'Группа исчезнет у всех участников. Это нельзя отменить.',
        confirm: 'Закрыть группу',
        danger: true,
      });
      if (!ok) return false;
      const r = await api.DELETE('/admin/group-chats/{id}', { params: { path: { id: input.id } } });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Группа закрыта');
      setOpen(null);
      void qc.invalidateQueries({ queryKey: ['group-chats'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Модерация"
        title="Группы"
        subtitle="Групповые чаты пользователей. Можно найти группу, посмотреть участников, убрать человека или закрыть группу целиком."
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <div className="min-w-64 flex-1 space-y-1">
          <Label htmlFor="q">Название группы</Label>
          <Input id="q" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Группа</Th>
            <Th>Владелец</Th>
            <Th>Участников</Th>
            <Th>Сообщений</Th>
            <Th>Опросов</Th>
            <Th>Создана</Th>
            <Th>Последнее</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={8} loading /> : null}
          {rows.map((g, i) => (
            <MotionRow key={g.id} i={i}>
              <Td className="max-w-xs">
                <div className="font-medium">{g.title}</div>
                {g.description ? <div className="line-clamp-2 text-xs text-muted">{g.description}</div> : null}
              </Td>
              <Td className="text-xs">{g.ownerName ?? '—'}</Td>
              <Td className="text-xs">{g.memberCount}</Td>
              <Td className="text-xs">{g.messageCount}</Td>
              <Td className="text-xs">{g.pollCount}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(g.createdAt)}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">
                {g.lastMessageAt ? formatDateTime(g.lastMessageAt) : '—'}
              </Td>
              <Td className="whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => setOpen(open === g.id ? null : g.id)}>
                  {open === g.id ? 'Скрыть' : 'Участники'}
                </Button>
              </Td>
            </MotionRow>
          ))}
          {!list.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={8}>{term ? 'Такой группы нет.' : 'Групп пока нет.'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <MoreButton show={list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />

      {open ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
          <ErrorNote text={detail.error ? errorText(detail.error) : null} />
          {detail.data ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-medium">{detail.data.title}</div>
                  <div className="text-xs text-muted">Участников: {detail.data.memberCount}</div>
                </div>
                <Button
                  variant="outline"
                  disabled={closeGroup.isPending}
                  onClick={() => closeGroup.mutate({ id: detail.data!.id, title: detail.data!.title })}
                >
                  Закрыть группу
                </Button>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Участник</Th>
                    <Th>Роль</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {detail.data.members.map((m) => (
                    <tr key={m.userId}>
                      <Td className="text-xs">{m.displayName ?? "—"}</Td>
                      <Td>
                        <Badge tone={m.role === 'member' ? 'neutral' : 'gold'} dot>
                          {ROLE_LABEL[m.role] ?? m.role}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {m.role === 'owner' ? null : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={removeMember.isPending}
                            onClick={() =>
                              removeMember.mutate({ id: detail.data!.id, userId: m.userId, name: m.displayName ?? '—' })
                            }
                          >
                            Убрать
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <div className="text-sm text-muted">Загрузка…</div>
          )}
        </div>
      ) : null}
    </>
  );
}
