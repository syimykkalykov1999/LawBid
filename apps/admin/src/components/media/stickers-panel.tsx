'use client';

import { Eye, EyeSlash, MagnifyingGlass, Plus, SealCheck, Smiley, Sticker, Trash } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';
import { StickerUploader } from './sticker-uploader';

type Pack = components['schemas']['AdminStickerPackDto'];
type Kind = 'official' | 'user';
type PackStatus = 'all' | 'active' | 'hidden';

const PACK_STATUS: Record<string, string> = { active: 'виден', hidden: 'скрыт' };

export function StickersPanel() {
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'moderator';
  const [kind, setKind] = useState<Kind>('official');
  const [status, setStatus] = useState<PackStatus>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['media-sticker-packs', kind, status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/media/sticker-packs', {
          params: { query: { cursor: pageParam, kind, status: status === 'all' ? undefined : status, q: q || undefined } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onChange={setKind}
          items={[
            { value: 'official', label: 'Официальные' },
            { value: 'user', label: 'Пользовательские' },
          ]}
        />
        <Tabs
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'Все' },
            { value: 'active', label: 'Видны' },
            { value: 'hidden', label: 'Скрыты' },
          ]}
        />
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim());
          }}
        >
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="w-64 pl-9" placeholder="Название, Enter — искать" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
        {canWrite ? (
          <Button variant="gold" onClick={() => setCreating(true)}>
            <Plus size={16} /> Новый официальный пак
          </Button>
        ) : null}
      </div>

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={Sticker} title="Наборов нет" text={q ? 'Ничего не нашлось.' : kind === 'official' ? 'Создайте первый официальный набор.' : 'Пользователи ещё не делали свои наборы.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Набор</Th>
              <Th>Автор</Th>
              <Th className="text-right">Стикеров</Th>
              <Th className="text-right">Установок</Th>
              <Th>Статус</Th>
              <Th>Создан</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="cursor-pointer" onClick={() => setOpenId(p.id)}>
                  <Td>
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      {p.title}
                      {p.isOfficial ? <SealCheck size={14} weight="fill" className="text-gold-600" /> : null}
                    </div>
                    <div className="font-mono text-[11px] text-faint">{p.shortName}</div>
                  </Td>
                  <Td className="text-muted">{p.isOfficial ? 'LawBid' : p.ownerName || '—'}</Td>
                  <Td className="text-right tabular-nums">{p.stickerCount}</Td>
                  <Td className="text-right tabular-nums">{p.installCount}</Td>
                  <Td>
                    <Badge tone={p.status === 'active' ? 'success' : 'warning'} dot>
                      {PACK_STATUS[p.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(p.createdAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      {openId ? <PackDialog id={openId} canWrite={canWrite} onClose={() => setOpenId(null)} /> : null}
      {creating ? (
        <CreatePackDialog
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            setKind('official');
            setOpenId(p.id);
          }}
        />
      ) : null}
    </>
  );
}

function CreatePackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Pack) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [key] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const shortOk = shortName.trim() === '' || /^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(shortName.trim());
  const ok = title.trim().length >= 1 && title.trim().length <= 64 && shortOk;

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/media/sticker-packs', {
          params: { header: { 'Idempotency-Key': key } },
          body: { title: title.trim(), shortName: shortName.trim() || undefined },
        })
      ).data!.data,
    onSuccess: (p) => {
      toast.success('Набор создан. Добавьте в него стикеры.');
      void qc.invalidateQueries({ queryKey: ['media-sticker-packs'] });
      onCreated(p);
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <Dialog open onClose={onClose} eyebrow="Стикеры" title="Новый официальный пак" description="Официальный набор доступен всем пользователям. Стикеры добавите после создания.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) create.mutate();
        }}
      >
        <Field label="Название" htmlFor="sp-title">
          <Input id="sp-title" autoFocus maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Короткое имя (необязательно)" htmlFor="sp-short" hint="Для ссылки lawbid.app/stickers/имя. Латиница, цифры и _, 3–40 символов, начинается с буквы. Пусто — придумаем сами.">
          <Input id="sp-short" className={shortOk ? 'font-mono' : 'border-danger font-mono'} value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={create.isPending} disabled={!ok || create.isPending}>
            Создать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PackDialog({ id, canWrite, onClose }: { id: string; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['media-sticker-pack', id],
    queryFn: async () => (await api.GET('/admin/media/sticker-packs/{id}', { params: { path: { id } } })).data!.data,
  });
  const p = q.data;

  const setPack = (data: Pack) => {
    qc.setQueryData(['media-sticker-pack', id], data);
    void qc.invalidateQueries({ queryKey: ['media-sticker-packs'] });
  };

  const toggle = useMutation({
    mutationFn: async (hide: boolean) => {
      const r = await ask({
        title: hide ? 'Скрыть набор' : 'Вернуть набор',
        description: hide
          ? p?.isOfficial
            ? 'Набор пропадёт у всех пользователей.'
            : 'Набор пропадёт у всех. Автор получит уведомление с причиной.'
          : 'Набор снова станет доступен.',
        label: 'Причина',
        confirm: hide ? 'Скрыть' : 'Вернуть',
        danger: hide,
      });
      if (!r) return null;
      const opts = { params: { path: { id } }, body: { reason: r.text } };
      const res = hide
        ? await api.POST('/admin/media/sticker-packs/{id}/hide', opts)
        : await api.POST('/admin/media/sticker-packs/{id}/unhide', opts);
      return { hide, data: res.data!.data };
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(r.hide ? 'Набор скрыт' : 'Набор снова виден');
      setPack(r.data);
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const remove = useMutation({
    mutationFn: async (stickerId: string) =>
      (await api.DELETE('/admin/media/sticker-packs/{id}/stickers/{stickerId}', { params: { path: { id, stickerId } } })).data!.data,
    onSuccess: (data) => {
      toast.success('Стикер удалён');
      setConfirmDelete(null);
      setPack(data);
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        wide
        eyebrow={p?.isOfficial ? 'Официальный набор' : 'Набор пользователя'}
        title={p?.title ?? 'Набор стикеров'}
        description={
          p ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{p.shortName}</span>
              <Badge tone={p.status === 'active' ? 'success' : 'warning'} dot>
                {PACK_STATUS[p.status]}
              </Badge>
              <span>
                {p.stickerCount} стик. · {p.installCount} установок{p.ownerName ? ` · ${p.ownerName}` : ''}
              </span>
            </span>
          ) : undefined
        }
      >
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : p ? (
          <div className="space-y-5">
            {p.stickers.length === 0 ? (
              <EmptyState icon={Smiley} title="Стикеров нет" text={p.isOfficial ? 'Загрузите первый стикер ниже.' : undefined} />
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {[...p.stickers]
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <div key={s.id} className="group relative aspect-square rounded-xl border border-line bg-surface-2 p-1.5">
                      {s.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.url} alt={s.emoji} className="h-full w-full object-contain" loading="lazy" />
                      ) : (
                        <span className="grid h-full place-items-center text-xs text-faint">нет файла</span>
                      )}
                      <span className="absolute bottom-1 left-1.5 text-sm">{s.emoji}</span>
                      {canWrite && p.isOfficial ? (
                        confirmDelete === s.id ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-elevated/95 p-1 text-center">
                            <span className="text-[11px] text-ink">Удалить?</span>
                            <div className="flex gap-1">
                              <Button size="sm" variant="danger" className="h-7 px-2 text-xs" loading={remove.isPending} onClick={() => remove.mutate(s.id)}>
                                Да
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmDelete(null)}>
                                Нет
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label="Удалить стикер"
                            onClick={() => setConfirmDelete(s.id)}
                            className="absolute top-1 right-1 rounded-md bg-elevated/90 p-1 text-danger opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          >
                            <Trash size={13} />
                          </button>
                        )
                      ) : null}
                    </div>
                  ))}
              </div>
            )}

            {canWrite && p.isOfficial ? <StickerUploader packId={p.id} onAdded={setPack} /> : null}

            {canWrite ? (
              <div className="flex justify-end border-t border-line pt-4">
                {p.status === 'active' ? (
                  <Button variant="danger-soft" disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
                    <EyeSlash size={16} /> Скрыть набор
                  </Button>
                ) : (
                  <Button variant="soft" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}>
                    <Eye size={16} /> Вернуть набор
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
      {dialog}
    </>
  );
}
