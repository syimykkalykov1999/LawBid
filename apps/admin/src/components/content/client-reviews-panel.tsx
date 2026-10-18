'use client';

import { ArrowCounterClockwise, ChatCenteredText, EyeSlash, MagnifyingGlass } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { LoadMore, useDebounced } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { CONTENT_STATUS, label, ROLE_TEXT, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';
import { collectIds, dayBounds, type Noun } from '@/lib/bulk';
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

const REVIEWS: Noun = ['отзыв', 'отзыва', 'отзывов'];

type ClientReview = components['schemas']['AdminClientReviewRowDto'];
type ReviewStatus = components['schemas']['AdminReviewStatus'];
type Tab = 'all' | ReviewStatus;

const REVIEW_STATUS: Record<string, string> = { ...CONTENT_STATUS, published: 'виден' };
const APPEAL_STATUS: Record<string, string> = {
  pending: 'обжалование ждёт решения',
  accepted: 'обжалование принято',
  rejected: 'обжалование отклонено',
  auto_removed: 'снят автоматически',
};

function useCanModerate() {
  const { data: me } = useMe();
  return can(me, 'content', 'manage');
}

/** Reviews about clients / assistants (left by attorneys or clients): search, hide, restore. */
export function ClientReviewsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const canWrite = useCanModerate();
  const { ask, dialog } = useReason();
  const [tab, setTab] = useState<Tab>('all');
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const sel = useSelection(`${tab}|${text}|${filterKey(filter)}`);
  const bulk = useBulkRun();

  const fetchPage = async (cursor: string | undefined) =>
    (
      await api.GET('/admin/content/client-reviews', {
        params: {
          query: { cursor, q: text || undefined, status: tab === 'all' ? undefined : tab, authorId: filter.author?.id, ...dayBounds(filter.from, filter.to) },
        },
      })
    ).data!;
  const list = useInfiniteQuery({
    queryKey: ['admin-client-reviews', tab, text, filterKey(filter)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const onBulk = (hide: boolean) =>
    bulk.run({
      ids: [...sel.selected],
      verb: hide ? 'Скрыть' : 'Вернуть',
      doneVerb: hide ? 'Скрыто' : 'Возвращено',
      noun: REVIEWS,
      danger: hide,
      description: hide
        ? 'Отзывы пропадут из профилей, рейтинги пересчитаются. Каждый автор получит уведомление с этой причиной.'
        : 'Отзывы снова появятся в профилях, рейтинги пересчитаются.',
      send: async (ids, reason) =>
        bulkData(await api.POST('/admin/content/bulk', { body: { action: hide ? 'hide' : 'restore', type: 'client_review', ids, reason } })),
      onDone: () => {
        sel.clear();
        void qc.invalidateQueries({ queryKey: ['admin-client-reviews'] });
      },
    });

  const act = useMutation({
    mutationFn: async ({ r, hide }: { r: ClientReview; hide: boolean }) => {
      const a = await ask(
        hide
          ? { title: 'Скрыть отзыв', description: 'Отзыв пропадёт из профиля, рейтинг пересчитается. Автор получит уведомление.', label: 'Причина', confirm: 'Скрыть', danger: true }
          : { title: 'Вернуть отзыв', description: 'Отзыв снова появится в профиле, рейтинг пересчитается.', label: 'Причина', confirm: 'Вернуть' },
      );
      if (!a) return null;
      const opts = { params: { path: { id: r.id } }, body: { reason: a.text } };
      if (hide) await api.POST('/admin/content/client-reviews/{id}/hide', opts);
      else await api.POST('/admin/content/client-reviews/{id}/restore', opts);
      return hide;
    },
    onSuccess: (hidden) => {
      if (hidden == null) return;
      toast.success(hidden ? 'Отзыв скрыт' : 'Отзыв снова виден');
      void qc.invalidateQueries({ queryKey: ['admin-client-reviews'] });
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const cols = canWrite ? 7 : 5;

  return (
    <>
      {dialog}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all' as Tab, label: 'Все' },
            { value: 'published' as Tab, label: 'Видны' },
            { value: 'hidden' as Tab, label: 'Скрыты' },
            { value: 'removed' as Tab, label: 'Удалены' },
          ]}
        />
        <div className="relative">
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="w-full pl-9 sm:w-72" placeholder="Текст, автор или клиент" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterFields id="crf" value={filter} onChange={setFilter} />
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
          <Button size="sm" variant="danger-soft" disabled={bulk.pending} onClick={() => onBulk(true)}>
            <EyeSlash size={14} /> Скрыть
          </Button>
          <Button size="sm" variant="soft" disabled={bulk.pending} onClick={() => onBulk(false)}>
            <ArrowCounterClockwise size={14} /> Вернуть
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={ChatCenteredText} title="Отзывов нет" text={text || tab !== 'all' || filterKey(filter) !== '||' ? 'Ничего не найдено.' : 'Отзывы о клиентах появятся после завершённых кейсов.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              {canWrite ? (
                <Th className="w-10">
                  <PageSelectBox selected={sel.selected} ids={rows.map((r) => r.id)} onToggle={sel.togglePage} />
                </Th>
              ) : null}
              <Th>Отзыв</Th>
              <Th>Автор</Th>
              <Th>О ком</Th>
              <Th>Кейс</Th>
              <Th>Статус</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  {canWrite ? (
                    <Td>
                      <RowSelectBox selected={sel.selected} id={r.id} onToggle={sel.toggle} />
                    </Td>
                  ) : null}
                  <Td className="max-w-md">
                    <div className="text-gold-600">
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(Math.max(0, 5 - r.rating))}
                    </div>
                    <div className="line-clamp-3 text-xs">{r.body || <span className="text-faint">без текста</span>}</div>
                    <div className="mt-1 text-[11px] text-faint">{formatDateTime(r.createdAt)}</div>
                  </Td>
                  <Td className="text-xs">
                    <Link href={`/users/${r.authorId}`} className="font-medium text-ink hover:text-gold-600 hover:underline">
                      {r.authorName}
                    </Link>
                    <AuthorFilterButton active={filter.author?.id === r.authorId} onPick={() => setFilter({ ...filter, author: { id: r.authorId, name: r.authorName } })} />
                    <div className="text-faint">{label(ROLE_TEXT, r.authorRole)}</div>
                  </Td>
                  <Td className="text-xs">
                    <Link href={`/users/${r.clientId}`} className="font-medium text-ink hover:text-gold-600 hover:underline">
                      {r.clientName}
                    </Link>
                  </Td>
                  <Td className="max-w-xs text-xs text-muted">{r.caseTitle ?? '—'}</Td>
                  <Td>
                    <StatusPill map={REVIEW_STATUS} value={r.status} />
                    {r.appealStatus ? (
                      <div className="mt-1">
                        <Badge tone={r.appealStatus === 'pending' ? 'warning' : 'neutral'}>{APPEAL_STATUS[r.appealStatus] ?? r.appealStatus}</Badge>
                      </div>
                    ) : null}
                  </Td>
                  {canWrite ? (
                    <Td className="text-right whitespace-nowrap">
                      {r.status === 'published' ? (
                        <Button size="sm" variant="danger-soft" disabled={act.isPending} onClick={() => act.mutate({ r, hide: true })}>
                          <EyeSlash size={14} /> Скрыть
                        </Button>
                      ) : (
                        <Button size="sm" variant="soft" disabled={act.isPending} onClick={() => act.mutate({ r, hide: false })}>
                          <ArrowCounterClockwise size={14} /> Вернуть
                        </Button>
                      )}
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
    </>
  );
}

const RESTORE_KIND = {
  post: { what: 'пост' },
  comment: { what: 'комментарий' },
  'case-comment': { what: 'комментарий к кейсу' },
} as const;

/**
 * Restores content that moderation hid or removed (author-deleted posts and
 * taken-down reels answer 409, shown as a toast). Hidden for roles that
 * can't moderate.
 */
export function RestoreContentButton({
  kind,
  id,
  onDone,
  size = 'sm',
}: {
  kind: 'post' | 'comment' | 'case-comment';
  id: string;
  onDone?: () => void;
  size?: 'sm' | 'default';
}) {
  const toast = useToast();
  const canWrite = useCanModerate();
  const { ask, dialog } = useReason();
  const k = RESTORE_KIND[kind];

  const restore = useMutation({
    mutationFn: async () => {
      const a = await ask({ title: `Восстановить ${k.what}`, description: 'Он снова станет виден всем. Причина попадёт в журнал аудита.', label: 'Причина', confirm: 'Восстановить' });
      if (!a) return false;
      const opts = { params: { path: { id } }, body: { reason: a.text } };
      if (kind === 'post') await api.POST('/admin/content/posts/{id}/restore', opts);
      else if (kind === 'comment') await api.POST('/admin/content/comments/{id}/restore', opts);
      else await api.POST('/admin/content/case-comments/{id}/restore', opts);
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Восстановлено');
      onDone?.();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  if (!canWrite) return null;
  return (
    <>
      {dialog}
      <Button size={size} variant="soft" loading={restore.isPending} disabled={restore.isPending} onClick={() => restore.mutate()}>
        <ArrowCounterClockwise size={14} /> Восстановить
      </Button>
    </>
  );
}
