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
import {
  AuthorFilterButton,
  BulkBar,
  bulkData,
  EMPTY_FILTER,
  FilterFields,
  filterKey,
  type ListFilter,
  PageSelectBox,
  RowSelectBox,
  useBulkRun,
  useSelection,
} from '@/components/bulk/bulk-controls';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { collectIds, dayBounds, type Noun } from '@/lib/bulk';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { CONTENT_STATUS, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Tab = 'posts' | 'comments' | 'reviews' | 'client-reviews';
type BulkType = components['schemas']['AdminBulkContentType'];
type BulkAction = components['schemas']['AdminBulkContentAction'];

const POSTS: Noun = ['публикацию', 'публикации', 'публикаций'];
const COMMENTS: Noun = ['комментарий', 'комментария', 'комментариев'];
const REVIEWS: Noun = ['отзыв', 'отзыва', 'отзывов'];

/** Owner 2026-10-04: one bulk endpoint for posts, comments and reviews. */
async function sendBulk(action: BulkAction, type: BulkType, ids: string[], reason: string) {
  return bulkData(await api.POST('/admin/content/bulk', { body: { action, type, ids, reason } }));
}

const filterQuery = (f: ListFilter) => ({ authorId: f.author?.id, ...dayBounds(f.from, f.to) });

function useCanModerate() {
  const { data: me } = useMe();
  return can(me, 'content', 'manage');
}

/** The three bulk buttons; [actions] picks which apply to the list. */
function BulkActions({
  actions,
  pending,
  onAction,
}: {
  actions: BulkAction[];
  pending: boolean;
  onAction: (a: BulkAction) => void;
}) {
  return (
    <>
      {actions.includes('remove') ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => onAction('remove')}>
          Удалить
        </Button>
      ) : null}
      {actions.includes('hide') ? (
        <Button size="sm" variant="danger-soft" disabled={pending} onClick={() => onAction('hide')}>
          Скрыть
        </Button>
      ) : null}
      {actions.includes('restore') ? (
        <Button size="sm" variant="soft" disabled={pending} onClick={() => onAction('restore')}>
          Вернуть
        </Button>
      ) : null}
    </>
  );
}

const ACTION_TEXT: Record<BulkAction, { verb: string; done: string; danger: boolean; describe: (what: string) => string }> = {
  remove: { verb: 'Удалить', done: 'Удалено', danger: true, describe: (w) => `${w} пропадут у всех. Каждый автор получит уведомление с этой причиной. Уже удалённые будут пропущены.` },
  hide: { verb: 'Скрыть', done: 'Скрыто', danger: true, describe: (w) => `${w} скроются. Каждый автор получит уведомление с этой причиной.` },
  restore: { verb: 'Вернуть', done: 'Возвращено', danger: false, describe: (w) => `${w} снова станут видны. Удалённые авторами и те, у кого снято видео, будут пропущены.` },
};

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
        subtitle="Публикации, новости, комментарии и отзывы. Удаление — с причиной, автор получает уведомление. Отметьте строки галочками, чтобы удалить, скрыть или вернуть сразу много."
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
    <div className="w-full space-y-1 sm:w-80">
      <Label htmlFor={id}>Поиск</Label>
      <div className="relative">
        <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <Input id={id} className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

const CLASS_ACTION_TEXT: Record<'legal' | 'general' | 'auto', string> = {
  legal: 'Отмечено юридическими',
  general: 'Отмечено обычными',
  auto: 'Вид снова по теме',
};

