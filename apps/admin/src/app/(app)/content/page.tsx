'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { CsvButton } from '@/components/csv-button';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { ClientReviewsPanel, RestoreContentButton } from '@/components/content/client-reviews-panel';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { CONTENT_STATUS, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Tab = 'posts' | 'comments' | 'reviews' | 'client-reviews';

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
        eyebrow="Модерация"
        title="Посты и отзывы"
        subtitle="Публикации, новости, комментарии и отзывы. Удаление — с причиной, автор получает уведомление."
      />
      {dialog}
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'posts', label: 'Публикации и новости' },
          { value: 'comments', label: 'Комментарии' },
          { value: 'reviews', label: 'Отзывы об адвокатах' },
          { value: 'client-reviews', label: 'Отзывы о клиентах' },
        ]}
      />
      {tab === 'posts' ? (
        <Posts ask={ask} />
      ) : tab === 'comments' ? (
        <Comments ask={ask} />
      ) : tab === 'reviews' ? (
        <Reviews ask={ask} />
      ) : (
        <ClientReviewsPanel />
      )}
    </>
  );
}

type Ask = ReturnType<typeof useReason>['ask'];

const REVIEW_STATUS: Record<string, string> = { ...CONTENT_STATUS, published: 'виден' };

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  return <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />;
}

function SearchBox({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="w-80 space-y-1">
      <Label htmlFor={id}>Поиск</Label>
      <div className="relative">
        <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <Input id={id} className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

function Posts({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
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
    onSuccess: () => {
      toast.success('Публикация удалена, автор получит уведомление');
      void qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox id="pq" value={input} onChange={setInput} placeholder="Заголовок или текст" />
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
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Публикация</Th>
            <Th>Автор</Th>
            <Th>Квалификация</Th>
            <Th>Лайки / комм.</Th>
            <Th>Создана</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {rows.map((p, i) => (
            <MotionRow key={p.id} i={i}>
              <Td className="max-w-md">
                {p.kind === 'news' ? <Badge tone="gold">новость</Badge> : null}
                <div className="font-medium text-heading">{p.title ?? '—'}</div>
                <div className="line-clamp-2 text-xs text-muted">{p.body}</div>
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${p.authorId}`} className="text-gold-600 hover:underline">
                  {p.authorName}
                </Link>
              </Td>
              <Td className="text-xs">{p.practice ?? '—'}</Td>
              <Td className="text-xs tabular-nums">
                {p.likes} / {p.comments}
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(p.createdAt)}</Td>
              <Td>
                {p.status !== 'published' && !p.deleted ? (
                  <RestoreContentButton kind="post" id={p.id} onDone={() => void q.refetch()} />
                ) : (
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
                )}
              </Td>
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={6}>{text ? 'Ничего не найдено' : 'Публикаций пока нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function Comments({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
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
    onSuccess: () => {
      toast.success('Комментарий удалён');
      void qc.invalidateQueries({ queryKey: ['admin-comments'] });
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox id="cq" value={input} onChange={setInput} placeholder="Текст комментария" />
        <div className="w-48 space-y-1">
          <Label htmlFor="ct">Где</Label>
          <Select id="ct" value={thread} onChange={(e) => setThread(e.target.value as 'post' | 'case')}>
            <option value="post">под публикациями</option>
            <option value="case">под кейсами</option>
          </Select>
        </div>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
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
          {q.isPending ? <TableEmpty colSpan={5} loading /> : null}
          {rows.map((c, i) => (
            <MotionRow key={c.id} i={i}>
              <Td className="max-w-md text-sm">{c.body}</Td>
              <Td className="text-xs">
                <Link href={`/users/${c.authorId}`} className="text-gold-600 hover:underline">
                  {c.authorName}
                </Link>
              </Td>
              <Td className="max-w-xs text-xs">
                {thread === 'case' ? (
                  <Link href={`/cases/${c.targetId}`} className="text-gold-600 hover:underline">
                    {c.targetTitle ?? '—'}
                  </Link>
                ) : (
                  c.targetTitle ?? '—'
                )}
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(c.createdAt)}</Td>
              <Td>
                {c.status !== 'published' ? (
                  <RestoreContentButton kind={thread === 'case' ? 'case-comment' : 'comment'} id={c.id} onDone={() => void q.refetch()} />
                ) : (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const r = await ask({ title: 'Удалить комментарий', description: 'Автор получит уведомление с причиной.', confirm: 'Удалить', danger: true });
                    if (r) remove.mutate({ id: c.id, reason: r.text });
                  }}
                >
                  Удалить
                </Button>
                )}
              </Td>
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={5}>{text ? 'Ничего не найдено' : 'Комментариев пока нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}

function Reviews({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
  const q = useInfiniteQuery({
    queryKey: ['admin-reviews', text],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/content/reviews', { params: { query: { q: text || undefined, cursor: pageParam } } })).data!,
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
            // The restore route takes no body; the reason travels like other
            // justifications (encoded — Cyrillic breaks fetch headers).
            headers: input.reason ? { 'X-Justification': encodeURIComponent(input.reason) } : undefined,
          });
      if (r.error) throw r.error;
      return input.hide;
    },
    onSuccess: (hidden) => {
      toast.success(hidden ? 'Отзыв скрыт' : 'Отзыв снова виден');
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox id="rq" value={input} onChange={setInput} placeholder="Текст отзыва, адвокат или клиент" />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
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
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
              <Td className="max-w-md">
                <div className="text-gold-600">
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </div>
                <div className="line-clamp-3 text-xs">{r.body ?? 'без текста'}</div>
              </Td>
              <Td className="text-xs">{r.attorneyName}</Td>
              <Td className="text-xs">{r.clientName}</Td>
              <Td className="max-w-xs text-xs">{r.caseTitle}</Td>
              <Td>
                <StatusPill map={REVIEW_STATUS} value={r.status} />
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={async () => {
                      const res = await ask({ title: 'Показать отзыв снова', description: 'Отзыв снова появится в профиле. Причина нужна для журнала.', confirm: 'Показать' });
                      if (res) act.mutate({ id: r.id, hide: false, reason: res.text });
                    }}
                  >
                    Показать
                  </Button>
                ) : null}
              </Td>
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={6}>{text ? 'Ничего не найдено' : 'Отзывов нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}
