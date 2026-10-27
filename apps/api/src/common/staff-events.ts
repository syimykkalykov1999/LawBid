/**
 * Staff package T3 (plan B2): names shared by the `/staff` socket, the
 * lease engine and the desk. Plain constants, no logic, so the desk (T4/T9)
 * and the gateway never disagree on a spelling.
 */

/** Socket.IO namespace of the staff desk (separate from `/realtime`). */
export const STAFF_NAMESPACE = '/staff';

/** Room of one admin (every tab of the same person). */
export const staffAdminRoom = (adminId: string): string => `admin:${adminId}`;
/** Room of a workspace's head (and the owner): team tiles. */
export const staffHeadRoom = (workspace: string): string => `head:${workspace}`;

/** Client → server. */
export const STAFF_CLIENT_EVENTS = {
  heartbeat: 'presence:hb',
  offerAccept: 'offer:accept',
  offerDecline: 'offer:decline',
} as const;

/** Server → client. */
export const STAFF_SERVER_EVENTS = {
  leaseGranted: 'lease:granted',
  leaseWarn: 'lease:warn',
  leaseLost: 'lease:lost',
  offerNew: 'offer:new',
  offerExpired: 'offer:expired',
  statusChanged: 'status:changed',
  teamTiles: 'team:tiles',
  sessionRevoked: 'session:revoked',
  error: 'staff:error',
} as const;

export type StaffStatus = 'online' | 'away' | 'offline';

/** Queue kinds the lease engine can serve (work_leases.kind). The first
 * five have a queue source today; the rest are reserved for T4 (money). */
export const WORK_LEASE_KINDS = [
  'support_ticket',
  'verification',
  'report',
  'media_report',
  'mod_appeal',
  'review_appeal',
  'trust_case',
  'refund',
  'payout',
  'review_sample',
] as const;
export type WorkLeaseKind = (typeof WORK_LEASE_KINDS)[number];

/** work_lease_events.event (varchar 16). */
export const LEASE_EVENT = {
  taken: 'taken',
  renewedFirst: 'renewed_first',
  lost: 'lost',
  handed: 'handed',
  released: 'released',
  skipped: 'skipped',
  done: 'done',
  reopened: 'reopened',
} as const;
export type LeaseEventName = (typeof LEASE_EVENT)[keyof typeof LEASE_EVENT];

/** Why a lease ended (work_lease_events.reason, `lease:lost.reason`). */
export const LEASE_REASON = {
  /** Time ran out and the holder was not working on it. */
  expired: 'expired',
  /** No heartbeat for the grace period (closed tab, lost network). */
  disconnected: 'disconnected',
  /** Tab open but no movement for 5 minutes. */
  idle: 'idle',
  /** Kept past the allowed renewals («долго держал»). */
  heldTooLong: 'held_too_long',
  /** The holder let it go. */
  released: 'released',
  /** A head or the owner took it away. */
  forced: 'forced',
  /** A head or the owner gave it to someone else. */
  reassigned: 'reassigned',
  /** The client wrote again after a close («не решено»). */
  notResolved: 'not_resolved',
  /** The person was taken off the queues (offboard, pause). */
  offboarded: 'offboarded',
} as const;
export type LeaseReason = (typeof LEASE_REASON)[keyof typeof LEASE_REASON];

/** The list a worker picks a «Пропустить» reason from (plan 3.1). */
export const SKIP_REASONS = [
  'not_my_language',
  'conflict_of_interest',
  'not_my_topic',
  'too_hard',
  'other',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
