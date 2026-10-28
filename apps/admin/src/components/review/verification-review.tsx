'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { FileText, IdentificationCard, UserFocus } from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { useReason } from '@/components/reason-dialog';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { RegistryResult } from '@/components/verification/registry-result';
import { SelfieCaptureNote } from '@/components/verification/selfie-capture-note';
import { api, ApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { DOC_TYPE, label, LICENSE_STATUS, REJECTION_CODE, REQUEST_STATUS, StatusPill, VERIFICATION_STATUS } from '@/lib/labels';
import { isViewableImage, linkFreshMs, REVIEW_HINT, reviewJustification, splitDocs, verificationReviewHref } from '@/lib/review-flow';
import { formatDateTime } from '@/lib/utils';
import { Lightbox, type LightboxImage } from './lightbox';
import { ReviewShell, type ReviewAction } from './review-shell';
import { useReviewFlow } from './use-review-flow';

type Card = components['schemas']['AdminVerificationRequestDto'];
type Doc = components['schemas']['AdminDocumentDto'];
type QueueItem = components['schemas']['VerificationQueueItemDto'];
type DocLink = components['schemas']['DocumentUrlDto'];

const REJECTION = Object.entries(REJECTION_CODE).map(([value, l]) => ({ value, label: l }));
const ACTIVE = ['submitted', 'in_review', 'needs_more_info'];

/** The card of a request — same key and call as the card page, so both share the cache. */
export const cardKey = (id: string) => ['verification', id] as const;
export async function fetchCard(id: string): Promise<Card> {
  return (await api.GET('/admin/verification/requests/{id}', { params: { path: { id } } })).data!.data;
}

/** A signed link of one document (one audited view; the per-admin hourly cap applies). */
export const docKey = (id: string) => ['verification-doc-url', id] as const;
async function fetchDocLink(requestId: string, documentId: string): Promise<DocLink> {
  const res = await api.POST('/admin/verification/documents/{documentId}/url', {
    params: { path: { documentId }, header: { 'X-Justification': encodeURIComponent(reviewJustification(requestId)) } },
  });
  return res.data!.data;
}

/** Once the hourly cap answered «too many», the screen stops warming up links. */
let capHit = false;
const isCap = (e: unknown) => e instanceof ApiError && e.status === 429;

/** Warm up one request: its card, then the links and the bytes of its pictures. */
export async function prefetchRequest(qc: QueryClient, id: string): Promise<void> {
  const card = await qc.fetchQuery({ queryKey: cardKey(id), queryFn: () => fetchCard(id), staleTime: 30_000 });
  if (capHit) return;
  const { id: ids, selfie } = splitDocs(card.documents);
  for (const d of [...ids, ...selfie].filter(isViewableImage)) {
    try {
      const link = await qc.fetchQuery({
        queryKey: docKey(d.id),
        queryFn: () => fetchDocLink(id, d.id),
        staleTime: (q) => linkFreshMs((q.state.data as DocLink | undefined)?.expiresAt),
      });
      if (typeof Image !== 'undefined') new Image().src = link.url;
    } catch (e) {
      if (isCap(e)) capHit = true;
      return;
    }
  }
}

/** Only for tests: forget the cap answer. */
export function resetDocCapForTests(): void {
  capHit = false;
}

/**
 * Owner 2026-10-28: the verification review screen. ID document (front /
 * back) on the left, the selfie next to it, the registry answer and the
 * profile on the right; pictures at a working size, a click opens them
 * full-screen. «Одобрить / Отклонить / Запросить данные … и дальше» and
 * «Пропустить» open the next request in place. Step-up (2FA) and the audit
 * rows are the API's, untouched: every decision is the same call as on the
 * request card.
 */
export function VerificationReview() {
  const params = useSearchParams();
  const initialId = params.get('id');
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const flow = useReviewFlow<string>({
    kind: 'verification',
    initial: initialId,
    keyOf: (id) => id,
    candidates: async () => {
      const r = await api.GET('/admin/verification/requests', { params: { query: { limit: 10 } } });
      return ((r.data?.data ?? []) as QueueItem[]).filter((x) => x.status !== 'needs_more_info' && (!x.reviewerId || x.reviewerId === me?.id)).map((x) => x.id);
    },
    fromLease: (l) => (l.kind === 'verification' ? l.itemId : null),
    prefetch: (id) => prefetchRequest(qc, id),
    hrefOf: (id) => verificationReviewHref(id),
  });
  const id = flow.current;

  const q = useQuery({ queryKey: cardKey(id ?? ''), enabled: !!id, queryFn: () => fetchCard(id!) });
  const r = q.data && q.data.id === id ? q.data : undefined;

  const after = (text: string, outcome: string) => {
    toast.success(text);
    void qc.invalidateQueries({ queryKey: ['verification-queue'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (id) void qc.invalidateQueries({ queryKey: cardKey(id) });
    return flow.advance(outcome);
  };
  const p = () => ({ params: { path: { id: id! } } });
  /** A free request is taken first (the same «Взять в работу» call, audited as today). */
  const ensureMine = async (card: Card) => {
    if (card.status === 'submitted' || (card.status === 'needs_more_info' && !card.reviewerId)) {
      await api.POST('/admin/verification/requests/{id}/take', p());
    }
  };

  const approve = useMutation({
    mutationFn: async () => {
      if (!r) return null;
      const pending = r.licenses.filter((l) => l.status === 'pending');
      const ok = await confirm({
        title: 'Одобрить заявку?',
        description:
          pending.length > 0
            ? `Будут подтверждены лицензии без решения (${pending.length}), затем заявка одобрена. Адвокат получит статус «верифицирован».`
            : 'Адвокат получит статус «верифицирован» и уведомление.',
        confirm: 'Одобрить и дальше',
      });
      if (!ok) return null;
      await ensureMine(r);
      for (const l of pending) {
        await api.POST('/admin/verification/requests/{id}/licenses/{licenseId}/decision', {
          params: { path: { id: r.id, licenseId: l.id } },
          body: { decision: 'verified' } as never,
        });
      }
      return api.POST('/admin/verification/requests/{id}/approve', p());
    },
    onSuccess: (x) => (x ? after('Заявка одобрена', 'approve') : undefined),
    onError: (e) => toast.error(e),
  });
  const reject = useMutation({
    mutationFn: async () => {
      if (!r) return null;
      const a = await ask({
        title: 'Отклонить заявку',
        choices: REJECTION,
        choiceLabel: 'Код отказа',
        label: 'Комментарий (необязательно)',
        optionalText: true,
        max: 1000,
        confirm: 'Отклонить и дальше',
        danger: true,
      });
      if (!a) return null;
      await ensureMine(r);
      return api.POST('/admin/verification/requests/{id}/reject', {
        ...p(),
        body: { rejectionCode: a.choice as never, ...(a.text ? { comment: a.text } : {}) },
      });
    },
    onSuccess: (x) => (x ? after('Заявка отклонена', 'reject') : undefined),
    onError: (e) => toast.error(e),
  });
  const requestInfo = useMutation({
    mutationFn: async () => {
      if (!r) return null;
      const a = await ask({ title: 'Запросить данные', label: 'Сообщение адвокату', max: 1000, confirm: 'Отправить и дальше' });
      if (!a) return null;
      await ensureMine(r);
      return api.POST('/admin/verification/requests/{id}/request-info', { ...p(), body: { message: a.text } });
    },
    onSuccess: (x) => (x ? after('Запрос отправлен адвокату', 'request_info') : undefined),
    onError: (e) => toast.error(e),
  });

  const busy = approve.isPending || reject.isPending || requestInfo.isPending;
  const active = !!r && ACTIVE.includes(r.status);
  const otherReviewer = !!r && r.status === 'in_review' && !!r.reviewerId && r.reviewerId !== me?.id;
  const canDecide = active && !otherReviewer;
  const actions: ReviewAction[] = [
    { id: 'info', label: 'Запросить данные и дальше', disabled: !canDecide, run: () => requestInfo.mutate() },
    { id: 'reject', label: 'Отклонить и дальше', variant: 'danger', shortcut: 'reject', disabled: !canDecide, run: () => reject.mutate() },
    { id: 'approve', label: 'Одобрить и дальше', variant: 'gold', shortcut: 'approve', disabled: !canDecide, run: () => approve.mutate() },
  ];
  const name = r ? [r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || `@${r.attorney.username}` : '';

  return (
    <>
      {dialog}
      {confirmDialog}
      <ReviewShell
        eyebrow="Проверка адвокатов · подряд"
        title={r ? name : 'Заявка'}
        subtitle={
          r ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              @{r.attorney.username} · подана {formatDateTime(r.submittedAt)}
              <StatusPill map={REQUEST_STATUS} value={r.status} />
              <Link href={`/verification/${r.id}`} className="text-gold-600 hover:underline">
                полная карточка
              </Link>
            </span>
          ) : null
        }
        flow={flow}
        actions={actions}
        busy={busy}
        backHref="/verification"
        backLabel="К списку"
        emptyText="Очередь пуста: все заявки проверены."
        hint={REVIEW_HINT}
        loading={!!id && !r}
      >
        {r ? (
          <>
            {otherReviewer ? (
              <p className="mb-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-gold-600">Заявку проверяет другой администратор — пропустите её.</p>
            ) : null}
            {!active ? <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Заявка уже решена: {label(REQUEST_STATUS, r.status)}.</p> : null}
            <VerificationBody card={r} name={name} />
          </>
        ) : null}
      </ReviewShell>
    </>
  );
}

function VerificationBody({ card: r, name }: { card: Card; name: string }) {
  const docs = useMemo(() => splitDocs(r.documents), [r.documents]);
  const pictures = useMemo(() => [...docs.id, ...docs.selfie].filter(isViewableImage), [docs]);
  const [open, setOpen] = useState<number | null>(null);
  const links = useDocLinks(r.id, pictures);
  const shown: LightboxImage[] = pictures.map((d) => ({ src: links.urls[d.id] ?? '', alt: docTitle(d) })).filter((x) => x.src);
  const openDoc = (d: Doc) => {
    const i = shown.findIndex((x) => x.src === links.urls[d.id]);
    if (i >= 0) setOpen(i);
  };

  return (
    <>
      {links.capped ? (
        <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Лимит просмотров документов на этот час исчерпан — откройте позже.</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <IdentificationCard size={18} /> Документ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
            {docs.id.length === 0 ? <p className="text-sm text-muted">Документа нет</p> : null}
            {docs.id.map((d) => (
              <Picture key={d.id} doc={d} url={links.urls[d.id]} loading={links.loading} onOpen={() => openDoc(d)} />
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <UserFocus size={18} /> Селфи
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {docs.selfie.length === 0 ? <p className="text-sm text-muted">Селфи нет</p> : null}
            {docs.selfie.map((d) => (
              <div key={d.id} className="grid gap-1.5">
                <Picture doc={d} url={links.urls[d.id]} loading={links.loading} onOpen={() => openDoc(d)} />
                {/* Owner 2026-10-28: how the selfie was taken, right next to it. */}
                <SelfieCaptureNote capture={d.capture} />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Профиль</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row k="Имя" v={name} />
              <Row k="Статус адвоката" v={<StatusPill map={VERIFICATION_STATUS} value={r.attorney.verificationStatus} />} />
              {r.applicantComment ? <Row k="Комментарий" v={r.applicantComment} /> : null}
              {r.infoRequestMessage ? <Row k="Прошлый запрос" v={r.infoRequestMessage} /> : null}
              {r.history.length > 0 ? <Row k="Прошлых заявок" v={String(r.history.length)} /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Лицензии и реестр</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {r.licenses.length === 0 ? <p className="text-muted">Лицензий нет</p> : null}
              {r.licenses.map((l) => (
                <div key={l.id} className="rounded-xl border border-line p-2.5" data-testid="review-license">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-heading">
                      {l.stateCode} · <span className="font-mono text-xs">{l.barNumber}</span>
                    </span>
                    <StatusPill map={LICENSE_STATUS} value={l.status} />
                  </div>
                  {l.registryFlag === 'format_unusual' ? <Badge tone="warning">Номер не по формату штата</Badge> : null}
                  {l.autoCheckResult ? <RegistryResult result={l.autoCheckResult} profileName={name} /> : <p className="mt-1 text-xs text-muted">Автопроверки нет</p>}
                  {l.lookupUrl ? (
                    <a href={l.lookupUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary underline">
                      Открыть в коллегии штата
                    </a>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          {docs.other.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Другие файлы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {docs.other.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <FileText size={16} className="text-faint" />
                    <span>{docTitle(d)}</span>
                    <span className="text-xs text-muted">открываются в полной карточке</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      {open !== null ? <Lightbox images={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** The signed links of the pictures on screen (cached: warmed-up links are reused, not asked again). */
function useDocLinks(requestId: string, docs: Doc[]) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['verification-doc-urls', requestId, docs.map((d) => d.id).join(',')],
    enabled: docs.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      const urls: Record<string, string> = {};
      for (const d of docs) {
        const link = await qc.fetchQuery({
          queryKey: docKey(d.id),
          queryFn: () => fetchDocLink(requestId, d.id),
          staleTime: (x) => linkFreshMs((x.state.data as DocLink | undefined)?.expiresAt),
        });
        urls[d.id] = link.url;
      }
      return urls;
    },
  });
  if (q.error && isCap(q.error)) capHit = true;
  return { urls: q.data ?? {}, loading: q.isPending && docs.length > 0, capped: !!q.error && isCap(q.error) };
}

function Picture({ doc, url, loading, onOpen }: { doc: Doc; url: string | undefined; loading: boolean; onOpen: () => void }) {
  const title = docTitle(doc);
  if (!isViewableImage(doc)) {
    return (
      <div className="grid h-40 place-items-center rounded-xl bg-surface-2 p-3 text-center text-xs text-muted">
        {title}
        <br />
        {doc.scanStatus !== 'clean' ? 'антивирус ещё не пропустил файл' : `${doc.mime}: открывается в полной карточке`}
      </div>
    );
  }
  if (!url) return loading ? <Skeleton className="h-[38vh] min-h-48 w-full rounded-xl" /> : <div className="grid h-40 place-items-center rounded-xl bg-surface-2 text-xs text-muted">{title}: не открылся</div>;
  return (
    <figure>
      <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-surface-2" aria-label={`Открыть: ${title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset */}
        <img src={url} alt={title} className="mx-auto h-[38vh] min-h-48 w-full object-contain" />
      </button>
      <figcaption className="mt-1 text-xs text-muted">{title}</figcaption>
    </figure>
  );
}

function docTitle(d: Doc): string {
  return `${DOC_TYPE[d.docType] ?? d.docType}${d.side ? ` (${d.side === 'front' ? 'лицевая' : 'оборот'})` : ''}`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
