'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/hooks';
import { moderationReviewHref, ownerReviewHref, supportReviewHref, verificationReviewHref, type OwnerItemKind } from '@/lib/review-flow';
import { isOwner, staffGet, staffPost, type AppealDetail, type AppealItem, type RetaliationFlag, type Today, type TodaySuggestion } from '@/lib/staff-data';
import { ADVICE_TONE, APPEAL_KIND, SUGGESTION_KIND, WORKSPACE_NAME } from '@/lib/staff-labels';
import { formatDateTime } from '@/lib/utils';
import { ReviewShell, type ReviewAction } from './review-shell';
import { CANDIDATES_KEY, useReviewFlow } from './use-review-flow';

/** One item of the owner's queue (the list carries what the screen shows). */
export type OwnerItem =
  | { kind: 'flag'; id: string; flag?: RetaliationFlag }
  | { kind: 'appeal'; id: string; appeal?: AppealItem }
  | { kind: 'suggestion'; id: string; suggestion?: TodaySuggestion };

const KINDS: readonly OwnerItemKind[] = ['flag', 'appeal', 'suggestion'];
const isKind = (v: string | null): v is OwnerItemKind => !!v && (KINDS as readonly string[]).includes(v);
const keyOf = (i: OwnerItem) => `${i.kind}:${i.id}`;

/** The engine's own list cache (a queue without leases): one fetch for both. */
export const OWNER_ITEMS_KEY = [CANDIDATES_KEY, 'none'] as const;

/**
 * The owner's queue, most urgent first: red flags (a head removed someone
 * who complained), then complaints against heads (oldest first), then the
 * system's suggestions about people. All three are existing calls; a switch
 * that is off simply gives no items of that kind.
 */
export async function fetchOwnerItems(): Promise<OwnerItem[]> {
  const [flags, appeals, today] = await Promise.all([
    staffGet<{ items: RetaliationFlag[] }>('/admin/appeals/flags', { state: 'open' }),
    staffGet<{ items: AppealItem[] }>('/admin/appeals', { state: 'open', limit: 50 }),
    staffGet<Today>('/admin/staff/today'),
  ]);
  const out: OwnerItem[] = [];
  if (flags.ok) for (const f of flags.data.items) if (f.state === 'open') out.push({ kind: 'flag', id: f.id, flag: f });
  if (appeals.ok) {
    const open = appeals.data.items.filter((a) => a.status !== 'resolved').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const a of open) out.push({ kind: 'appeal', id: a.id, appeal: a });
  }
  if (today.ok) for (const s of today.data.suggestions?.items ?? []) out.push({ kind: 'suggestion', id: s.id, suggestion: s });
  return out;
}

const APPEAL_DECISIONS = [
  { value: 'nothing', label: 'Ничего не делать и дальше', danger: false },
  { value: 'fire_worker', label: 'Закончить с исполнителем и дальше', danger: true },
  { value: 'fire_head', label: 'Закончить с главным и дальше', danger: true },
] as const;

const HINT = [
  { key: 'A', text: 'сделать / вернуть' },
  { key: 'R', text: 'не сейчас / согласен / ничего не делать' },
  { key: 'N', text: 'пропустить' },
] as const;

/**
 * Owner 2026-10-28: the owner's desk «…и дальше». Red flags, complaints
 * against heads and the system's suggestions one after another; every
 * decision is the same audited call as on «Жалобы на главных» and «Сегодня»
 * (a fresh 2FA code, nobody else approves). On top: one tap into the other
 * queues' review screens.
 */
