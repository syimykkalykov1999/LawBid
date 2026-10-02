'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { CsvButton } from '@/components/csv-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { cn, formatDateTime } from '@/lib/utils';

type Tab = 'posts' | 'comments' | 'reviews';

/**
 * Owner 2026-09-30 — every post / news, every comment (posts and cases)
 * and every review in one place: search, remove with a reason (the author
 * gets a moderation notice), hide / show reviews.
 */
export default function ContentPage() {
  const [tab, setTab] = useState<Tab>('posts');
  const { ask, dialog } = useReason();
  return (
    <>
      <PageHeader
        title="Контент"
        subtitle="Публикации, новости, комментарии и отзывы. Удаление — с причиной, автор получает уведомление."
      />
      {dialog}
      <div className="mb-4 flex gap-2">
        {(
          [
            ['posts', 'Публикации и новости'],
            ['comments', 'Комментарии'],
            ['reviews', 'Отзывы'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm',
              tab === t ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-surface',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'posts' ? <Posts ask={ask} /> : tab === 'comments' ? <Comments ask={ask} /> : <Reviews ask={ask} />}
    </>
  );
}

type Ask = ReturnType<typeof useReason>['ask'];

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  return q.hasNextPage ? (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
        Показать ещё
      </Button>
    </div>
  ) : null;
}

function Posts({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'' | 'post' | 'news'>('');
  const q = useInfiniteQuery({
    queryKey: ['admin-posts', text, kind],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/content/posts', {
          params: { query: { q: text || undefined, kind: kind || undefined, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const remove = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const r = await api.POST('/admin/content/posts/{id}/remove', {
        params: { path: { id: input.id } },
        body: { reason: input.reason },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-posts'] }),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-80 space-y-1">
          <Label htmlFor="pq">Поиск</Label>
          <Input id="pq" value={text} onChange={(e) => setText(e.target.value)} placeholder="Заголовок или текст" />
        </div>
        <div className="w-48 space-y-1">
          <Label htmlFor="pk">Тип</Label>
          <Select id="pk" value={kind} onChange={(e) => setKind(e.target.value as '' | 'post' | 'news')}>
            <option value="">все</option>
            <option value="post">публикации</option>
            <option value="news">новости</option>
          </Select>
        </div>
        <CsvButton entity="posts" />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : remove.error ? errorText(remove.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Публикация</Th>
            <Th>Автор</Th>
            <Th>Квалификация</Th>
            <Th>❤ / 💬</Th>
            <Th>Создана</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2">
              <Td className="max-w-md">
                {p.kind === 'news' ? <Badge tone="gold">новость</Badge> : null}
                <div className="font-medium">{p.title ?? '—'}</div>
                <div className="line-clamp-2 text-xs text-muted">{p.body}</div>
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${p.authorId}`} className="text-navy underline">
                  {p.authorName}
                </Link>
              </Td>
              <Td className="text-xs">{p.practice ?? '—'}</Td>
              <Td className="text-xs">
                {p.likes} / {p.comments}
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(p.createdAt)}</Td>
              <Td>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const r = await ask({ title: 'Удалить публикацию', description: 'Автор получит уведомление с причиной.', confirm: 'Удалить', danger: true });
                    if (r) remove.mutate({ id: p.id, reason: r.text });
                  }}
                >
                  Удалить
                </Button>
              </Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Ничего не найдено
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function Comments({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [thread, setThread] = useState<'post' | 'case'>('post');
  const q = useInfiniteQuery({
    queryKey: ['admin-comments', text, thread],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/content/comments', {
          params: { query: { q: text || undefined, thread, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const remove = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const r = await api.POST('/admin/content/comments/{id}/remove', {
        params: { path: { id: input.id } },
        body: { reason: input.reason, thread },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-comments'] }),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-80 space-y-1">
          <Label htmlFor="cq">Поиск</Label>
          <Input id="cq" value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст комментария" />
        </div>
        <div className="w-48 space-y-1">
          <Label htmlFor="ct">Где</Label>
          <Select id="ct" value={thread} onChange={(e) => setThread(e.target.value as 'post' | 'case')}>
            <option value="post">под публикациями</option>
            <option value="case">под кейсами</option>
          </Select>
        </div>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : remove.error ? errorText(remove.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Комментарий</Th>
            <Th>Автор</Th>
            <Th>{thread === 'post' ? 'Публикация' : 'Кейс'}</Th>
            <Th>Создан</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2">
              <Td className="max-w-md text-sm">{c.body}</Td>
              <Td className="text-xs">
                <Link href={`/users/${c.authorId}`} className="text-navy underline">
                  {c.authorName}
                </Link>
              </Td>
              <Td className="max-w-xs text-xs">
                {thread === 'case' ? (
                  <Link href={`/cases/${c.targetId}`} className="text-navy underline">
                    {c.targetTitle ?? '—'}
                  </Link>
                ) : (
                  c.targetTitle ?? '—'
                )}
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(c.createdAt)}</Td>
              <Td>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const r = await ask({ title: 'Удалить комментарий', confirm: 'Удалить', danger: true });
                    if (r) remove.mutate({ id: c.id, reason: r.text });
                  }}
                >
                  Удалить
                </Button>
              </Td>
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
      <More q={q} />
    </>
  );
}

function Reviews({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['admin-reviews'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/content/reviews', { params: { query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const act = useMutation({
    mutationFn: async (input: { id: string; hide: boolean; reason?: string }) => {
      const r = input.hide
        ? await api.POST('/admin/content/reviews/{id}/hide', {
            params: { path: { id: input.id } },
            body: { reason: input.reason ?? '' },
          })
        : await api.POST('/admin/content/reviews/{id}/restore', {
            params: { path: { id: input.id } },
          });
      if (r.error) throw r.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : act.error ? errorText(act.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Отзыв</Th>
            <Th>Адвокат</Th>
            <Th>Клиент</Th>
            <Th>Кейс</Th>
            <Th>Статус</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              <Td className="max-w-md">
                <div className="text-gold">
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </div>
                <div className="line-clamp-3 text-xs">{r.body ?? 'без текста'}</div>
              </Td>
              <Td className="text-xs">{r.attorneyName}</Td>
              <Td className="text-xs">{r.clientName}</Td>
              <Td className="max-w-xs text-xs">{r.caseTitle}</Td>
              <Td>
                <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>
                  {r.status === 'published' ? 'виден' : r.status === 'hidden' ? 'скрыт' : 'удалён'}
                </Badge>
              </Td>
              <Td>
                {r.status === 'published' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={async () => {
                      const res = await ask({ title: 'Скрыть отзыв', description: 'Автор отзыва получит уведомление.', confirm: 'Скрыть' });
                      if (res) act.mutate({ id: r.id, hide: true, reason: res.text });
                    }}
                  >
                    Скрыть
                  </Button>
                ) : r.status === 'hidden' ? (
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, hide: false })}>
                    Показать
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Отзывов нет
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}
