// Owner 2026-10-25: the life of a case invoice. Pure functions, shared by
// the billing service, the sweep and the payments reconciliation. Modelled
// on the status sets of Clio / MyCase / LawPay: draft, sent, viewed,
// partially paid, paid, overdue, void.

export type InvoiceStatus =
  'draft' | 'sent' | 'viewed' | 'paid' | 'partially_paid' | 'overdue' | 'void';

export interface InvoiceMoney {
  totalCents: number;
  lateFeeCents: number;
  paidCents: number;
}

/** What is still owed (never negative). */
export function balanceCents(m: InvoiceMoney): number {
  return Math.max(0, m.totalCents + m.lateFeeCents - m.paidCents);
}

/** Open = the client can still be asked to pay. */
export function isOpenInvoice(status: InvoiceStatus): boolean {
  return status !== 'draft' && status !== 'paid' && status !== 'void';
}

/**
 * Status after a payment landed: fully covered = paid, something paid =
 * partially paid; a void or draft invoice never changes here.
 */
export function statusAfterPayment(
  current: InvoiceStatus,
  m: InvoiceMoney,
): InvoiceStatus {
  if (current === 'void' || current === 'draft') return current;
  if (balanceCents(m) === 0) return 'paid';
  return m.paidCents > 0 ? 'partially_paid' : current;
}

/** Sent or viewed or partly paid past its due date becomes overdue. */
export function becomesOverdue(
  status: InvoiceStatus,
  dueAt: Date | null,
  m: InvoiceMoney,
  now: Date,
): boolean {
  if (!dueAt || dueAt.getTime() >= now.getTime()) return false;
  if (balanceCents(m) === 0) return false;
  return (
    status === 'sent' || status === 'viewed' || status === 'partially_paid'
  );
}

/** The late fee: whole cents, percent of the invoice total, 0 when off. */
export function lateFeeFor(totalCents: number, percent: number): number {
  if (!(percent > 0)) return 0;
  return Math.floor((totalCents * Math.min(percent, 100)) / 100);
}

const DAY_MS = 86_400_000;

/** Whole UTC calendar days from [now] to [due] (negative = overdue). */
export function daysUntil(due: Date, now: Date): number {
  const d = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d - n) / DAY_MS);
}

export type ReminderKind = 'invoice_reminder' | 'invoice_overdue';

/**
 * Which reminder, if any, is due now. Before the due date: on each day in
 * [beforeDays] (0 = the due day). After it: every [overdueEveryDays] days
 * (0 = never). At most one a day, never past [maxReminders].
 */
export function dueReminder(args: {
  dueAt: Date;
  now: Date;
  lastRemindedAt: Date | null;
  remindersSent: number;
  beforeDays: readonly number[];
  overdueEveryDays: number;
  maxReminders: number;
}): ReminderKind | null {
  if (args.remindersSent >= args.maxReminders) return null;
  const left = daysUntil(args.dueAt, args.now);
  const last = args.lastRemindedAt;
  if (last && args.now.getTime() - last.getTime() < 20 * 60 * 60 * 1000) {
    return null;
  }
  if (left >= 0) {
    return args.beforeDays.includes(left) ? 'invoice_reminder' : null;
  }
  if (args.overdueEveryDays <= 0) return null;
  if (!last) return 'invoice_overdue';
  const sinceDays = Math.floor((args.now.getTime() - last.getTime()) / DAY_MS);
  return sinceDays >= args.overdueEveryDays ? 'invoice_overdue' : null;
}
