'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HoverPrefetchLink as Link } from '@/components/ui/hover-prefetch-link';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { PrefetchSentinel } from '@/components/legacy/prefetch-sentinel';
import { VirtualRows } from '@/components/ui/virtual-rows';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { SortTh, Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';
import { LazyImg } from '@/components/ui/lazy-img';

type Filter = 'all' | 'hidden' | 'flagged' | 'csam_match' | 'skipped';
/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const SORT_KEYS = ['purpose', 'verdict', 'created'] as const;

const TABS: Record<Filter, string> = {
  all: 'Все',
  hidden: 'Скрыто автоматически',
  flagged: 'На проверку',
  csam_match: 'CSAM',
  skipped: 'Не проверено',
};

const STATUS: Record<string, { tone: 'danger' | 'gold' | 'neutral'; text: string }> = {
  hidden: { tone: 'danger', text: 'скрыто' },
  flagged: { tone: 'gold', text: 'подозрение' },
  csam_match: { tone: 'danger', text: 'CSAM (совпадение)' },
  skipped: { tone: 'neutral', text: 'не проверено' },
  error: { tone: 'neutral', text: 'ошибка' },
};

/** Owner 2026-11-08: where the CyberTipline report stands. */
const NCMEC: Record<string, string> = {
  pending: 'отправляется',
  submitted: 'отправлено',
  manual_required: 'подать вручную (не подключено или выключено)',
  failed: 'ошибка, можно отправить снова',
};

const SKIP: Record<string, string> = {
  not_configured: 'нет ключей AWS Rekognition',
  budget: 'дневной лимит расходов',
  disabled: 'проверка выключена',
  format: 'не удалось прочитать картинку',
};

const PURPOSE: Record<string, string> = {
  post_image: 'фото в посте / сторис',
  avatar: 'аватар',
  review_photo: 'фото в отзыве',
  reel: 'обложка видео',
};

/**
 * Owner 2026-10-22 (audit #4 §5): pictures the automatic check (AWS
 * Rekognition, PhotoDNA) hid or flagged. «Вернуть» brings back what was
 * hidden, «Удалить» removes the content and the file. «Сообщить в NCMEC»
 * hides it everywhere and opens a CyberTipline report (by hand until the
 * NCMEC account exists — docs/SECURITY_TODO.md).
 */
export default function MediaModerationPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useInfiniteQuery({
    queryKey: ['media-moderation', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/media-moderation', {
          params: { query: { status: filter, cursor: pageParam } },
        })
      ).data!.data,
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(SORT_KEYS);
  const rows = sortRows(q.data?.pages.flatMap((p) => p?.items ?? []) ?? [], sort, {
    purpose: (r) => PURPOSE[r.purpose] ?? r.purpose,
    verdict: (r) => STATUS[r.status]?.text ?? r.status,
    created: (r) => r.createdAt,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['media-moderation'] });

  const decide = useMutation({
    mutationFn: async (v: { id: string; decision: 'approve' | 'remove' }) => {
      const ok = await confirm(
        v.decision === 'approve'
          ? { title: 'Вернуть публикацию?', description: 'Всё, что проверка скрыла, снова увидят люди.', confirm: 'Вернуть' }
          : { title: 'Удалить?', description: 'Публикация удаляется, файл стирается из хранилища.', confirm: 'Удалить', danger: true },
      );
      if (!ok) return null;
      const r = await api.POST('/admin/media-moderation/{id}/decision', {
        params: { path: { id: v.id } },
        body: { decision: v.decision },
      });
      if (r.error) throw r.error;
      return v.decision;
    },
    onSuccess: (d) => {
      if (!d) return;
      toast.success(d === 'approve' ? 'Возвращено' : 'Удалено');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const report = useMutation({
    mutationFn: async (id: string) => {
      const ok = await confirm({
        title: 'Сообщить в NCMEC?',
        description:
          'Картинка скрывается везде и сохраняется как доказательство. Если в «Ключи и сервисы» заполнена карточка NCMEC и включена отправка, отчёт с файлом уходит в CyberTipline сам; иначе («не подключено») его надо подать вручную на report.cybertip.org.',
        confirm: 'Сообщить',
        danger: true,
      });
      if (!ok) return null;
      const r = await api.POST('/admin/media-moderation/{id}/csam-report', { params: { path: { id } } });
      if (r.error) throw r.error;
      return r.data!.data.status;
    },
    onSuccess: (s) => {
      if (!s) return;
      toast.success(s === 'submitted' ? 'Отправлено в NCMEC' : 'Сохранено — подайте сообщение вручную');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Модерация"
        title="Фото и видео"
        subtitle="Автоматическая проверка публичных фото, аватаров, фото в отзывах и обложек видео. Порог скрытия и проверки — Настройки → moderation.image.*."
      />
      <Tabs<Filter>
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={(Object.keys(TABS) as Filter[]).map((v) => ({ value: v, label: TABS[v] }))}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Картинка</Th>
            <SortTh {...header('purpose')}>Что это</SortTh>
            <SortTh {...header('verdict')}>Вердикт</SortTh>
            <Th>Автор</Th>
            <SortTh {...header('created')}>Когда</SortTh>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {!q.isPending && rows.length === 0 ? <TableEmpty colSpan={6}>Ничего не ждёт решения.</TableEmpty> : null}
          <VirtualRows rows={rows} colSpan={6} estimateSize={104}>
            {(r, i, vp) => (
            <MotionRow key={r.id} i={i} {...vp}>
              <Td className="w-28">
                {r.previewUrl ? (
                  <LazyImg src={r.previewUrl} alt="" className="h-20 w-20 rounded object-cover blur-sm hover:blur-none" />
                ) : (
                  <span className="text-xs text-muted">{r.status === 'csam_match' ? 'не показывается' : '—'}</span>
                )}
              </Td>
              <Td className="text-xs">{PURPOSE[r.purpose] ?? r.purpose}</Td>
              <Td className="text-xs">
                <Badge tone={STATUS[r.status]?.tone ?? 'neutral'} dot>
                  {STATUS[r.status]?.text ?? r.status}
                </Badge>
                {r.topLabel ? (
                  <div className="mt-1 text-muted">
                    {r.topLabel}
                    {r.maxConfidence != null ? ` · ${Math.round(r.maxConfidence)}%` : ''}
                  </div>
                ) : null}
                {r.skipReason ? <div className="mt-1 text-muted">{SKIP[r.skipReason] ?? r.skipReason}</div> : null}
                {r.csamReportStatus ? (
                  <div className="mt-1 text-muted">
                    NCMEC: {NCMEC[r.csamReportStatus] ?? r.csamReportStatus}
                    {r.csamExternalReportId ? ` № ${r.csamExternalReportId}` : ''}
                    {r.csamReportStatus === 'failed' && r.csamReportError ? ` (${r.csamReportError})` : ''}
                  </div>
                ) : null}
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${r.ownerUserId}`} className="text-gold-600 hover:underline">
                  открыть
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
              <Td className="whitespace-nowrap">
                <div className="flex gap-2">
                  {r.status !== 'csam_match' ? (
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'approve' })}>
                      Вернуть
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'remove' })}>
                    Удалить
                  </Button>
                  <Button size="sm" variant="ghost" disabled={report.isPending} onClick={() => report.mutate(r.id)}>
                    Сообщить в NCMEC
                  </Button>
                </div>
              </Td>
            </MotionRow>
            )}
          </VirtualRows>
        </tbody>
      </Table>
      {q.hasNextPage ? (
        <PrefetchSentinel enabled={!q.isFetchingNextPage} onNear={() => void q.fetchNextPage()} />
      ) : null}
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}