export function OwnerReview() {
  const params = useSearchParams();
  const k0 = params.get('kind');
  const id0 = params.get('id');
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const owner = isOwner(me);
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);

  const flow = useReviewFlow<OwnerItem>({
    kind: null,
    initial: isKind(k0) && id0 ? ({ kind: k0, id: id0 } as OwnerItem) : null,
    keyOf,
    candidates: fetchOwnerItems,
    fromLease: () => null,
    prefetch: (i) => {
      if (i.kind === 'appeal') void qc.prefetchQuery({ queryKey: ['staff-appeal', i.id], queryFn: () => staffGet<AppealDetail>(`/admin/appeals/${i.id}`) });
    },
    hrefOf: (i) => ownerReviewHref(i?.kind, i?.id),
  });
  const cur = flow.current;
  useEffect(() => {
    setNote('');
    setRevealed(null);
  }, [cur]);

  // The list row of the item on screen (opened by address: looked up in the list).
  const list = useQuery({ queryKey: OWNER_ITEMS_KEY, queryFn: fetchOwnerItems, enabled: owner && !!cur, staleTime: 30_000 });
  const row = cur ? (list.data?.find((x) => keyOf(x) === keyOf(cur)) ?? cur) : null;
  const appeal = useQuery({
    queryKey: ['staff-appeal', cur?.kind === 'appeal' ? cur.id : ''],
    enabled: cur?.kind === 'appeal',
    queryFn: () => staffGet<AppealDetail>(`/admin/appeals/${cur!.id}`),
  });
  const ad = cur?.kind === 'appeal' && appeal.data?.ok && appeal.data.data.id === cur.id ? appeal.data.data : null;

  const refresh = () => {
    for (const key of [OWNER_ITEMS_KEY, ['staff-appeals'], ['staff-flags'], ['staff-today'], ['staff-people']]) void qc.invalidateQueries({ queryKey: key });
  };
  const n = () => note.trim() || undefined;
  const decide = useMutation({
    mutationFn: async (what: string) => {
      if (!cur) return null;
      if (cur.kind === 'flag') await staffPost(`/admin/appeals/flags/${cur.id}/${what}`, { note: n() });
      else if (cur.kind === 'appeal') await staffPost(`/admin/appeals/${cur.id}/decide`, { decision: what, note: n() });
      else await staffPost(`/admin/staff/suggestions/${cur.id}/decide`, { action: what, note: n() });
      return what;
    },
    onSuccess: (what) => {
      if (!what) return;
      toast.success('Решение записано.');
      refresh();
      return flow.advance(what);
    },
    onError: (e) => toast.error(e),
  });
  const reveal = useMutation({
    mutationFn: () => staffPost<{ name: string; revealsLeftToday: number }>(`/admin/appeals/${cur!.id}/reveal`),
    onSuccess: (r) => {
      setRevealed(r.name);
      toast.info(`Имя раскрыто. Остаток раскрытий на сегодня: ${r.revealsLeftToday}.`);
      void qc.invalidateQueries({ queryKey: ['staff-appeal', cur?.id] });
    },
    onError: (e) => toast.error(e),
  });

  const go = (what: string) => () => decide.mutate(what);
  let actions: ReviewAction[] = [];
  let title = 'Решение владельца';
  let body: React.ReactNode = null;
  if (row?.kind === 'flag') {
    const f = row.flag;
    title = 'Красная пометка';
    actions = [
      { id: 'uphold', label: 'Согласен с главным и дальше', variant: 'outline', shortcut: 'reject', run: go('uphold') },
      { id: 'reverse', label: 'Вернуть к работе и дальше', variant: 'gold', shortcut: 'approve', run: go('reverse') },
    ];
    body = (
      <Card className="space-y-2 p-5" data-testid="owner-review-flag">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger">Открыта</Badge>
          <span className="font-medium text-heading">{f?.subject.label ?? '—'}</span>
          {f ? <span className="text-xs text-faint">жалоба №{f.appealNumber} · пометка с {formatDateTime(f.createdAt)}</span> : null}
        </div>
        <p className="text-sm text-muted">
          Главный снял человека в защитный срок после жалобы.{f?.holdActive ? ` Удержание до ${formatDateTime(f.holdUntil)}.` : ''}
        </p>
      </Card>
    );
  } else if (row?.kind === 'appeal') {
    const a = ad ?? row.appeal;
    title = a ? `Жалоба №${a.number} · на ${a.head.name}` : 'Жалоба на главного';
    actions = APPEAL_DECISIONS.map((d) => ({
      id: d.value,
      label: d.label,
      variant: d.danger ? ('danger' as const) : ('outline' as const),
      shortcut: d.value === 'nothing' ? ('reject' as const) : undefined,
      disabled: !ad || ad.status === 'resolved',
      run: go(d.value),
    }));
    body = (
      <Card className="space-y-3 p-5" data-testid="owner-review-appeal">
        <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
          {a ? <span>{APPEAL_KIND[a.kind] ?? a.kind}</span> : null}
          {a ? <span>· {formatDateTime(a.createdAt)}</span> : null}
          {a?.redFlag ? <Badge tone="danger">Красная пометка</Badge> : null}
        </div>
        <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-ink">{ad?.text ?? a?.excerpt ?? ''}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Автор:</span>
          <span className="font-medium text-heading">{revealed ?? a?.author.label ?? '—'}</span>
          {a?.author.anonymous && !revealed ? (
            <Button size="sm" variant="outline" loading={reveal.isPending} onClick={() => reveal.mutate()}>
              Раскрыть имя
            </Button>
          ) : null}
        </div>
      </Card>
    );
  } else if (row?.kind === 'suggestion') {
    const s = row.suggestion;
    const r = s?.recommendation;
    title = s ? `${r?.adviceLabel ?? 'Предложение'}: ${s.name}` : 'Предложение системы';
    actions = [
      { id: 'dismiss', label: 'Не сейчас и дальше', variant: 'outline', shortcut: 'reject', disabled: !s, run: go('dismiss') },
      { id: 'apply', label: `${r?.actionLabel ?? 'Сделать'} и дальше`, variant: r?.advice === 'replace' ? 'danger' : 'gold', shortcut: 'approve', disabled: !s, run: go('apply') },
    ];
    body = s ? (
      <Card className="space-y-3 p-5" data-testid="owner-review-suggestion">
        <div className="flex flex-wrap items-center gap-2">
          {r ? <Badge tone={ADVICE_TONE[r.advice] ?? 'neutral'}>{r.adviceLabel}</Badge> : null}
          <Link href={`/staff/${s.adminId}`} className="font-medium text-heading hover:underline">
            {s.name}
          </Link>
          <span className="text-xs text-faint">
            {WORKSPACE_NAME[s.workspace] ?? s.workspace} · {SUGGESTION_KIND[s.kind] ?? s.kind}
          </span>
        </div>
        {r ? <p className="text-sm text-ink">{r.headline}</p> : null}
        {r && r.lines.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
            {r.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    ) : (
      <Card className="p-5 text-sm text-muted">Предложение уже решено или скрыто.</Card>
    );
  }

  return (
    <ReviewShell
      eyebrow="Владелец · решения подряд"
      title={title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="owner-review-queues">
          <span>Другие очереди подряд:</span>
          <Link href={verificationReviewHref()} className="text-gold-600 hover:underline">
            заявки адвокатов
          </Link>
          <Link href={moderationReviewHref()} className="text-gold-600 hover:underline">
            жалобы
          </Link>
          <Link href={supportReviewHref()} className="text-gold-600 hover:underline">
            обращения
          </Link>
        </span>
      }
      flow={flow}
      actions={owner ? actions : []}
      busy={decide.isPending}
      backHref="/today"
      backLabel="Сегодня"
      emptyText="Решать больше нечего: пометок, жалоб на главных и предложений нет."
      hint={HINT}
      loading={!row || (cur?.kind === 'appeal' && appeal.isPending)}
    >
      <div className="space-y-3">
        {body}
        <Textarea rows={2} maxLength={500} placeholder="Заметка к решению (по желанию, попадёт в журнал)" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-xs text-faint">Решение требует код из приложения-аутентификатора. Второго утверждающего нет.</p>
      </div>
    </ReviewShell>
  );
}
