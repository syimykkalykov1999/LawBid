'use client';

import { CheckCircle, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { ProgressBar } from '@/components/billing/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { fileMime, sha256Hex, sleep } from '@/components/media/media-utils';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type Mime = components['schemas']['AdminStickerUploadDto']['mime'];
const MIMES: Mime[] = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];
const POLL_MS = 2000;
const POLL_TRIES = 30;

type Phase = 'idle' | 'hash' | 'presign' | 'upload' | 'confirm' | 'scan' | 'add' | 'done' | 'error';

const STEPS: { phase: Phase; text: string }[] = [
  { phase: 'hash', text: 'Считаем контрольную сумму…' },
  { phase: 'presign', text: 'Готовим загрузку…' },
  { phase: 'upload', text: 'Загружаем файл…' },
  { phase: 'confirm', text: 'Проверяем файл…' },
  { phase: 'scan', text: 'Проверка на вирусы…' },
  { phase: 'add', text: 'Добавляем подарок…' },
];

/**
 * Admin gift upload: SHA-256 in the browser → presign (the sticker pipeline:
 * PNG / WEBP / GIF, animation = animated WEBP or GIF) → POST to storage →
 * confirm → wait for a clean scan → create the gift with title and price.
 */
export function GiftUploader({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const busy = STEPS.some((s) => s.phase === phase);
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);
  const priceNum = Number(price);
  const valid = !!file && title.trim().length >= 1 && Number.isInteger(priceNum) && priceNum >= 1;
  const badType = file && !MIMES.includes(fileMime(file) as Mime);

  async function waitClean(fileId: string): Promise<boolean> {
    setPhase('scan');
    for (let i = 0; i < POLL_TRIES; i++) {
      const f = (await api.POST('/admin/media/sticker-uploads/{fileId}/confirm', { params: { path: { fileId } } })).data!.data;
      if (f.scanStatus === 'clean') return true;
      if (f.scanStatus === 'infected') throw new Error('Файл не прошёл проверку на вирусы.');
      if (f.scanStatus === 'failed') throw new Error('Проверка файла не удалась. Попробуйте другой файл.');
      await sleep(POLL_MS);
    }
    return false;
  }

  async function start() {
    if (!file || !valid) return;
    setMessage(null);
    try {
      setPhase('hash');
      const sha256 = await sha256Hex(file);
      setPhase('presign');
      const presigned = (
        await api.POST('/admin/media/sticker-uploads', {
          body: { mime: fileMime(file) as Mime, sizeBytes: file.size, sha256 },
        })
      ).data!.data;
      setPhase('upload');
      const form = new FormData();
      for (const [k, v] of Object.entries(presigned.upload.fields)) form.append(k, v);
      form.append('file', file);
      let uploaded: Response;
      try {
        uploaded = await fetch(presigned.upload.url, { method: 'POST', body: form });
      } catch {
        throw new Error('Не удалось отправить файл в хранилище (сеть или CORS).');
      }
      if (!uploaded.ok) throw new Error(`Хранилище отклонило файл (HTTP ${uploaded.status}).`);
      setPhase('confirm');
      await api.POST('/admin/media/sticker-uploads/{fileId}/confirm', { params: { path: { fileId: presigned.fileId } } });
      if (!(await waitClean(presigned.fileId))) {
        throw new Error('Проверка файла идёт дольше обычного. Попробуйте ещё раз чуть позже.');
      }
      setPhase('add');
      await api.POST('/admin/stars/gifts', {
        body: { title: title.trim(), priceStars: priceNum, fileId: presigned.fileId },
      });
      setPhase('done');
      setFile(null);
      setTitle('');
      setPrice('');
      setInputKey((k) => k + 1);
      toast.success('Подарок добавлен');
      onAdded();
    } catch (e) {
      const text = e instanceof Error && !('code' in e) ? e.message : growthError(e);
      setPhase('error');
      setMessage(text);
      toast.error(text);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-4">
      <div className="mb-3 font-medium text-heading">Новый подарок</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Картинка" htmlFor="gf-file" hint="PNG, WEBP (в т. ч. анимированный), GIF — до 1 МБ, лучше 512×512 с прозрачным фоном." className="min-w-56 flex-1">
          <Input
            key={inputKey}
            id="gf-file"
            type="file"
            accept={MIMES.join(',')}
            disabled={busy}
            className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPhase('idle');
              setMessage(null);
            }}
          />
        </Field>
        <Field label="Название" htmlFor="gf-title">
          <Input id="gf-title" className="w-44" maxLength={64} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Цена, звёзд" htmlFor="gf-price">
          <Input id="gf-price" className="w-28" inputMode="numeric" value={price} disabled={busy} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Button variant="gold" loading={busy} disabled={!valid || !!badType || busy} onClick={() => void start()}>
          <UploadSimple size={16} /> Добавить
        </Button>
      </div>
      {badType ? <p className="mt-2 text-xs text-danger">Этот формат не подходит.</p> : null}
      {busy ? (
        <div className="mt-3 space-y-1.5">
          <ProgressBar value={(stepIndex + 1) / (STEPS.length + 1)} />
          <p className="text-xs text-muted">{STEPS[stepIndex]?.text}</p>
        </div>
      ) : null}
      {phase === 'done' ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
          <CheckCircle size={14} weight="fill" /> Подарок в каталоге.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-danger">
          <WarningCircle size={14} className="mt-px shrink-0" /> {message}
        </p>
      ) : null}
    </div>
  );
}
