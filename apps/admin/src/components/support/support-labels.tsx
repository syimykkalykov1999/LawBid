import { Badge, type Tone } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';
import { PRIORITY, TICKET_CATEGORY } from '@/lib/labels';
import type { Me } from '@/lib/hooks';
import { can } from '@/lib/rbac';

export type TicketRow = components['schemas']['AdminSupportTicketRowDto'];
export type TicketDetail = components['schemas']['AdminSupportTicketDetailDto'];
export type TicketMessage = components['schemas']['AdminSupportMessageDto'];
export type SupportMacro = components['schemas']['SupportMacroDto'];
export type DeskSettings = components['schemas']['SupportDeskSettingsDto'];
export type SupportAgent = components['schemas']['SupportAgentDto'];
export type StaffStats = components['schemas']['SupportStaffStatsDto'];
export type TicketStatus = TicketRow['status'];
export type TicketPriority = TicketRow['priority'];
export type TicketCategory = TicketRow['category'];

export const STATUSES: TicketStatus[] = ['open', 'waiting_user', 'resolved', 'closed'];
export const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
export const CATEGORIES: TicketCategory[] = ['account', 'billing', 'verification', 'case', 'bug', 'abuse', 'other'];

/** Answer tickets with the support toggle on "manage"; "view" only reads. */
export function canWriteSupport(me: Me | undefined): boolean {
  return can(me, 'support', 'manage');
}

const PRIORITY_TONE: Record<TicketPriority, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};

export function PriorityBadge({ value }: { value: TicketPriority }) {
  return (
    <Badge tone={PRIORITY_TONE[value]} dot={value === 'high' || value === 'urgent'}>
      {PRIORITY[value] ?? value}
    </Badge>
  );
}

export function CategoryBadge({ value }: { value: TicketCategory }) {
  return <Badge tone="neutral">{TICKET_CATEGORY[value] ?? value}</Badge>;
}

/** "только что", "5 мин назад", "3 ч назад", "вчера", "4 дн. назад", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** Minutes → "12 мин" / "3 ч 5 мин" / "2 д 4 ч". */
export function minutesText(m: number | null | undefined): string {
  if (m == null) return '—';
  const total = Math.round(m);
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  if (h < 24) return total % 60 ? `${h} ч ${total % 60} мин` : `${h} ч`;
  return `${Math.floor(h / 24)} д ${h % 24} ч`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

/** «до ответа 25 мин» / «просрочено 10 мин»; null when no answer is due. */
export function slaText(dueAt: string | null | undefined, now = Date.now()): { text: string; late: boolean; soon: boolean } | null {
  if (!dueAt) return null;
  const min = Math.round((new Date(dueAt).getTime() - now) / 60_000);
  if (min < 0) return { text: `просрочено ${durationText(-min)}`, late: true, soon: false };
  return { text: `ответить за ${durationText(min)}`, late: false, soon: min <= 15 };
}

function durationText(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ч${min % 60 ? ` ${min % 60} мин` : ''}`;
  return `${Math.floor(h / 24)} дн`;
}

/** SLA chip on a ticket: red when late, amber when due within 15 min. */
export function SlaBadge({ dueAt, breached }: { dueAt?: string | null; breached?: boolean }) {
  const s = slaText(dueAt);
  if (!s) return breached ? <Badge tone="danger" dot>просрочено</Badge> : null;
  return (
    <Badge tone={s.late || breached ? 'danger' : s.soon ? 'warning' : 'neutral'} dot={s.late || s.soon}>
      {s.text}
    </Badge>
  );
}
