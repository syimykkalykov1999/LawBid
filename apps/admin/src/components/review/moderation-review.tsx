'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useReason } from '@/components/reason-dialog';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { label, MOD_ACTION, REPORT_REASON, ROLE_TEXT, STATUS_LABEL, StatusPill, TARGET_STATUS, TARGET_TYPE } from '@/lib/labels';
import { moderationReviewHref } from '@/lib/review-flow';
import { formatDateTime } from '@/lib/utils';
import { Lightbox } from './lightbox';
import { ReviewShell, type ReviewAction } from './review-shell';
import { useReviewFlow } from './use-review-flow';

type ModCard = components['schemas']['ModerationCardDto'];
type Action = ModCard['availableActions'][number];
type TargetType = ModCard['targetType'];
export interface Target {
  type: TargetType;
  id: string;
}

const DANGER: Action[] = ['remove', 'suspend'];
const keyOf = (t: Target) => `${t.type}:${t.id}`;
/** A target kind from the address or a lease (the API checks the exact list). */
const isType = (v: string | null | undefined): v is TargetType => !!v && /^[a-z_]{2,32}$/.test(v);

/** Same key and call as the complaint card page: one cache for both. */
export const modCardKey = (t: Target) => ['moderation-card', t.type, t.id] as const;
export async function fetchModCard(t: Target): Promise<ModCard> {
  return (await api.GET('/admin/moderation/targets/{type}/{id}', { params: { path: { type: t.type, id: t.id } } })).data!.data;
}

/** Warm up one object: its card and, for a reported photo, the picture. */
export async function prefetchTarget(qc: QueryClient, t: Target): Promise<void> {
  const c = await qc.fetchQuery({ queryKey: modCardKey(t), queryFn: () => fetchModCard(t), staleTime: 30_000 });
  const file = typeof c.context.fileUrl === 'string' ? c.context.fileUrl : null;
  if (file && typeof Image !== 'undefined') new Image().src = file;
}

/**
 * Owner 2026-10-28: complaints in a row. The report (reasons, notes, who),
 * the reported object with a preview (text, photo, voice note) and the
 * author with their history on one screen; every action asks for the reason
 * as on the card and the next object opens in place.
 */
