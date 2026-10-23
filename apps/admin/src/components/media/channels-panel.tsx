'use client';

import { Megaphone, Prohibit, ArrowCounterClockwise, EyeSlash } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useDebounced } from '@/components/legacy/use-debounced';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { StatusPill } from '@/lib/labels';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Row = components['schemas']['AdminChannelRowDto'];
type Status = components['schemas']['AdminChannelStatus'];

const STATUS: Record<string, string> = { active: 'работает', hidden: 'скрыт из поиска', banned: 'закрыт' };
const POST_STATUS: Record<string, string> = { active: 'виден', hidden: 'скрыт', removed: 'удалён' };

/** Channels (Telegram-style): search, hide from search, close, remove posts. */
export function ChannelsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = can(me, 'media', 'manage');
  const { ask, dialog } = useReason();
  const [status, setStatus] = useState<'' | Status>('');
  const [typedQ, setQ] = useState('');
  // Owner 2026-10-23: one request per pause in typing, not per key.
  const q = useDebounced(typedQ.trim());
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['media-channels', status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/media/channels', { params: { query: { cursor: pageParam, status: status || undefined, q: q || undefined } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows: Row[] = list.data?.pages.flatMap((p) => p.data) ?? [];

  const detail = useQuery({
    queryKey: ['media-channel', openId],
    enabled: !!openId,
    queryFn: async () => (await api.GET('/admin/media/channels/{id}', { params: { path: { id: openId! } } })).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['media-channels'] });
    void qc.invalidateQueries({ queryKey: ['media-channel'] });
  };

  const setChannelStatus = useMutation({
    mutationFn: async (v: { id: string; next: Status }) => {
      let reason = '';
      if (v.next !== 'active') {
        const r = await ask({
          title: v.next === 'banned' ? 'Закрыть канал' : 'Скрыть канал из поиска',
          description: 'Владелец получит уведомление с этой причиной.',
          label: 'Причина',
          confirm: v.next === 'banned' ? 'Закрыть' : 'Скрыть',
          danger: v.next === 'banned',
        });
        if (!r) return false;
        reason = r.text;
      }
      await api.POST('/admin/media/channels/{id}/status', { params: { path: { id: v.id } }, body: { status: v.next, reason } });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Готово');
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const moderatePost = useMutation({
    mutationFn: async (v: { id: string; postId: string; action: 'remove' | 'restore' }) => {
      let reason = '';
      if (v.action === 'remove') {
        const r = await ask({
          title: 'Удалить пост канала',
          description: 'Пост пропадёт у подписчиков. Владелец получит уведомление с причиной.',
          label: 'Причина',
          confirm: 'Удалить пост',
          danger: true,
        });
        if (!r) return false;
        reason = r.text;
      }
      await api.POST('/admin/media/channels/{id}/posts/{postId}/moderate', {
        params: { path: { id: v.id, postId: v.postId } },
        body: { action: v.action, reason },
      });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Готово');
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const cols = canWrite ? 8 : 7;
  const ch = detail.data;

  return (
    <>
      {dialog}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="channel-q">Поиск</Label>
          <Input id="channel-q" className="w-64" value={typedQ} placeholder="Название или @имя" onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="channel-status">Статус</Label>
          <Select id="channel-status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value as '' | Status)}>
            <option value="">Все</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="Каналов нет" text={status || q ? 'По этому фильтру ничего нет.' : 'Каналы появятся, когда адвокаты начнут их создавать.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Канал</Th>
              <Th>Владелец</Th>
              <Th className="text-right">Подписчики</Th>
              <Th className="text-right">Посты</Th>
              <Th className="text-right">Жалобы</Th>
              <Th>Статус</Th>
              <Th>Создан</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <button type="button" className="text-left font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline" onClick={() => setOpenId(c.id)}>
                      {c.title}
                    </button>
                    <div className="text-xs text-muted">@{c.username}</div>
                  </Td>
                  <Td>
                    <Link href={`/users/${c.ownerId}`} className="text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {c.ownerName || c.ownerId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{c.subscriberCount}</Td>
                  <Td className="text-right tabular-nums">{c.postCount}</Td>
                  <Td className="text-right tabular-nums">{c.openReports}</Td>
                  <Td>
                    <StatusPill map={STATUS} value={c.status} />
                    {c.moderationNote ? <div className="mt-1 max-w-[220px] text-xs text-muted">{c.moderationNote}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(c.createdAt)}</Td>
                  {canWrite ? (
                    <Td className="whitespace-nowrap text-right">
                      <ChannelActions status={c.status} busy={setChannelStatus.isPending} onSet={(next) => setChannelStatus.mutate({ id: c.id, next })} />
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      <Dialog open={!!openId} onClose={() => setOpenId(null)} wide eyebrow="Канал" title={ch?.title ?? 'Канал'} description={ch ? `@${ch.username} · подписчиков: ${ch.subscriberCount}` : undefined}>
        {detail.isPending ? <p className="text-sm text-muted">Загрузка…</p> : null}
        <ErrorNote text={detail.error ? errorText(detail.error) : null} />
        {ch ? (
          <div className="space-y-4">
            {ch.description ? <p className="text-sm text-muted">{ch.description}</p> : null}
            <ul className="divide-y divide-line rounded-xl border border-line">
              {ch.posts.length === 0 ? <li className="p-3 text-sm text-muted">Постов нет.</li> : null}
              {ch.posts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{p.body || (p.hasVideo ? 'Видео' : p.mediaCount ? `Фото: ${p.mediaCount}` : '—')}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(p.createdAt)} · просмотров {p.viewCount} · комментариев {p.commentCount} · <StatusPill map={POST_STATUS} value={p.status} />
                    </p>
                  </div>
                  {canWrite ? (
                    p.status === 'active' ? (
                      <Button size="sm" variant="danger-soft" disabled={moderatePost.isPending} onClick={() => moderatePost.mutate({ id: ch.id, postId: p.id, action: 'remove' })}>
                        <Prohibit size={14} /> Удалить
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={moderatePost.isPending} onClick={() => moderatePost.mutate({ id: ch.id, postId: p.id, action: 'restore' })}>
                        <ArrowCounterClockwise size={14} /> Вернуть
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function ChannelActions({ status, busy, onSet }: { status: Status; busy: boolean; onSet: (s: Status) => void }) {
  return (
    <div className="inline-flex gap-2">
      {status === 'active' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onSet('hidden')}>
          <EyeSlash size={14} /> Скрыть
        </Button>
      ) : null}
      {status !== 'banned' ? (
        <Button size="sm" variant="danger-soft" disabled={busy} onClick={() => onSet('banned')}>
          <Prohibit size={14} /> Закрыть
        </Button>
      ) : null}
      {status !== 'active' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onSet('active')}>
          <ArrowCounterClockwise size={14} /> Открыть
        </Button>
      ) : null}
    </div>
  );
}
