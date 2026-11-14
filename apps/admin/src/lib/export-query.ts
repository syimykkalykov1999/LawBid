/**
 * Row 180 follow-up B7: the money lists send their filters to the CSV
 * export, so the file is what the list shows (Stripe Dashboard «Export»
 * exports the filtered list). Pure (unit-tested in export-query.test.ts).
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A YYYY-MM-DD from the address, or '' when it is not one. */
export const dayParam = (v: string): string => (DAY.test(v) ? v : '');

/** Local midnight of a YYYY-MM-DD as ISO (the list's `from`). */
function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** Local midnight of the day after (the list's exclusive `to`). */
function dayAfter(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** «Платежи и возвраты»: the Payments tab's status and dates; the other
 * tabs are other lists, so their CSV stays the whole table. */
export function paymentsCsvQuery(tab: string, status: string, from: string, to: string): Record<string, string | undefined> | undefined {
  if (tab !== 'payments') return undefined;
  const f = dayParam(from);
  const t = dayParam(to);
  return {
    status: status || undefined,
    from: f ? dayStart(f) : undefined,
    to: t ? dayAfter(t) : undefined,
  };
}

/** «Оплаты адвокатам» → Платежи: the status tab («Споры» = disputed), the
 * person and the case (ids that are not ids yet are not sent, as the list). */
export function casePaymentsCsvQuery(
  tab: string,
  status: string,
  userId: string,
  caseId: string,
): Record<string, string | boolean | undefined> | undefined {
  if (tab !== 'payments') return undefined;
  const u = userId.trim();
  const c = caseId.trim();
  return {
    status: status === 'all' || status === 'disputes' ? undefined : status,
    disputed: status === 'disputes' ? true : undefined,
    userId: UUID.test(u) ? u : undefined,
    caseId: UUID.test(c) ? c : undefined,
  };
}
