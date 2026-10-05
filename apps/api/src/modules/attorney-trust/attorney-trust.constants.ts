/**
 * Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md).
 *
 * The simple sign-up stays: an attorney enters state + bar number under a
 * sworn statement and is "verified" at once. What LawBid *shows* and what
 * the attorney may *do* now follow a computed level that only grows with
 * checks LawBid did not have to take the attorney's word for:
 *
 *   0  self-attested            (sworn statement only)
 *   1  license confirmed        (state registry match, or a verifier opened
 *                                the state bar's page)
 *   2  identity confirmed       (Stripe Connect KYC with a legal name that
 *                                matches, or staff-checked bar card + ID +
 *                                selfie) — needs level 1
 *   3  fully verified           (both identity sources)
 */
export const TRUST_LEVELS = [0, 1, 2, 3] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];
export const MAX_TRUST_LEVEL: TrustLevel = 3;

/** `attorney_trust.license_confirmed_by`. */
export const LICENSE_CONFIRMED_BY = {
  registry: 'registry',
  staff: 'staff',
} as const;

/** `attorney_trust.name_check`. */
export const NAME_CHECK = {
  match: 'match',
  mismatch: 'mismatch',
  unknown: 'unknown',
} as const;
export type NameCheck = (typeof NAME_CHECK)[keyof typeof NAME_CHECK];

/** `attorney_trust.firm_link_status` / `firm_link_source` (owner
 * 2026-10-05, the LLC question): a Stripe company account the attorney
 * neither owns nor represents counts only once the link to that firm is
 * shown — by the state registry's firm field, a confirmed e-mail on the
 * firm's website domain, or a verifier (letter on the firm's letterhead). */
export const FIRM_LINK = {
  none: 'none',
  pending: 'pending',
  confirmed: 'confirmed',
} as const;
export const FIRM_LINK_SOURCE = {
  registry: 'registry',
  email: 'email',
  staff: 'staff',
} as const;
export type FirmLinkSource =
  (typeof FIRM_LINK_SOURCE)[keyof typeof FIRM_LINK_SOURCE];

/** Stripe `business_type` values that mean "a person's own account". */
export const INDIVIDUAL_BUSINESS_TYPES = ['individual'] as const;

/** Hold codes (`payments_hold` / `bids_hold`). */
export const HOLD = {
  complaint: 'complaint',
  nameMismatch: 'name_mismatch',
  duplicateClaim: 'duplicate_claim',
  admin: 'admin',
} as const;
export type HoldCode = (typeof HOLD)[keyof typeof HOLD];

/** `attorney_trust_events.kind`. */
export const TRUST_EVENT = {
  levelChanged: 'level_changed',
  licenseConfirmed: 'license_confirmed',
  licenseUnconfirmed: 'license_unconfirmed',
  documentsVerified: 'documents_verified',
  stripeKyc: 'stripe_kyc',
  nameCheck: 'name_check',
  hold: 'hold',
  release: 'release',
  complaint: 'complaint',
  autoSuspended: 'auto_suspended',
  duplicateClaim: 'duplicate_claim',
  duplicateClaimMade: 'duplicate_claim_made',
  payoutDelay: 'payout_delay',
  firmLink: 'firm_link',
  firmEmail: 'firm_email',
  staffCleared: 'staff_cleared',
  staffUncleared: 'staff_uncleared',
  documentsRequested: 'documents_requested',
} as const;

/** «Запросить ещё» templates (texts live in the app's strings). */
export const DOCUMENT_REQUEST_TEMPLATES = [
  'id_selfie',
  'bar_card',
  'firm_letter',
  'custom',
] as const;
export type DocumentRequestTemplate =
  (typeof DOCUMENT_REQUEST_TEMPLATES)[number];

/** Why an attorney sits in the staff queue. */
export const QUEUE_REASONS = [
  'documents',
  'firm_link',
  'name_mismatch',
  'duplicate_claim',
  'registry_flag',
  'complaint',
] as const;

/** Owner 2026-10-05: the badge as the admin manages it — one word per
 * attorney, derived from the facts (see `badgeStatusOf`). */
export const BADGE_STATUSES = [
  'not_verified',
  'self_declared',
  'registry_matched',
  'pending_review',
  'documents_requested',
  'cleared',
  'rejected',
  'suspended',
] as const;
export type BadgeStatus = (typeof BADGE_STATUSES)[number];

/** Statuses a person may set by hand (with a reason, audited). */
export const MANUAL_BADGE_STATUSES = [
  'cleared',
  'self_declared',
  'documents_requested',
  'rejected',
] as const;
export type ManualBadgeStatus = (typeof MANUAL_BADGE_STATUSES)[number];

/** Owner 2026-10-05 06:07: one-click presets for the rules. */
export const TRUST_PRESETS = [
  'off',
  'soft',
  'standard',
  'strict',
  'all',
] as const;
export type TrustPreset = (typeof TRUST_PRESETS)[number];

export const BULK_TRUST_ACTIONS = [
  'clear',
  'request_documents',
  'reject',
  'release',
] as const;
export type BulkTrustAction = (typeof BULK_TRUST_ACTIONS)[number];

export const TRUST_ACTOR = {
  system: 'system',
  admin: 'admin',
  attorney: 'attorney',
  client: 'client',
  stripe: 'stripe',
} as const;

/** `verification_update` payload kinds the app maps to
 * `notif.verification.<kind>` texts. */
export const TRUST_NOTIFICATION_KIND = {
  levelUp: 'trust_level_up',
  paymentsPaused: 'trust_payments_paused',
  paymentsResumed: 'trust_payments_resumed',
  bidsPaused: 'trust_bids_paused',
  holdLifted: 'trust_hold_lifted',
  documentsRequested: 'trust_documents_requested',
  autoSuspended: 'trust_auto_suspended',
  firmLinkRequired: 'trust_firm_link_required',
  firmLinkConfirmed: 'trust_firm_link_confirmed',
  cleared: 'trust_cleared',
  /** The owner tightened the rules: something is required now. */
  requirementsChanged: 'trust_requirements_changed',
} as const;

/** audit_log actions of the admin trust API. */
export const TRUST_AUDIT_ACTION = {
  confirmLicense: 'trust.confirm_license',
  unconfirmLicense: 'trust.unconfirm_license',
  confirmDocuments: 'trust.confirm_documents',
  confirmFirmLink: 'trust.confirm_firm_link',
  hold: 'trust.hold',
  release: 'trust.release',
  recompute: 'trust.recompute',
  settings: 'trust.settings',
  clear: 'trust.clear',
  unclear: 'trust.unclear',
  requestDocuments: 'trust.request_documents',
  reject: 'trust.reject',
  bulk: 'trust.bulk',
  preset: 'trust.preset',
  setStatus: 'trust.set_status',
  blockBar: 'trust.block_bar_number',
  unblockBar: 'trust.unblock_bar_number',
} as const;

/** Report reasons of a client that count as a trust complaint. */
export const COMPLAINT_REASONS = ['fraud', 'impersonation'] as const;

/** `attorney_licenses.registry_flag` set when someone else claims the
 * number (shows in Admin → Верификация → «Сверка с реестром»). */
export const DUPLICATE_CLAIM_FLAG = 'duplicate_claim';

export const TRUST_NOTE_MAX = 500;
