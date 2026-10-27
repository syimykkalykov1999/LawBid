'use client';

import { UserCircle } from '@phosphor-icons/react';
import Link from 'next/link';
import { SuggestionCard } from '@/components/staff/suggestion-card';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { isOwner, usePerson, usePersonHistory } from '@/lib/staff-data';
import { ACTION_KIND, MEMBER_STATE, RATING_FLAG, STATUS_LABEL, WORKSPACE_NAME, dayLabel } from '@/lib/staff-labels';
import { formatDateTime } from '@/lib/utils';

const PARTS: [string, 'accuracy' | 'clean' | 'usersVerdict' | 'speed'][] = [
  ['Точность', 'accuracy'],
  ['Без отмен и жалоб', 'clean'],
  ['Оценка людей', 'usersVerdict'],
  ['Скорость', 'speed'],
];

/**
 * One person: rating and why, signals of the last 30 days, the journal of
 * actions, and the open suggestions with their buttons. The owner sees this
 * card only, never the whole journal of decisions.
 */
export function PersonCard({ adminId }: { adminId: string }) {
  const { data: me } = useMe();
  const person = usePerson(adminId, isOwner(me));
  const hist = usePersonHistory(adminId, isOwner(me));
  const p = person.data?.ok ? person.data.data : null;
  const h = hist.data?.ok ? hist.data.data : null;

  if (person.isPending) return <Skeleton className="h-64 w-full" />;
  if (!p) {
    return (
      <EmptyState
        icon={UserCircle}
        title="Карточки нет"
        text="Рейтинг выключен или у человека ещё нет ночного рейтинга. Он появляется, когда набирается достаточно решений."
        action={<Link href="/staff" className="text-sm text-gold-600 hover:underline">К списку людей</Link>}
      />
    );
  }
  const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.ok;
  const st = MEMBER_STATE[h?.state ?? 'active'] ?? MEMBER_STATE.active;
  return (
    <>
      <PageHeader
        eyebrow={WORKSPACE_NAME[p.workspace] ?? p.workspace}
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            {h ? <Badge tone={st.tone}>{st.label}</Badge> : null}
            {h?.stateUntil ? <span className="text-xs">до {dayLabel(h.stateUntil)}</span> : null}
          </span>
        }
      />
      <ErrorNote text={person.error ? errorText(person.error) : hist.error ? errorText(hist.error) : null} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-5" data-testid="person-rating">
          <div className="flex items-end gap-4">
            <div className="font-serif text-5xl font-semibold tabular-nums text-heading">{p.rating == null ? '—' : Math.round(p.rating)}</div>
            <div className="pb-1 text-xs text-faint">
              из 100 · решений {p.decisions}
              {p.rankPct != null ? ` · верхние ${p.rankPct} %` : ''}
            </div>
          </div>
          <dl className="mt-4 space-y-1.5">
            {PARTS.map(([label, key]) => (
              <div key={key} className="flex justify-between text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular-nums text-heading">{p[key] == null ? '—' : Math.round(p[key] as number)}</dd>
              </div>
            ))}
          </dl>
          {p.flags.length > 0 ? (
            <p className="mt-3 text-sm text-warning">Замечено: {p.flags.map((f) => RATING_FLAG[f] ?? f).join('; ')}.</p>
          ) : null}
        </Card>

        <Card className="p-5" data-testid="person-signals">
          <h2 className="mb-2 font-serif text-lg font-semibold text-heading">Сигналы за 30 дней</h2>
          {hist.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : !h || h.signals.length === 0 ? (
            <p className="text-sm text-muted">Сигналов нет.</p>
          ) : (
            <ul className="divide-y divide-line">
              {h.signals.map((x) => (
                <li key={x.kind} className="flex justify-between py-1.5 text-sm">
                  <span className="text-ink">{x.label}</span>
                  <span className="tabular-nums text-heading">{x.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SectionTitle>Что предлагает система</SectionTitle>
      {hist.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : !h || h.recommendations.length === 0 ? (
        <Card className="p-5 text-sm text-muted">Открытых предложений нет.</Card>
      ) : (
        <div className="space-y-3">
          {h.recommendations.map((r) => (
            <SuggestionCard key={r.suggestionId} id={r.suggestionId} adminId={adminId} name={p.name} workspace={p.workspace} kind={r.kind} recommendation={r.recommendation} link={false} />
          ))}
        </div>
      )}

      <SectionTitle>Журнал действий</SectionTitle>
      <Card className="p-5" data-testid="person-actions">
        {!h || h.actions.length === 0 ? (
          <p className="text-sm text-muted">С этим человеком пока ничего не делали.</p>
        ) : (
          <ul className="divide-y divide-line">
            {h.actions.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-heading">{ACTION_KIND[a.kind] ?? a.kind}</span>
                  <span className="text-xs text-faint">{formatDateTime(a.createdAt)}</span>
                </div>
                <div className="text-muted">
                  {RATING_FLAG[a.reasonCode] ?? a.reasonCode}
                  {a.reasonNote ? ` · ${a.reasonNote}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
