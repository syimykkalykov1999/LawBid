'use client';

import { Lock } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { cn } from '@/lib/utils';

type PlaceInfo = components['schemas']['UploadPlaceDto'];
type Limits = components['schemas']['UploadPlaceLimitsDto'];
type Format = Limits['formats'][number];
type Place = Limits['place'];
type StorageSettings = components['schemas']['StorageSettingsDto'];

const PLACE: Record<Place, { title: string; hint: string }> = {
  post: { title: 'Посты', hint: 'Фото и документы под постом.' },
  reel: { title: 'Рилсы', hint: 'Фото и документы внутри рилса. Видео — в «Рилсы и стикеры».' },
  case: { title: 'Кейсы', hint: 'Фото и документы, которые клиент прикладывает к делу.' },
  chat: {
    title: 'Чат',
    hint: 'Один файл в сообщении: фото, документ или видео (приложение сжимает видео до 720p). Сколько всего на чат — в карточке «Всего».',
  },
  task: { title: 'Задачи', hint: 'Файлы в задаче помощника.' },
  review: { title: 'Отзывы', hint: 'Фото в отзывах об адвокатах и о клиентах.' },
  avatar: { title: 'Фото профиля', hint: 'Одно фото; приложение сжимает его до 1024 px.' },
  verification: { title: 'Проверка адвоката', hint: 'Файлы одного документа (лицензия, ID). Видят только проверяющие.' },
  client_badge: { title: 'Значок клиента', hint: 'Сколько файлов в заявке. Размер и форматы — как в «Проверке адвоката».' },
};

const FORMAT_LABEL: Record<Format, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  heic: 'HEIC',
  webp: 'WebP',
  gif: 'GIF',
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOCX',
  xls: 'XLS',
  xlsx: 'XLSX',
  ppt: 'PPT',
  pptx: 'PPTX',
  odt: 'ODT',
  ods: 'ODS',
  odp: 'ODP',
  rtf: 'RTF',
  txt: 'TXT',
  csv: 'CSV',
  mp4: 'MP4',
  mov: 'MOV',
};
const PHOTO: readonly Format[] = ['jpeg', 'png', 'heic', 'webp', 'gif'];
/** Owner 2026-10-17: videos (chat only; the app compresses them to 720p). */
const VIDEO: readonly Format[] = ['mp4', 'mov'];

type NumKey = 'maxPhotos' | 'maxFiles' | 'fileMb' | 'totalMb';

/**
 * Owner 2026-10-07 (bug 17): Система → «Загрузки и файлы». How many photos
 * and documents each place takes, how big, which formats. The server keeps
 * every number under a hard ceiling and offers only safe formats: programs,
 * APK, EXE, archives, scripts and macro documents can't be turned on here
 * or anywhere.
 */
