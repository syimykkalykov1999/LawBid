/**
 * The catalogue of internal domain events (events pipeline, N-2). A new
 * event = one line here: the compiler then forces the payload shape at every
 * `DomainEvents.emit` call. Payloads carry ids and numbers only, never
 * personal text (messages, names, phones): consumers load what they need.
 */
export interface DomainEventMap {
  'user.signed_up': { userId: string; role: string };
  'case.created': { caseId: string; clientId: string; practiceAreaId: string };
  'bid.placed': {
    bidId: string;
    caseId: string;
    attorneyId: string;
    feeType: string;
  };
  'payment.succeeded': {
    paymentId: string;
    caseId: string;
    amountCents: number;
  };
  'post.published': { postId: string; authorId: string };
}

export type DomainEventType = keyof DomainEventMap;

export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] = [
  'user.signed_up',
  'case.created',
  'bid.placed',
  'payment.succeeded',
  'post.published',
];

/** One recorded event as consumers and the stream see it. */
export interface DomainEventRecord<
  T extends DomainEventType = DomainEventType,
> {
  readonly id: string;
  readonly type: T;
  readonly key: string;
  readonly actorId: string | null;
  readonly payload: DomainEventMap[T];
  readonly occurredAt: string;
}

export type EventsSink = 'off' | 'db' | 'stream';
export const EVENTS_SINK_SETTING = /^(off|db|stream|auto)$/;
