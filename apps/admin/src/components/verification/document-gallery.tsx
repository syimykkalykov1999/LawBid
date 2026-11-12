'use client';

import { FilePdf } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Lightbox, type LightboxImage } from '@/components/review/lightbox';
import { Skeleton } from '@/components/ui/empty';
import { DOC_TYPE } from '@/lib/labels';
import { cardJustification, galleryRows, isPdf, isViewableDoc, type ReviewDoc } from '@/lib/review-flow';
import { useDocLinks } from '@/lib/verification-doc-links';
import { LazyImg } from '@/components/ui/lazy-img';

export type GalleryDoc = ReviewDoc;

/** «водительские права (лицевая)» — the row label of a document. */
export function docTitle(d: { docType: string; side?: string | null }): string {
  return `${DOC_TYPE[d.docType] ?? d.docType}${d.side ? ` (${d.side === 'front' ? 'лицевая' : 'оборот'})` : ''}`;
}

/**
 * Owner 2026-11-04 (R-393): the document thumbnails under the «Документы»
 * rows of a request card. Row 1 — the ID document (front, back), row 2 — the
 * bar license and the selfie, anything else two per row. Every frame is the
 * same size (fixed 4:3, the width follows the card, so it grows on a big
 * monitor), the picture is shown whole (object-contain), a PDF is an icon
 * tile. A click opens the full-screen lightbox over the page. Each signed
 * link is asked once and reused (cache until the signature ends).
 *
 * Owner 2026-11-04 (R-400): [actions] — the registry button and the copy
 * chips, drawn as a compact bar under the thumbnails and, as [lastSlide],
 * under the last document inside the lightbox.
 *
 * Owner 2026-11-12 (row 57): the request card shows its documents ONCE —
 * here. [meta] draws under each thumbnail what the old list row said (type,
 * size, date, antivirus, the attorney's note, the selfie camera) and its
 * «Открыть» button; [empty] is shown when there are no documents.
 */
export function DocumentGallery<T extends GalleryDoc>({
  requestId,
  documents,
  actions,
  lastSlide,
  meta,
  empty,
}: {
  requestId: string;
  documents: readonly T[];
  actions?: React.ReactNode;
  lastSlide?: React.ReactNode;
  meta?: (doc: T) => React.ReactNode;
  empty?: React.ReactNode;
}) {
  const rows = useMemo(() => galleryRows(documents), [documents]);
  const viewable = useMemo(() => rows.flat().filter(isViewableDoc), [rows]);
  const links = useDocLinks(cardJustification(requestId), viewable);
  const [open, setOpen] = useState<number | null>(null);

  const shown = viewable.filter((d) => links.urls[d.id]);
  const items: LightboxImage[] = shown.map((d) => ({ src: links.urls[d.id]!, alt: docTitle(d), kind: isPdf(d) ? 'pdf' : 'image' }));

  if (rows.length === 0) {
    if (!empty && !actions) return null;
    return (
      <>
        {empty}
        {actions ? <div className="mt-4" data-testid="document-gallery-actions">{actions}</div> : null}
      </>
    );
  }
  return (
    <div className="mt-4 space-y-3" data-testid="document-gallery">
      {links.capped ? <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Лимит просмотров документов на этот час исчерпан — откройте позже.</p> : null}
      {rows.map((row) => (
        <div key={row.map((d) => d.id).join(',')} className="grid grid-cols-2 gap-3" data-testid="document-gallery-row">
          {row.map((d) => (
            <Thumb key={d.id} doc={d} url={links.urls[d.id]} loading={links.loading} onOpen={() => setOpen(shown.findIndex((x) => x.id === d.id))} meta={meta?.(d)} />
          ))}
        </div>
      ))}
      {actions ? <div data-testid="document-gallery-actions">{actions}</div> : null}
      {open !== null && open >= 0 ? <Lightbox images={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} lastSlide={lastSlide} /> : null}
    </div>
  );
}

const FRAME = 'aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-2';

function Thumb({ doc, url, loading, onOpen, meta }: { doc: GalleryDoc; url: string | undefined; loading: boolean; onOpen: () => void; meta?: React.ReactNode }) {
  const title = docTitle(doc);
  let body: React.ReactNode;
  if (!isViewableDoc(doc)) {
    body = (
      <div className={`${FRAME} grid place-items-center p-3 text-center text-xs text-muted`} data-testid="document-thumb-frame">
        {doc.scanStatus !== 'clean' ? 'антивирус ещё не пропустил файл' : `${doc.mime}: только по кнопке «Открыть»`}
      </div>
    );
  } else if (!url) {
    body = loading ? (
      <Skeleton className={FRAME} />
    ) : (
      <div className={`${FRAME} grid place-items-center text-xs text-muted`} data-testid="document-thumb-frame">
        не открылся
      </div>
    );
  } else {
    body = (
      <button type="button" onClick={onOpen} aria-label={`Открыть на весь экран: ${title}`} className={`${FRAME} block cursor-zoom-in`} data-testid="document-thumb-frame">
        {isPdf(doc) ? (
          <span className="grid h-full w-full place-items-center text-faint" data-testid="document-thumb-pdf">
            <span className="grid justify-items-center gap-1">
              <FilePdf size={48} weight="light" />
              <span className="text-xs font-medium">PDF</span>
            </span>
          </span>
        ) : (
          <LazyImg src={url} alt={title} className="h-full w-full object-contain" />
        )}
      </button>
    );
  }
  return (
    <figure className="min-w-0" data-testid="document-thumb">
      {body}
      <figcaption className="mt-1 truncate text-center text-xs text-muted">{title}</figcaption>
      {meta ? <div data-testid="document-thumb-meta">{meta}</div> : null}
    </figure>
  );
}
