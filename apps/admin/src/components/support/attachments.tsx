'use client';

import { DownloadSimple, FileText, FilmSlate } from '@phosphor-icons/react';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { formatBytes } from '@/components/media/media-utils';
import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/utils';

export type Attachment = components['schemas']['SupportAttachmentDto'];

/**
 * Files of one message (owner 2026-10-18): photos as thumbnails that open
 * in a lightbox, videos with a player, documents as download rows. Links
 * are short-lived signed URLs from the API; a file still being scanned has
 * no link and shows as «проверяется».
 */
export function AttachmentList({ items, mine }: { items: Attachment[]; mine?: boolean }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (items.length === 0) return null;
  const media = items.filter((a) => a.isImage || a.isVideo);
  const files = items.filter((a) => !a.isImage && !a.isVideo);
  return (
    <div className={cn('mt-2 flex flex-col gap-2', mine ? 'items-end' : 'items-start')}>
      {media.length > 0 ? (
        <div className={cn('flex flex-wrap gap-2', mine && 'justify-end')}>
          {media.map((a) =>
            a.isVideo ? (
              a.url ? (
                <video
                  key={a.id}
                  src={a.url}
                  controls
                  preload="metadata"
                  className="max-h-60 max-w-full rounded-xl border border-line bg-black"
                />
              ) : (
                <Pending key={a.id} a={a} />
              )
            ) : a.previewUrl || a.url ? (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpen(a)}
                className="overflow-hidden rounded-xl border border-line transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none"
                aria-label={`Открыть фото ${a.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={a.previewUrl ?? a.url ?? ''} alt={a.name} className="h-28 w-28 object-cover sm:h-36 sm:w-36" />
              </button>
            ) : (
              <Pending key={a.id} a={a} />
            ),
          )}
        </div>
      ) : null}
      {files.map((a) =>
        a.url ? (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            className="flex max-w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
          >
            <FileText size={20} weight="light" className="shrink-0 text-gold-600" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{a.name}</span>
              <span className="block text-[11px] text-faint">{formatBytes(a.sizeBytes)}</span>
            </span>
            <DownloadSimple size={16} weight="light" className="shrink-0 text-muted" />
          </a>
        ) : (
          <Pending key={a.id} a={a} />
        ),
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name} wide>
        {open ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={open.url ?? open.previewUrl ?? ''} alt={open.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
            {open.url ? (
              <a href={open.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">
                Открыть оригинал
              </a>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Pending({ a }: { a: Attachment }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-faint">
      {a.isVideo ? <FilmSlate size={16} weight="light" /> : <FileText size={16} weight="light" />}
      {a.name} — проверяется
    </span>
  );
}
