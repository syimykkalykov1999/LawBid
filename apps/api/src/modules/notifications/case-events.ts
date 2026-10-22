import type { RealtimePublisher } from '../realtime/realtime-publisher.service';

/**
 * Owner 2026-10-22 (client economy plan, package E): every case / bid /
 * consultation notification already names the case and the person, so the
 * realtime event rides on the same seam — one place instead of a publish
 * at each of the ~20 emit sites. The event carries ids and a kind, never
 * bodies: the app re-reads the one row it shows (stale-while-revalidate)
 * instead of reloading 5–7 lists.
 */
export const CASE_UPDATE_KINDS = [
  'bid_new',
  'bid_accepted',
  'bid_declined',
  'bid_countered',
  'bid_withdrawn',
  'updated',
  'closed',
  'task',
  'payment',
  'invite',
] as const;
export type CaseUpdateKind = (typeof CASE_UPDATE_KINDS)[number];

const KIND_OF: Record<string, CaseUpdateKind> = {
  bid_received: 'bid_new',
  bid_accepted: 'bid_accepted',
  offer_accepted: 'bid_accepted',
  bid_rejected: 'bid_declined',
  offer_countered: 'bid_countered',
  negotiation_failed: 'bid_declined',
  bid_withdrawn: 'bid_withdrawn',
  case_updated: 'updated',
  case_deadline_changed: 'updated',
  case_still_needed: 'updated',
  case_closed: 'closed',
  case_archived: 'closed',
  case_disputed: 'updated',
  dispute_resolved: 'updated',
  completion_requested: 'updated',
  case_workspace_activity: 'task',
  files_added: 'task',
  signature_signed: 'task',
  case_invite_received: 'invite',
  case_invite_declined: 'invite',
  payment_received: 'payment',
  payment_requested: 'payment',
  payment_sent: 'payment',
  payout_sent: 'payment',
};

export interface CaseUpdateEvent {
  caseId: string;
  kind: CaseUpdateKind;
  bidId?: string;
  /** The notification type that caused it (for finer client handling). */
  source: string;
}

export interface ConsultationUpdateEvent {
  consultationId: string;
  kind?: string;
}

/** The realtime event a notification implies, or null. */
export function eventOf(
  type: string,
  payload: unknown,
):
  | { event: 'case:update'; data: CaseUpdateEvent }
  | { event: 'consultation:update'; data: ConsultationUpdateEvent }
  | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (type === 'consultation_update' && typeof p.consultationId === 'string') {
    return {
      event: 'consultation:update',
      data: {
        consultationId: p.consultationId,
        ...(typeof p.kind === 'string' ? { kind: p.kind } : {}),
      },
    };
  }
  const kind =
    type === 'bid_rejected' && p.reason === 'withdrawn'
      ? 'bid_withdrawn'
      : KIND_OF[type];
  if (!kind || typeof p.caseId !== 'string') return null;
  return {
    event: 'case:update',
    data: {
      caseId: p.caseId,
      kind,
      ...(typeof p.bidId === 'string' ? { bidId: p.bidId } : {}),
      source: type,
    },
  };
}

/** Publishes the implied event to [recipientId]; [delayMs] > 0 lets the
 * caller's transaction commit first (best-effort, like the push). */
export function publishCaseEvent(
  realtime: RealtimePublisher | undefined,
  recipientId: string,
  type: string,
  payload: unknown,
  delayMs = 0,
): void {
  if (!realtime) return;
  const ev = eventOf(type, payload);
  if (!ev) return;
  const send = () => realtime.toUsers([recipientId], ev.event, ev.data);
  if (delayMs > 0) setTimeout(send, delayMs).unref?.();
  else send();
}
