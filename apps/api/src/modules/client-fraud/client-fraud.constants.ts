/**
 * Owner 2026-10-05: repeat accounts of blocked fraudsters
 * (docs/CLIENT_FRAUD.md).
 *
 * A client who cheated attorneys, collected complaints and got blocked
 * must not come back with the same phone, e-mail, Apple / Google account,
 * card or phone (device). Every account leaves hashed identity signals
 * ("fingerprints"); a new sign-in that shares a strong one with a blocked
 * account is refused or held for review, and a complaint-driven risk score
 * restricts or blocks a client automatically. No paid services: free
 * on-device ids and our own data only.
 */

/** `identity_fingerprints.kind`. */
export const FP_KIND = {
  phone: 'phone',
  email: 'email',
  apple: 'apple',
  google: 'google',
  /** Stable on-device key (Android ID / iOS Keychain), `X-Device-Key`. */
  device: 'device',
  /** Stripe card fingerprint (platform account: attorney subscriptions). */
  card: 'card',
  /** Network address: shown to staff in linked accounts, never scored. */
  ip: 'ip',
  /** Normalised case text: the same scam posted from several accounts. */
  text: 'text',
} as const;
export type FpKind = (typeof FP_KIND)[keyof typeof FP_KIND];
export const FP_KINDS = Object.values(FP_KIND);

/** Shared with a blocked account → sign-in refused (or held, by setting). */
export const STRONG_KINDS: readonly FpKind[] = [
  'phone',
  'email',
  'apple',
  'google',
  'card',
];
/** A phone can be sold or shared in a family: its own setting. */
export const DEVICE_KINDS: readonly FpKind[] = ['device'];
/** Shown to staff; only the case text adds to the score (an IP is shared
 * by strangers behind a carrier or office network). */
export const WEAK_KINDS: readonly FpKind[] = ['ip', 'text'];

/** `client_fraud_profiles.status`. */
export const FRAUD_STATUS = {
  ok: 'ok',
  /** In the staff queue; the account works as usual. */
  review: 'review',
  /** Cannot publish cases or write to attorneys until staff look. */
  restricted: 'restricted',
  /** The account is suspended (users.status = suspended). */
  banned: 'banned',
} as const;
export type FraudStatus = (typeof FRAUD_STATUS)[keyof typeof FRAUD_STATUS];
export const FRAUD_STATUSES = Object.values(FRAUD_STATUS);

/** What happens when a sign-in matches a blocked account. */
export const MATCH_ACTIONS = ['block', 'review', 'off'] as const;
export type MatchAction = (typeof MATCH_ACTIONS)[number];

/** `client_fraud_events.kind` (append-only history). */
export const FRAUD_EVENT = {
  linkedMatch: 'linked_match',
  signInBlocked: 'sign_in_blocked',
  autoReview: 'auto_review',
  autoRestricted: 'auto_restricted',
  autoBanned: 'auto_banned',
  staffCleared: 'staff_cleared',
  staffRestricted: 'staff_restricted',
  staffBanned: 'staff_banned',
  staffUnbanned: 'staff_unbanned',
  linkedBanned: 'linked_banned',
} as const;
export type FraudEventKind = (typeof FRAUD_EVENT)[keyof typeof FRAUD_EVENT];

/** Signals of the score (each with its points in the card). */
export const SIGNALS = {
  fraudReports: 'fraud_reports',
  otherReports: 'other_reports',
  contactIssues: 'contact_issues',
  chargebacks: 'chargebacks',
  cancelledAfterBids: 'cancelled_after_bids',
  sharedWithBlocked: 'shared_with_blocked',
  weakSharedWithBlocked: 'weak_shared_with_blocked',
  manyAccountsOnDevice: 'many_accounts_on_device',
  duplicateText: 'duplicate_text',
} as const;
export type SignalCode = (typeof SIGNALS)[keyof typeof SIGNALS];
export const SIGNAL_CODES = Object.values(SIGNALS);

/** Owner presets («Выключить / Мягко / Стандарт / Строго»). */
export const FRAUD_PRESETS = ['off', 'soft', 'standard', 'strict'] as const;
export type FraudPreset = (typeof FRAUD_PRESETS)[number];

export interface PresetValues {
  matchAction: MatchAction;
  deviceAction: MatchAction;
  reviewScore: number;
  restrictScore: number;
  banScore: number;
}

export const PRESET_VALUES: Record<
  Exclude<FraudPreset, 'off'>,
  PresetValues
> = {
  soft: {
    matchAction: 'review',
    deviceAction: 'review',
    reviewScore: 50,
    restrictScore: 90,
    banScore: 150,
  },
  standard: {
    matchAction: 'block',
    deviceAction: 'review',
    reviewScore: 30,
    restrictScore: 60,
    banScore: 100,
  },
  strict: {
    matchAction: 'block',
    deviceAction: 'block',
    reviewScore: 20,
    restrictScore: 40,
    banScore: 70,
  },
};

/** Fixed weights (the adjustable ones are settings). */
export const WEIGHTS = {
  contactIssue: 15,
  cancelledAfterBids: 5,
  /** Cancelled cases with bids before they start to count. */
  cancelledFreeAllowance: 2,
  sharedWithBlocked: 100,
  weakSharedWithBlocked: 15,
  manyAccountsOnDevice: 10,
  /** Accounts on one device before it starts to count. */
  accountsPerDeviceAllowance: 2,
  duplicateText: 10,
  /** Same case text as at most this many other accounts counts: a common
   * template alone never gets past the score where a person looks. */
  duplicateTextMaxAccounts: 2,
  /** No signal adds more than this many points. */
  signalCap: 200,
} as const;

/** IP matches older than this are ignored (carrier NAT changes owners). */
export const IP_MATCH_DAYS = 30;

/** `users.suspended_reason` set by this module. */
export const FRAUD_SUSPENDED_REASON = {
  auto: 'fraud_score',
  linked: 'linked_to_blocked_account',
  staff: 'fraud_staff',
} as const;

export const FRAUD_AUDIT = {
  clear: 'fraud.clear',
  restrict: 'fraud.restrict',
  ban: 'fraud.ban',
  unban: 'fraud.unban',
  settings: 'fraud.settings',
  preset: 'fraud.preset',
  recompute: 'fraud.recompute',
} as const;

export const FRAUD_NOTE_MAX = 500;
