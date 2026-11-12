'use client';

import { Image as ImageIcon, Paperclip, SpinnerGap, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AI_IMAGE_ACCEPT, AI_IMAGES_PER_REQUEST, imagesOf, uploadAiImage } from '@/lib/ai-images';
import { cn } from '@/lib/utils';

/** One picture: an upload in progress, a ready file id, or an error. */
export interface AttachedImage {
  key: string;
  name: string;
  state: 'uploading' | 'ready' | 'error';
  step?: string;
  fileId?: string;
  error?: string;
  /** A local preview (object URL) or the server's short signed link. */
  preview?: string | null;
}

/** The ready file ids, in order. */
export const readyIds = (list: AttachedImage[]) =>
  list.flatMap((i) => (i.state === 'ready' && i.fileId ? [i.fileId] : []));
export const anyUploading = (list: AttachedImage[]) => list.some((i) => i.state === 'uploading');

/**
 * Owner 2026-11-12 (row 48): attach screenshots and photos for the AI — paste
 * (Ctrl/⌘+V) anywhere in the wrapped field, drag and drop, or the paperclip.
 * The same chips as the support composer; the rest of the page is unchanged.
 * Pictures go to our private storage only (never to GitHub).
 */
export function ImageAttach({
  value,
  onChange,
  children,
  disabled,
  label = 'Прикрепить картинки',
}: {
  value: AttachedImage[];
  onChange: (next: AttachedImage[] | ((cur: AttachedImage[]) => AttachedImage[])) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const patch = (key: string, p: Partial<AttachedImage>) =>
    onChange((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  function add(files: File[]) {
    if (disabled) return;
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      let preview: string | null = null;
      try {
        preview = URL.createObjectURL(file);
        urls.current.push(preview);
      } catch {
        preview = null;
      }
      onChange((cur) => [...cur, { key, name: file.name || 'скриншот', state: 'uploading', preview }]);
      uploadAiImage(file, (step) => patch(key, { step })).then(
        (fileId) => patch(key, { state: 'ready', fileId, step: undefined }),
        (e: unknown) => patch(key, { state: 'error', error: e instanceof Error ? e.message : 'Не удалось загрузить' }),
      );
    }
  }

  return (
    <div
      onPaste={(e) => {
        const files = imagesOf(e.clipboardData?.files);
        if (files.length > 0) {
          e.preventDefault();
          add(files);
        }
      }}
      onDragOver={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const files = imagesOf(e.dataTransfer.files);
        if (files.length > 0) {
          e.preventDefault();
          add(files);
        }
      }}
      className={cn('grid gap-2 rounded-lg', over && 'ring-2 ring-gold-500/60')}
      data-testid="ai-image-attach"
    >
      {children}
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((f) => (
            <li
              key={f.key}
              className={cn(
                'flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                f.state === 'error' ? 'border-danger/50 bg-danger-soft text-danger' : 'border-line bg-surface-2 text-ink',
              )}
              title={f.error}
            >
              {f.state === 'uploading' ? (
                <SpinnerGap size={14} className="animate-spin text-muted" />
              ) : f.state === 'error' ? (
                <WarningCircle size={14} weight="fill" />
              ) : f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local / short signed preview, not an optimisable asset
                <img src={f.preview} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <ImageIcon size={14} weight="light" className="text-gold-600" />
              )}
              <span className="max-w-48 truncate">{f.name}</span>
              {f.state !== 'ready' ? (
                <span className="text-faint">{f.state === 'uploading' ? (f.step ?? '…') : (f.error ?? 'ошибка')}</span>
              ) : null}
              <button
                type="button"
                aria-label={`Убрать ${f.name}`}
                onClick={() => onChange((cur) => cur.filter((x) => x.key !== f.key))}
                className="rounded p-0.5 text-muted hover:bg-line hover:text-ink"
              >
                <X size={12} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={AI_IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            add(imagesOf(e.target.files));
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={14} weight="light" /> {label}
        </Button>
        <span className="text-[11px] text-faint">
          Или вставьте (Ctrl/⌘+V) или перетащите. JPEG, PNG, GIF, WebP. Хранятся у нас, в GitHub не попадают.
          {value.length > AI_IMAGES_PER_REQUEST
            ? ` В один запрос к Claude уходит до ${AI_IMAGES_PER_REQUEST} картинок (и до ~100 МБ): остальные ИИ не увидит.`
            : ''}
        </span>
      </div>
    </div>
  );
}
