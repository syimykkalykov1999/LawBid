'use client';

import { CheckCircle, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { ProgressBar } from '@/components/billing/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { fileMime, formatBytes, sha256Hex, sleep } from './media-utils';
import { compressSticker } from '@/lib/image-compress';
import { sendToStorage, StorageUploadError } from '@/lib/storage-upload';

type Pack = components['schemas']['AdminStickerPackDto'];
type Mime = components['schemas']['AdminStickerUploadDto']['mime'];

const MIMES: Mime[] = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];
const POLL_MS = 2000;
const POLL_TRIES = 30; // ~1 minute

type Phase = 'idle' | 'compress' | 'hash' | 'presign' | 'upload' | 'confirm' | 'scan' | 'add' | 'done' | 'error' | 'timeout';

const STEPS: { phase: Phase; text: string }[] = [
  { phase: 'compress', text: 'Сжимаем картинку…' },
  { phase: 'hash', text: 'Считаем контрольную сумму…' },
  { phase: 'presign', text: 'Готовим загрузку…' },
  { phase: 'upload', text: 'Загружаем файл…' },
  { phase: 'confirm', text: 'Проверяем файл…' },
  { phase: 'scan', text: 'Проверка на вирусы…' },
  { phase: 'add', text: 'Добавляем в набор…' },
];

/**
 * Admin sticker upload: shrink in the browser (browser-image-compression,
 * 512 px, same format; GIF / animated WEBP untouched) → SHA-256 → presign →
 * send to the presigned target with progress and retries → confirm → wait
 * for a clean scan (confirm is idempotent and returns the file) → add to
 * the pack.
 */
export function StickerUploader({ packId, onAdded }: { packId: string; onAdded: (p: Pack) => void }) {
  const toast = useToast();
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [emoji, setEmoji] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  const busy = STEPS.some((s) => s.phase === phase);
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

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

  async function addToPack(fileId: string) {
    setPhase('add');
    const res = await api.POST('/admin/media/sticker-packs/{id}/stickers', {
      params: { path: { id: packId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
      body: { fileId, emoji: emoji.trim() || undefined },
    });
    onAdded(res.data!.data);
    setPhase('done');
    setPendingFileId(null);
    setFile(null);
    setEmoji('');
    setInputKey((k) => k + 1);
    toast.success('Стикер добавлен');
  }

  function fail(e: unknown) {
    const text = e instanceof StorageUploadError || (e instanceof Error && !('code' in e)) ? e.message : growthError(e);
    setPhase('error');
    setMessage(text);
    toast.error(text);
  }

  async function start() {
    if (!file) return;
    setMessage(null);
    try {
      setPhase('compress');
      const shrunk = await compressSticker(file);
      const upload = shrunk.file;
      setSaved(shrunk.compressed ? `${formatBytes(shrunk.originalBytes)} → ${formatBytes(upload.size)}` : null);

      setPhase('hash');
      const sha256 = await sha256Hex(upload);

      setPhase('presign');
      const presigned = (
        await api.POST('/admin/media/sticker-uploads', {
          body: { mime: fileMime(upload) as Mime, sizeBytes: upload.size, sha256 },
        })
      ).data!.data;

      setPhase('upload');
      setSent(0);
      await sendToStorage(presigned.upload, upload, { onProgress: setSent });

      setPhase('confirm');
      await api.POST('/admin/media/sticker-uploads/{fileId}/confirm', { params: { path: { fileId: presigned.fileId } } });
      setPendingFileId(presigned.fileId);

      if (!(await waitClean(presigned.fileId))) {
        setPhase('timeout');
        setMessage('Проверка файла идёт дольше обычного. Подождите и нажмите «Проверить снова».');
        return;
      }
      await addToPack(presigned.fileId);
    } catch (e) {
      fail(e);
    }
  }

  async function retry() {
    if (!pendingFileId) return;
    setMessage(null);
    try {
      if (!(await waitClean(pendingFileId))) {
        setPhase('timeout');
        setMessage('Файл всё ещё проверяется. Попробуйте ещё раз чуть позже.');
        return;
      }
      await addToPack(pendingFileId);
    } catch (e) {
      fail(e);
    }
  }

  const badType = file && !MIMES.includes(fileMime(file) as Mime);

  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-4">
      <div className="mb-3 font-medium text-heading">Добавить стикер</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Картинка" htmlFor="st-file" hint="PNG, WEBP, JPEG или GIF." className="min-w-56 flex-1">
          <Input
            key={inputKey}
            id="st-file"
            type="file"
            accept={MIMES.join(',')}
            disabled={busy}
            className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPhase('idle');
              setMessage(null);
              setPendingFileId(null);
              setSaved(null);
            }}
          />
        </Field>
        <Field label="Эмодзи" htmlFor="st-emoji">
          <Input id="st-emoji" className="w-20 text-center" maxLength={16} placeholder="👍" value={emoji} disabled={busy} onChange={(e) => setEmoji(e.target.value)} />
        </Field>
        {phase === 'timeout' && pendingFileId ? (
          <Button variant="outline" onClick={() => void retry()}>
            Проверить снова
          </Button>
        ) : (
          <Button variant="gold" loading={busy} disabled={!file || !!badType || busy} onClick={() => void start()}>
            <UploadSimple size={16} /> Загрузить
          </Button>
        )}
      </div>
      {badType ? <p className="mt-2 text-xs text-danger">Этот формат не подходит.</p> : null}
      {busy ? (
        <div className="mt-3 space-y-1.5">
          <ProgressBar value={(stepIndex + (phase === 'upload' ? sent : 1)) / (STEPS.length + 1)} />
          <p className="text-xs text-muted">
            {STEPS[stepIndex]?.text}
            {phase === 'upload' && sent > 0 ? ` ${Math.round(sent * 100)} %` : ''}
          </p>
        </div>
      ) : null}
      {phase === 'done' ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
          <CheckCircle size={14} weight="fill" /> Стикер добавлен в набор.{saved ? ` Сжато: ${saved}.` : ''}
        </p>
      ) : null}
      {message ? (
        <p className={`mt-3 flex items-start gap-1.5 text-xs ${phase === 'timeout' ? 'text-warning' : 'text-danger'}`}>
          <WarningCircle size={14} className="mt-px shrink-0" /> {message}
        </p>
      ) : null}
    </div>
  );
}
