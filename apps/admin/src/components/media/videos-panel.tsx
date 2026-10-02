'use client';

import { CloudArrowUp, Database, FilmStrip, Play, Prohibit, VideoCamera, WarningCircle } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { CONTENT_STATUS, label, StatusPill, VIDEO_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';
import { formatBytes } from './media-utils';

type Video = components['schemas']['AdminVideoRowDto'];
type VideoStatus = components['schemas']['AdminVideoStatus'];

/** The API also has `rejected`; the shared map has a UI-only `uploading`. */
const VIDEO_LABEL: Record<string, string> = { ...VIDEO_STATUS, rejected: 'отклонено' };
const STATUSES: VideoStatus[] = ['ready', 'processing', 'awaiting_upload', 'failed', 'rejected', 'deleted'];

function duration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function VideosPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'moderator';
  const { ask, dialog } = useReason();
  const [status, setStatus] = useState<'' | VideoStatus>('');
  const [playing, setPlaying] = useState<Video | null>(null);

  const stats = useQuery({
    queryKey: ['media-video-stats'],
    queryFn: async () => (await api.GET('/admin/media/videos/stats')).data!.data,
  });
  const list = useInfiniteQuery({
    queryKey: ['media-videos', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/media/videos', { params: { query: { cursor: pageParam, status: status || undefined } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const count = (s: VideoStatus) => stats.data?.byStatus.find((x) => x.status === s)?.count ?? 0;

  const takedown = useMutation({
    mutationFn: async (v: Video) => {
      const r = await ask({
        title: 'Снять видео',
        description: 'Пост с видео будет удалён, файл — стёрт из хранилища. Автор получит уведомление с причиной.',
        label: 'Причина',
        confirm: 'Снять видео',
        danger: true,
      });
      if (!r) return false;
      await api.POST('/admin/media/videos/{id}/takedown', { params: { path: { id: v.id } }, body: { reason: r.text } });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Видео снято');
      setPlaying(null);
      void qc.invalidateQueries({ queryKey: ['media-videos'] });
      void qc.invalidateQueries({ queryKey: ['media-video-stats'] });
    },
    onError: (e) => toast.error(e),
  });

  const cols = canWrite ? 8 : 7;

  return (
    <>
      {dialog}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending ? (
          <KpiSkeletons n={4} />
        ) : stats.data ? (
          <>
            <Kpi i={0} icon={FilmStrip} title="Готовых видео" value={count('ready')} hint={`обрабатывается: ${count('processing')}`} gold />
            <Kpi i={1} icon={CloudArrowUp} title="Загрузок за 7 дней" value={stats.data.uploads7d} />
            <Kpi i={2} icon={WarningCircle} title="Ошибок за 7 дней" value={stats.data.failed7d} warn />
            <Kpi i={3} icon={Database} title="Занято в хранилище" value={stats.data.storageBytes} format={formatBytes} />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="mt-6 mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="video-status">Статус</Label>
          <Select id="video-status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value as '' | VideoStatus)}>
            <option value="">Все</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {VIDEO_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={VideoCamera} title="Видео нет" text={status ? 'В этом статусе ничего нет.' : 'Видео появятся, когда пользователи начнут публиковать рилсы.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Видео</Th>
              <Th>Автор</Th>
              <Th className="text-right">Длина</Th>
              <Th className="text-right">Размер</Th>
              <Th>Статус</Th>
              <Th>Пост</Th>
              <Th>Загружено</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <button
                      type="button"
                      disabled={!v.playbackUrl}
                      onClick={() => setPlaying(v)}
                      className="group relative block h-14 w-24 overflow-hidden rounded-lg border border-line bg-surface-2 disabled:cursor-default"
                      aria-label="Смотреть"
                    >
                      {v.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-faint">
                          <VideoCamera size={18} weight="light" />
                        </span>
                      )}
                      {v.playbackUrl ? (
                        <span className="absolute inset-0 grid place-items-center bg-canvas/30 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play size={18} weight="fill" className="text-ink" />
                        </span>
                      ) : null}
                    </button>
                  </Td>
                  <Td>
                    <Link href={`/users/${v.ownerId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                      {v.ownerName || v.ownerId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{duration(v.durationSec)}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums text-muted">{v.sizeBytes != null ? formatBytes(v.sizeBytes) : '—'}</Td>
                  <Td>
                    <StatusPill map={VIDEO_LABEL} value={v.status} />
                    {v.failureReason ? <div className="mt-1 max-w-[220px] text-xs text-danger">{v.failureReason}</div> : null}
                  </Td>
                  <Td className="text-xs text-muted">{v.postId ? label(CONTENT_STATUS, v.postStatus) : '—'}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(v.createdAt)}</Td>
                  {canWrite ? (
                    <Td className="text-right whitespace-nowrap">
                      {v.status !== 'deleted' ? (
                        <Button size="sm" variant="danger-soft" disabled={takedown.isPending} onClick={() => takedown.mutate(v)}>
                          <Prohibit size={14} /> Снять
                        </Button>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      <Dialog open={!!playing} onClose={() => setPlaying(null)} wide eyebrow="Видео" title={playing?.ownerName || 'Видео'} description={playing ? `${duration(playing.durationSec)} · ${formatDateTime(playing.createdAt)}` : undefined}>
        {playing?.playbackUrl ? (
          <div className="space-y-4">
            <video key={playing.id} controls autoPlay playsInline src={playing.playbackUrl} poster={playing.thumbnailUrl ?? undefined} className="max-h-[65vh] w-full rounded-xl bg-canvas" />
            {canWrite && playing.status !== 'deleted' ? (
              <div className="flex justify-end">
                <Button variant="danger-soft" disabled={takedown.isPending} onClick={() => takedown.mutate(playing)}>
                  <Prohibit size={16} /> Снять видео
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Ссылка на просмотр недоступна.</p>
        )}
      </Dialog>
    </>
  );
}
