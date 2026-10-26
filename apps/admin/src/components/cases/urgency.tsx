import { CalendarBlank, Timer } from '@phosphor-icons/react';
import { Badge, type Tone } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';

type Row = Pick<components['schemas']['AdminCaseRowDto'], 'urgency' | 'urgencyLevel' | 'deadlineAt' | 'deadlineKind'>;
type Level = components['schemas']['CaseUrgencyLevel'];

/** Owner 2026-10-05: the urgency the client picked, or the level its date implies today. */
export const URGENCY_LEVEL: Record<Level, string> = {
  flexible: 'не срочно',
  within_month: 'в течение месяца',
  soon: 'на этой неделе',
  urgent: 'срочно',
  very_urgent: 'очень срочно',
  overdue: 'дата прошла',
};

const DEADLINE_KIND: Record<components['schemas']['CaseDeadlineKind'], string> = {
  court_hearing: 'заседание суда',
  filing_deadline: 'срок подачи',
  meeting: 'встреча',
  signing: 'подписание',
  other: 'другое',
};

const toneOf = (level: Level | null): Tone =>
  level === 'urgent' || level === 'very_urgent' || level === 'overdue' ? 'danger' : level === 'soon' ? 'gold' : 'neutral';

/** `2026-11-03` → `3 нояб. 2026` (a calendar date, no time zone shift). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The date and its kind ("заседание суда · 3 нояб. 2026"), or null without a date. */
export function deadlineText(c: Row): string | null {
  if (!c.deadlineAt) return null;
  return [c.deadlineKind ? DEADLINE_KIND[c.deadlineKind] : null, formatDay(c.deadlineAt)].filter(Boolean).join(' · ');
}

/** A small badge for the cases list: the level, with the date when there is one. */
export function UrgencyBadge({ c }: { c: Row }) {
  if (!c.urgencyLevel && !c.deadlineAt) return null;
  const date = deadlineText(c);
  return (
    <Badge tone={toneOf(c.urgencyLevel)} title={date ?? undefined}>
      {c.deadlineAt ? <CalendarBlank size={11} /> : <Timer size={11} />}
      {c.urgencyLevel ? URGENCY_LEVEL[c.urgencyLevel] : null}
      {c.deadlineAt ? ` · ${formatDay(c.deadlineAt)}` : null}
    </Badge>
  );
}