function Posts({ ask }: { ask: Ask }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
  const [kind, setKind] = useState<'' | 'post' | 'news'>('');
  const [onlyVideo, setOnlyVideo] = useState(false);
  // Owner 2026-10-05: legal posts vs general (personal) posts.
  const [contentClass, setContentClass] = useState<'' | 'legal' | 'general'>('');
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const canWrite = useCanModerate();
  const sel = useSelection(`${text}|${kind}|${onlyVideo}|${contentClass}|${filterKey(filter)}`);
  const bulk = useBulkRun();
  const fetchPage = async (cursor: string | undefined) =>
    (
      await api.GET('/admin/content/posts', {
        params: {
          query: {
            q: text || undefined,
            kind: kind || undefined,
            media: onlyVideo ? 'video' : undefined,
            contentClass: contentClass || undefined,
            cursor,
            ...filterQuery(filter),
          },
        },
      })
    ).data!;
  const q = useInfiniteQuery({
    queryKey: ['admin-posts', text, kind, onlyVideo, contentClass, filterKey(filter)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const onBulk = (action: BulkAction) => {
    const t = ACTION_TEXT[action];
    bulk.run({
      ids: [...sel.selected],
      verb: t.verb,
      doneVerb: t.done,
      noun: POSTS,
      danger: t.danger,
      description: t.describe('Выбранные публикации'),
      send: (ids, reason) => sendBulk(action, 'post', ids, reason),
      onDone: () => {
        sel.clear();
        void qc.invalidateQueries({ queryKey: ['admin-posts'] });
      },
    });
  };
  const classify = useMutation({
    mutationFn: async (to: 'legal' | 'general' | 'auto') => {
      const r = await api.POST('/admin/content/posts/classify', {
        body: { ids: [...sel.selected], contentClass: to },
      });
      if (r.error) throw r.error;
      return { to, done: r.data!.data.done.length };
    },
    onSuccess: ({ to, done }) => {
      toast.success(`${CLASS_ACTION_TEXT[to]}: ${done}`);
      sel.clear();
      void qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e) => toast.error(e),
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
        <div className="w-48 space-y-1">
          <Label htmlFor="pm">Вложение</Label>
          <Select id="pm" value={onlyVideo ? 'video' : ''} onChange={(e) => setOnlyVideo(e.target.value === 'video')}>
            <option value="">любые</option>
            <option value="video">с видео (бывшие рилсы)</option>
          </Select>
        </div>
        <div className="w-48 space-y-1">
          <Label htmlFor="pc">Вид</Label>
          <Select id="pc" value={contentClass} onChange={(e) => setContentClass(e.target.value as '' | 'legal' | 'general')}>
            <option value="">все</option>
            <option value="legal">юридические</option>
            <option value="general">обычные (личные)</option>
          </Select>
        </div>
        <FilterFields id="pf" value={filter} onChange={setFilter} />
        <CsvButton entity="posts" />
      </div>
      {bulk.dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={POSTS}
          onClear={sel.clear}
          onSelectAll={async () => {
            const r = await collectIds(async (c) => {
              const p = await fetchPage(c);
              return { data: p.data, nextCursor: p.meta?.nextCursor };
            });
            sel.replace(r.ids);
            return r.capped;
          }}
        >
          <BulkActions actions={['remove', 'hide', 'restore']} pending={bulk.pending} onAction={onBulk} />
          {/* Owner 2026-10-05: reclassify; kept through the author's edits. */}
          <Button size="sm" variant="outline" disabled={classify.isPending} onClick={() => classify.mutate('legal')}>
            Юридические
          </Button>
          <Button size="sm" variant="outline" disabled={classify.isPending} onClick={() => classify.mutate('general')}>
            Обычные
          </Button>
          <Button size="sm" variant="ghost" disabled={classify.isPending} onClick={() => classify.mutate('auto')}>
            Вид по теме
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canWrite ? (
              <Th className="w-10">
                <PageSelectBox selected={sel.selected} ids={rows.map((p) => p.id)} onToggle={sel.togglePage} />
              </Th>
            ) : null}
            <Th>Публикация</Th>
            <Th>Автор</Th>
            <Th>Квалификация</Th>
            <Th>Лайки / комм.</Th>
            <Th>Создана</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={canWrite ? 7 : 6} loading /> : null}
          {rows.map((p, i) => (
            <MotionRow key={p.id} i={i}>
              {canWrite ? (
                <Td>
                  <RowSelectBox selected={sel.selected} id={p.id} onToggle={sel.toggle} />
                </Td>
              ) : null}
              <Td className="max-w-md">
                {p.kind === 'news' ? <Badge tone="gold">новость</Badge> : null}
                <Badge tone={p.contentClass === 'legal' ? 'info' : 'neutral'}>
                  {p.contentClass === 'legal' ? 'юридический' : 'обычный'}
                  {p.contentClassLocked ? ' · закреплено' : ''}
                </Badge>
                {p.hasVideo ? <Badge tone="info">видео</Badge> : null}
                {p.archived ? <Badge tone="neutral">В архиве у автора</Badge> : null}
                {p.attachments > 0 ? (
                  <Badge tone="info">файлы: {p.attachments}</Badge>
                ) : null}
                <div className="font-medium text-heading">{p.title ?? '—'}</div>
                <div className="line-clamp-2 text-xs text-muted">{p.body}</div>
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${p.authorId}`} className="text-gold-600 hover:underline">
                  {p.authorName}
                </Link>
                <AuthorFilterButton active={filter.author?.id === p.authorId} onPick={() => setFilter({ ...filter, author: { id: p.authorId, name: p.authorName } })} />
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
            <TableEmpty colSpan={canWrite ? 7 : 6}>{text || filterKey(filter) !== '||' ? 'Ничего не найдено' : 'Публикаций пока нет'}</TableEmpty>
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
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const canWrite = useCanModerate();
  const sel = useSelection(`${text}|${thread}|${filterKey(filter)}`);
  const bulk = useBulkRun();
  const fetchPage = async (cursor: string | undefined) =>
    (
      await api.GET('/admin/content/comments', {
        params: { query: { q: text || undefined, thread, cursor, ...filterQuery(filter) } },
      })
    ).data!;
  const q = useInfiniteQuery({
    queryKey: ['admin-comments', text, thread, filterKey(filter)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const onBulk = (action: BulkAction) => {
    const t = ACTION_TEXT[action];
    bulk.run({
      ids: [...sel.selected],
      verb: t.verb,
      doneVerb: t.done,
      noun: COMMENTS,
      danger: t.danger,
      description: t.describe('Выбранные комментарии'),
      send: (ids, reason) => sendBulk(action, thread === 'case' ? 'case_comment' : 'comment', ids, reason),
      onDone: () => {
        sel.clear();
        void qc.invalidateQueries({ queryKey: ['admin-comments'] });
      },
    });
  };
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
        <FilterFields id="cf" value={filter} onChange={setFilter} />
      </div>
      {bulk.dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={COMMENTS}
          onClear={sel.clear}
          onSelectAll={async () => {
            const r = await collectIds(async (c) => {
              const p = await fetchPage(c);
              return { data: p.data, nextCursor: p.meta?.nextCursor };
            });
            sel.replace(r.ids);
            return r.capped;
          }}
        >
          <BulkActions actions={['remove', 'hide', 'restore']} pending={bulk.pending} onAction={onBulk} />
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canWrite ? (
              <Th className="w-10">
                <PageSelectBox selected={sel.selected} ids={rows.map((c) => c.id)} onToggle={sel.togglePage} />
              </Th>
            ) : null}
            <Th>Комментарий</Th>
            <Th>Автор</Th>
            <Th>{thread === 'post' ? 'Публикация' : 'Кейс'}</Th>
            <Th>Создан</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={canWrite ? 6 : 5} loading /> : null}
          {rows.map((c, i) => (
            <MotionRow key={c.id} i={i}>
              {canWrite ? (
                <Td>
                  <RowSelectBox selected={sel.selected} id={c.id} onToggle={sel.toggle} />
                </Td>
              ) : null}
              <Td className="max-w-md text-sm">{c.body}</Td>
              <Td className="text-xs">
                <Link href={`/users/${c.authorId}`} className="text-gold-600 hover:underline">
                  {c.authorName}
                </Link>
                <AuthorFilterButton active={filter.author?.id === c.authorId} onPick={() => setFilter({ ...filter, author: { id: c.authorId, name: c.authorName } })} />
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
            <TableEmpty colSpan={canWrite ? 6 : 5}>{text || filterKey(filter) !== '||' ? 'Ничего не найдено' : 'Комментариев пока нет'}</TableEmpty>
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
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const canWrite = useCanModerate();
  const sel = useSelection(`${text}|${filterKey(filter)}`);
  const bulk = useBulkRun();
  const fetchPage = async (cursor: string | undefined) =>
    (await api.GET('/admin/content/reviews', { params: { query: { q: text || undefined, cursor, ...filterQuery(filter) } } })).data!;
  const q = useInfiniteQuery({
    queryKey: ['admin-reviews', text, filterKey(filter)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const onBulk = (action: BulkAction) => {
    const t = ACTION_TEXT[action];
    bulk.run({
      ids: [...sel.selected],
      verb: t.verb,
      doneVerb: t.done,
      noun: REVIEWS,
      danger: t.danger,
      description: action === 'hide' ? 'Отзывы пропадут из профилей адвокатов, рейтинги пересчитаются. Каждый автор получит уведомление с этой причиной.' : 'Отзывы снова появятся в профилях, рейтинги пересчитаются.',
      send: (ids, reason) => sendBulk(action, 'review', ids, reason),
      onDone: () => {
        sel.clear();
        void qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      },
    });
  };
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
        <FilterFields id="rf" value={filter} onChange={setFilter} authorLabel="Автор (клиент)" />
      </div>
      {bulk.dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={REVIEWS}
          onClear={sel.clear}
          onSelectAll={async () => {
            const r = await collectIds(async (c) => {
              const p = await fetchPage(c);
              return { data: p.data, nextCursor: p.meta?.nextCursor };
            });
            sel.replace(r.ids);
            return r.capped;
          }}
        >
          <BulkActions actions={['hide', 'restore']} pending={bulk.pending} onAction={onBulk} />
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canWrite ? (
              <Th className="w-10">
                <PageSelectBox selected={sel.selected} ids={rows.map((r) => r.id)} onToggle={sel.togglePage} />
              </Th>
            ) : null}
            <Th>Отзыв</Th>
            <Th>Адвокат</Th>
            <Th>Клиент</Th>
            <Th>Кейс</Th>
            <Th>Статус</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={canWrite ? 7 : 6} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
              {canWrite ? (
                <Td>
                  <RowSelectBox selected={sel.selected} id={r.id} onToggle={sel.toggle} />
                </Td>
              ) : null}
              <Td className="max-w-md">
                <div className="text-gold-600">
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </div>
                <div className="line-clamp-3 text-xs">{r.body ?? 'без текста'}</div>
              </Td>
              <Td className="text-xs">{r.attorneyName}</Td>
              <Td className="text-xs">
                {r.clientName}
                <AuthorFilterButton active={filter.author?.id === r.clientId} onPick={() => setFilter({ ...filter, author: { id: r.clientId, name: r.clientName } })} />
              </Td>
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
            <TableEmpty colSpan={canWrite ? 7 : 6}>{text || filterKey(filter) !== '||' ? 'Ничего не найдено' : 'Отзывов нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <More q={q} />
    </>
  );
}