export function ModerationReview() {
  const params = useSearchParams();
  const t0 = params.get('type');
  const id0 = params.get('id');
  const initial: Target | null = isType(t0) && id0 ? { type: t0, id: id0 } : null;
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();

  const flow = useReviewFlow<Target>({
    kind: 'report',
    initial,
    keyOf,
    candidates: async () => {
      const r = await api.GET('/admin/moderation/queue', { params: { query: { status: 'open', limit: 10 } } });
      return (r.data?.data ?? []).map((x) => ({ type: x.targetType, id: x.targetId }));
    },
    fromLease: (l) => (l.kind === 'report' && isType(l.targetType) ? { type: l.targetType, id: l.itemId } : null),
    prefetch: (t) => prefetchTarget(qc, t),
    hrefOf: (t) => moderationReviewHref(t?.type, t?.id),
  });
  const cur = flow.current;
  const q = useQuery({ queryKey: modCardKey(cur ?? { type: 'post', id: '' }), enabled: !!cur, queryFn: () => fetchModCard(cur!) });
  const c = cur && q.data && q.data.targetId === cur.id ? q.data : undefined;

  const act = useMutation({
    mutationFn: async (action: Action) => {
      if (!cur) return null;
      const a = await ask({
        title: `${MOD_ACTION[action]} и дальше`,
        description:
          action === 'dismiss'
            ? 'Открытые жалобы будут закрыты без уведомления автора.'
            : 'Автор получит уведомление модерации; действие попадёт в журнал аудита.',
        label: 'Причина',
        min: 3,
        confirm: `${MOD_ACTION[action]} и дальше`,
        danger: DANGER.includes(action),
      });
      if (!a) return null;
      await api.POST('/admin/moderation/targets/{type}/{id}/actions', { params: { path: { type: cur.type, id: cur.id } }, body: { action, reason: a.text } });
      return action;
    },
    onSuccess: (action) => {
      if (!action || !cur) return;
      toast.success('Готово, действие записано в журнал');
      void qc.invalidateQueries({ queryKey: modCardKey(cur) });
      void qc.invalidateQueries({ queryKey: ['moderation-queue'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      return flow.advance(action);
    },
    onError: (e) => toast.error(e),
  });

  const avail = c?.availableActions ?? [];
  const open = c ? c.reports.filter((r) => r.status === 'open').length : 0;
  const approveAction: Action | undefined = (['hide', 'remove'] as Action[]).find((a) => avail.includes(a));
  const actions: ReviewAction[] = [
    ...(open > 0 ? [{ id: 'dismiss', label: 'Отклонить жалобу и дальше', variant: 'outline' as const, shortcut: 'reject' as const, run: () => act.mutate('dismiss') }] : []),
    ...avail
      .filter((a) => a !== 'dismiss')
      .map((a) => ({
        id: a,
        label: `${MOD_ACTION[a]} и дальше`,
        variant: DANGER.includes(a) ? ('danger' as const) : a === approveAction ? ('gold' as const) : ('outline' as const),
        shortcut: a === approveAction ? ('approve' as const) : undefined,
        run: () => act.mutate(a),
      })),
  ];
  const hint = [
    ...(approveAction ? [{ key: 'A', text: MOD_ACTION[approveAction].toLowerCase() }] : []),
    { key: 'R', text: 'отклонить жалобу' },
    { key: 'N', text: 'пропустить' },
    { key: 'Esc', text: 'закрыть просмотр' },
  ];

  return (
    <>
      {dialog}
      <ReviewShell
        eyebrow="Модерация · жалобы подряд"
        title={c ? (TARGET_TYPE[c.targetType] ?? c.targetType) : 'Жалоба'}
        subtitle={
          c && cur ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {c.status ? <StatusPill map={TARGET_STATUS} value={c.status} /> : null}
              открытых жалоб: {open}
              <Link href={`/moderation/${cur.type}/${cur.id}`} className="text-gold-600 hover:underline">
                полная карточка
              </Link>
            </span>
          ) : null
        }
        flow={flow}
        actions={actions}
        busy={act.isPending}
        backHref="/moderation"
        backLabel="К списку"
        emptyText="Очередь пуста — новых жалоб нет."
        hint={hint}
        loading={!!cur && !c}
      >
        {c ? <ModerationBody card={c} /> : null}
      </ReviewShell>
    </>
  );
}

function ModerationBody({ card: c }: { card: ModCard }) {
  const [zoom, setZoom] = useState(false);
  const file = typeof c.context.fileUrl === 'string' ? c.context.fileUrl : null;
  const voice = typeof c.context.voiceUrl === 'string' ? c.context.voiceUrl : null;
  const [fileIsImage, setFileIsImage] = useState(true);
  const reasons = Array.from(new Set(c.reports.map((r) => r.reason)));
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Жалобы ({c.reports.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <Badge key={r} tone="warning">
                {REPORT_REASON[r] ?? r}
              </Badge>
            ))}
          </div>
          <ul className="max-h-[50vh] space-y-2 overflow-auto">
            {c.reports.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-2 p-2 text-xs">
                <div className="text-muted">
                  {formatDateTime(r.createdAt)} · {REPORT_REASON[r.reason] ?? r.reason}
                </div>
                {r.note ? <div className="mt-0.5 text-ink">{r.note}</div> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="lg:col-span-6">
        <CardHeader>
          <CardTitle>Что пожаловались</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm" data-testid="moderation-preview">
          {c.text ? <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-ink">{c.text}</pre> : <p className="text-muted">Без текста</p>}
          {file && fileIsImage ? (
            <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-surface-2" aria-label="Открыть фото">
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset */}
              <img src={file} alt="Файл из жалобы" className="mx-auto h-[40vh] min-h-48 w-full object-contain" onError={() => setFileIsImage(false)} />
            </button>
          ) : null}
          {file && !fileIsImage ? (
            <a href={file} target="_blank" rel="noopener noreferrer" className="text-gold-600 hover:underline">
              Открыть файл ↗
            </a>
          ) : null}
          {voice ? <audio controls src={voice} className="w-full" /> : null}
          {c.createdAt ? <p className="text-xs text-muted">создано {formatDateTime(c.createdAt)}</p> : null}
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Автор</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {c.author ? (
            <>
              <Link href={`/users/${c.author.id}`} className="font-medium text-heading hover:underline">
                {[c.author.firstName, c.author.lastName].filter(Boolean).join(' ') || c.author.username || c.author.id}
              </Link>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{label(ROLE_TEXT, c.author.role)}</span>
                <StatusPill map={STATUS_LABEL} value={c.author.status} />
              </div>
              <div className="text-xs">
                предупреждений: {c.author.warnings} · приостановок: {c.author.suspensions}
              </div>
            </>
          ) : (
            <p className="text-muted">Неизвестен</p>
          )}
          <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">История</h3>
          {c.authorHistory.length === 0 ? <p className="text-xs text-muted">Нарушений нет</p> : null}
          <ul className="max-h-[30vh] space-y-1 overflow-auto text-xs">
            {c.authorHistory.map((h) => (
              <li key={h.id}>
                <span className="font-medium">{MOD_ACTION[h.action] ?? h.action}</span> · {TARGET_TYPE[h.targetType] ?? h.targetType} · {formatDateTime(h.createdAt)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {zoom && file ? <Lightbox images={[{ src: file, alt: 'Файл из жалобы' }]} index={0} onIndex={() => undefined} onClose={() => setZoom(false)} /> : null}
    </div>
  );
}