export default function UploadsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'settings', 'manage') : false;

  const q = useQuery({
    queryKey: ['uploads'],
    queryFn: async () => (await api.GET('/admin/storage/uploads')).data!.data,
  });
  const storage = useQuery({
    queryKey: ['storage'],
    queryFn: async () => (await api.GET('/admin/storage')).data!.data,
  });

  const save = useMutation({
    mutationFn: async (limits: Limits) =>
      (await api.PUT('/admin/storage/uploads', { body: { places: [limits] } })).data!.data,
    onSuccess: (data) => {
      toast.success('Сохранено');
      qc.setQueryData(['uploads'], data);
    },
    onError: (e) => toast.error(e),
  });
  const saveTotals = useMutation({
    mutationFn: async (body: Partial<StorageSettings>) =>
      (await api.PUT('/admin/storage/settings', { body })).data!.data,
    onSuccess: () => {
      toast.success('Сохранено');
      void qc.invalidateQueries({ queryKey: ['storage'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Загрузки и файлы"
        subtitle="Сколько фото и документов можно прикрепить в каждом месте, какого размера и каких форматов. Приложение берёт эти цифры отсюда и показывает их людям."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      <Card className="mb-4">
        <CardContent className="flex items-start gap-3 pt-5 text-sm">
          <Lock size={20} weight="duotone" className="mt-0.5 shrink-0 text-gold-500" />
          <div className="min-w-0">
            <p className="font-medium text-ink">Опасные файлы запрещены всегда</p>
            <p className="text-muted">
              Программы и установщики (APK, EXE, DMG), архивы (ZIP, RAR, 7Z), скрипты (JS, SH, BAT) и документы с
              макросами (DOCM, XLSM) нельзя включить нигде. Каждый файл проверяется антивирусом, а внутри документов
              ищутся спрятанные программы.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(q.data?.places ?? []).map((p) => (
          <PlaceCard
            key={p.limits.place}
            info={p}
            disabled={!canManage || save.isPending}
            onSave={(l) => save.mutate(l)}
          />
        ))}
        {storage.data ? (
          <TotalsCard
            settings={storage.data.settings}
            disabled={!canManage || saveTotals.isPending}
            onSave={(b) => saveTotals.mutate(b)}
          />
        ) : null}
      </div>
    </>
  );
}

function PlaceCard({ info, disabled, onSave }: { info: PlaceInfo; disabled: boolean; onSave: (l: Limits) => void }) {
  const [draft, setDraft] = useState<Limits>(info.limits);
  useEffect(() => setDraft(info.limits), [info.limits]);
  const same = (a: Limits, b: Limits) =>
    a.maxPhotos === b.maxPhotos &&
    a.maxFiles === b.maxFiles &&
    a.fileMb === b.fileMb &&
    a.totalMb === b.totalMb &&
    a.formats.length === b.formats.length &&
    a.formats.every((f) => b.formats.includes(f));
  const changed = !same(draft, info.limits);
  const isDefault = same(draft, info.defaults);
  const place = info.limits.place;
  const meta = PLACE[place];
  const { ceiling } = info;

  const num = (key: NumKey, label: string, max: number, min = 0) => (
    <Field label={label} hint={`от ${min} до ${max}`} htmlFor={`${place}-${key}`}>
      <Input
        id={`${place}-${key}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        value={String(draft[key])}
        onChange={(e) => {
          const v = Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0)));
          setDraft((d) => ({ ...d, [key]: v }));
        }}
      />
    </Field>
  );
  const photos = info.safeFormats.filter((f) => PHOTO.includes(f));
  const videos = info.safeFormats.filter((f) => VIDEO.includes(f));
  const docs = info.safeFormats.filter((f) => !PHOTO.includes(f) && !VIDEO.includes(f));
  const toggle = (f: Format) =>
    setDraft((d) => ({
      ...d,
      formats: d.formats.includes(f) ? d.formats.filter((x) => x !== f) : [...d.formats, f],
    }));

  return (
    <Card>
      <CardHeader className="items-start">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{meta.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{meta.hint}</p>
        </div>
        {!isDefault ? (
          <button
            type="button"
            disabled={disabled}
            className="shrink-0 text-xs text-gold-500 hover:underline disabled:opacity-50"
            onClick={() => setDraft({ ...info.defaults })}
          >
            Как было
          </button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          {info.count === 'split' ? (
            <>
              {num('maxPhotos', 'Фото, штук', ceiling.count)}
              {num('maxFiles', 'Документов, штук', ceiling.count)}
            </>
          ) : null}
          {info.count === 'combined' ? num('maxFiles', 'Фото и документов вместе, штук', ceiling.count) : null}
          {info.count === 'photos' ? num('maxPhotos', 'Фото, штук', ceiling.count) : null}
          {ceiling.fileMb > 0 ? num('fileMb', 'Один файл, до МБ', ceiling.fileMb, 1) : null}
          {ceiling.totalMb > 0 ? num('totalMb', 'Все документы вместе, до МБ', ceiling.totalMb, 1) : null}
        </div>
        {info.safeFormats.length > 0 ? (
          <div className="space-y-2">
            <FormatRow label="Фото" formats={photos} on={draft.formats} disabled={disabled} onToggle={toggle} />
            <FormatRow label="Документы" formats={docs} on={draft.formats} disabled={disabled} onToggle={toggle} />
            {videos.length > 0 ? (
              <FormatRow label="Видео" formats={videos} on={draft.formats} disabled={disabled} onToggle={toggle} />
            ) : null}
            {draft.formats.length === 0 ? (
              <p className="text-xs text-warning">Ни один формат не выбран: сюда ничего нельзя будет загрузить.</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onSave(draft)} disabled={disabled || !changed}>
            Сохранить
          </Button>
          {changed ? (
            <Button variant="ghost" onClick={() => setDraft(info.limits)}>
              Отменить
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FormatRow({
  label,
  formats,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  formats: Format[];
  on: Format[];
  disabled: boolean;
  onToggle: (f: Format) => void;
}) {
  if (formats.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {formats.map((f) => {
          const active = on.includes(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(f)}
              className={cn(
                'h-7 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-60',
                active ? 'border-gold-500 bg-gold-500/15 text-ink' : 'border-line text-faint line-through',
              )}
            >
              {FORMAT_LABEL[f]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TotalsCard({
  settings,
  disabled,
  onSave,
}: {
  settings: StorageSettings;
  disabled: boolean;
  onSave: (b: Partial<StorageSettings>) => void;
}) {
  const [user, setUser] = useState(String(settings.userQuotaMb));
  const [chat, setChat] = useState(String(settings.chatQuotaMb));
  useEffect(() => {
    setUser(String(settings.userQuotaMb));
    setChat(String(settings.chatQuotaMb));
  }, [settings.userQuotaMb, settings.chatQuotaMb]);
  const changed = user !== String(settings.userQuotaMb) || chat !== String(settings.chatQuotaMb);
  const gb = (mb: string) => (Number(mb) > 0 ? `≈ ${Math.round((Number(mb) / 1024) * 10) / 10} ГБ` : 'без лимита');
  return (
    <Card>
      <CardHeader className="items-start">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Всего</h2>
          <p className="mt-0.5 text-xs text-muted">
            Сколько места у одного человека и у одного чата. 0 — без лимита. Свой лимит отдельному человеку — в
            «Хранилище».
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="На одного человека, МБ" hint={gb(user)} htmlFor="totals-user">
            <Input
              id="totals-user"
              type="number"
              inputMode="numeric"
              min={0}
              max={1048576}
              disabled={disabled}
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </Field>
          <Field label="На один чат, МБ" hint={gb(chat)} htmlFor="totals-chat">
            <Input
              id="totals-chat"
              type="number"
              inputMode="numeric"
              min={0}
              max={1048576}
              disabled={disabled}
              value={chat}
              onChange={(e) => setChat(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || !changed}
            onClick={() => onSave({ userQuotaMb: Number(user) || 0, chatQuotaMb: Number(chat) || 0 })}
          >
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
