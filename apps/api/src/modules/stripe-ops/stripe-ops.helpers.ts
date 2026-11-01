/**
 * Stripe robustness 2026-10-27: the pure rules of the review queue,
 * dispute reminders, the dispute-rate alarm and the evidence texts.
 * No database, no Stripe: everything here is unit-tested.
 */

export const REVIEW_KINDS = [
  'payout_failed',
  'refund_failed',
  'dispute',
  'early_fraud_warning',
  'account_deauthorized',
  'capability_disabled',
  'reconcile_drift',
  // Algo audit M-4 (owner 2026-10-28): a duplicate subscription the system
  // would not (or could not) fix and refund by itself.
  'duplicate_subscription',
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export type ReviewSlaState = 'ok' | 'due_soon' | 'overdue';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** When staff must have looked at an item that has no Stripe deadline. */
export function slaDueAt(openedAt: Date, slaHours: number): Date {
  return new Date(openedAt.getTime() + Math.max(1, slaHours) * HOUR_MS);
}

/** ok / due_soon (inside the last 25 % of the window, at least 1 h) / overdue. */
export function slaState(
  openedAt: Date,
  dueAt: Date | null,
  now: Date,
): ReviewSlaState {
  if (!dueAt) return 'ok';
  const left = dueAt.getTime() - now.getTime();
  if (left <= 0) return 'overdue';
  const total = Math.max(1, dueAt.getTime() - openedAt.getTime());
  return left <= Math.max(HOUR_MS, total * 0.25) ? 'due_soon' : 'ok';
}

/**
 * Which reminder bucket a moment falls in: the smallest configured number
 * of days D with `daysLeft <= D`; null when still earlier than every bucket
 * (or past the deadline: handled as overdue by the caller).
 */
export function reminderBucket(
  dueAt: Date,
  at: Date,
  days: readonly number[],
): number | null {
  const left = dueAt.getTime() - at.getTime();
  if (left <= 0) return 0;
  const sorted = [...days].sort((a, b) => a - b);
  for (const d of sorted) if (left <= d * DAY_MS) return d;
  return null;
}

/**
 * True when a reminder is due now: we are in a bucket and the last
 * reminder (if any) was sent in a bigger one, so each bucket mails once.
 */
export function reminderDue(input: {
  dueAt: Date;
  now: Date;
  remindedAt: Date | null;
  days: readonly number[];
}): boolean {
  const now = reminderBucket(input.dueAt, input.now, input.days);
  if (now === null) return false;
  if (!input.remindedAt) return true;
  const last = reminderBucket(input.dueAt, input.remindedAt, input.days);
  return last === null || now < last;
}

export type DisputeRateLevel = 'ok' | 'warn' | 'alarm';

export interface DisputeRate {
  disputes: number;
  payments: number;
  ratePercent: number;
  level: DisputeRateLevel;
}

/**
 * Dispute rate over a window against the card-network programs. Thresholds
 * come from the admin settings (defaults: warn 0.5 % = Visa VAMP
 * non-compliant, alarm 1 % = two thirds of VAMP excessive / Mastercard ECM
 * 1.5 %). Below `minCount` disputes the level stays ok (one dispute out of
 * ten payments is not a program).
 */
export function disputeRate(input: {
  disputes: number;
  payments: number;
  warnPercent: number;
  alarmPercent: number;
  minCount: number;
}): DisputeRate {
  const ratePercent =
    input.payments > 0
      ? Math.round((input.disputes / input.payments) * 10_000) / 100
      : 0;
  let level: DisputeRateLevel = 'ok';
  if (input.disputes >= input.minCount) {
    if (ratePercent >= input.alarmPercent) level = 'alarm';
    else if (ratePercent >= input.warnPercent) level = 'warn';
  }
  return {
    disputes: input.disputes,
    payments: input.payments,
    ratePercent,
    level,
  };
}

/** Early fraud warning: refund by itself when the charge is cheap enough. */
export function efwAutoRefund(input: {
  maxCents: number;
  chargeCents: number;
  alreadyRefundedCents: number;
  disputed: boolean;
}): boolean {
  return (
    input.maxCents > 0 &&
    input.chargeCents > 0 &&
    input.chargeCents <= input.maxCents &&
    input.alreadyRefundedCents === 0 &&
    !input.disputed
  );
}

/** What a Stripe dispute status means for our payment row. */
export function disputeOpen(status: string | null | undefined): boolean {
  return (
    !!status &&
    !['won', 'lost', 'warning_closed', 'charge_refunded'].includes(status)
  );
}

export interface EvidenceFacts {
  paymentId: string;
  caseTitle: string;
  caseId: string;
  amountCents: number;
  clientTotalCents: number;
  currency: string;
  paidAt: Date | null;
  clientName: string | null;
  clientEmail: string | null;
  attorneyName: string | null;
  bidAcceptedAt: Date | null;
  caseCreatedAt: Date | null;
  receiptUrl: string | null;
  purchaseIp: string | null;
  consents: {
    type: string;
    granted: boolean;
    at: Date;
    ip: string | null;
  }[];
  chat: {
    messages: number;
    clientMessages: number;
    attorneyMessages: number;
    attachments: number;
    voiceNotes: number;
    firstAt: Date | null;
    lastAt: Date | null;
  };
  calls: { count: number; totalSeconds: number };
  request: { description: string; sentAt: Date } | null;
  refundedCents: number;
}

const iso = (d: Date | null) => (d ? d.toISOString() : 'n/a');
const money = (c: number, cur: string) =>
  `${(c / 100).toFixed(2)} ${cur.toUpperCase()}`;

/**
 * The text fields of the Stripe dispute evidence object. Chat is described
 * by metadata only (counts and dates): the content of an attorney-client
 * conversation is privileged and never leaves the platform.
 */
export function buildEvidenceFields(f: EvidenceFacts): Record<string, string> {
  const terms = f.consents.filter(
    (c) => c.granted && ['terms', 'client_agreement', 'eula'].includes(c.type),
  );
  const out: Record<string, string> = {
    product_description: clip(
      `Legal services marketplace. The customer engaged an independent attorney ` +
        `through case "${f.caseTitle}" (case ${f.caseId}) and paid ` +
        `${money(f.amountCents, f.currency)} for the attorney's work` +
        (f.request ? ` (invoice: ${f.request.description})` : '') +
        `. Total charged ${money(f.clientTotalCents, f.currency)}.`,
    ),
    access_activity_log: clip(
      [
        `Case created: ${iso(f.caseCreatedAt)}`,
        `Attorney selected by the customer: ${iso(f.bidAcceptedAt)}`,
        `Payment made: ${iso(f.paidAt)}`,
        `Messages in the case chat: ${f.chat.messages} ` +
          `(customer ${f.chat.clientMessages}, attorney ${f.chat.attorneyMessages}); ` +
          `documents/photos: ${f.chat.attachments}; voice notes: ${f.chat.voiceNotes}; ` +
          `first ${iso(f.chat.firstAt)}, last ${iso(f.chat.lastAt)}`,
        `Calls with the attorney: ${f.calls.count}, ${f.calls.totalSeconds} seconds in total`,
      ].join('\n'),
    ),
    cancellation_policy_disclosure: clip(
      terms.length > 0
        ? 'The customer accepted the LawBid Terms before using the service: ' +
            terms
              .map(
                (t) =>
                  `${t.type} at ${iso(t.at)}${t.ip ? ` from IP ${t.ip}` : ''}`,
              )
              .join('; ')
        : 'No explicit terms acceptance record was found for this customer.',
    ),
    refund_policy_disclosure: clip(
      'Refunds are issued by the attorney or by LawBid on request through the app. ' +
        (f.refundedCents > 0
          ? `Already refunded to the customer: ${money(f.refundedCents, f.currency)}.`
          : 'No refund has been issued for this payment.'),
    ),
    uncategorized_text: clip(
      `Receipt: ${f.receiptUrl ?? 'sent by e-mail by Stripe'}. ` +
        `Chat content is privileged attorney-client communication and is described ` +
        `by metadata only. The attached document summarises the timeline.`,
    ),
  };
  if (f.clientName) out.customer_name = f.clientName;
  if (f.clientEmail) out.customer_email_address = f.clientEmail;
  if (f.purchaseIp) out.customer_purchase_ip = f.purchaseIp;
  if (f.bidAcceptedAt)
    out.service_date = f.bidAcceptedAt.toISOString().slice(0, 10);
  return out;
}

/** Stripe text evidence fields allow up to 20,000 characters each. */
function clip(s: string): string {
  return s.length > 19_000 ? s.slice(0, 19_000) : s;
}

/** The lines of the one-page PDF attached as service documentation. */
export function evidenceDocumentLines(f: EvidenceFacts): string[] {
  const fields = buildEvidenceFields(f);
  return [
    'LawBid: payment dispute evidence summary',
    `Payment ${f.paymentId}`,
    '',
    'What was bought',
    fields.product_description ?? '',
    '',
    'Timeline and delivery of the service',
    fields.access_activity_log ?? '',
    '',
    'Terms accepted by the customer',
    fields.cancellation_policy_disclosure ?? '',
    '',
    'Refunds',
    fields.refund_policy_disclosure ?? '',
    '',
    fields.uncategorized_text ?? '',
  ];
}
