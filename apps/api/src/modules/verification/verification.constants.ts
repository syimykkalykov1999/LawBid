import type {
  VerificationDocType,
  VerificationRequestStatus,
  VerificationStatus,
} from '@prisma/client';

/** docs/03 §2.3: an attorney has at most one request in these statuses. */
export const OPEN_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'needs_more_info',
] as const satisfies readonly VerificationRequestStatus[];

/** Statuses in which the attorney may still change the request. Documents
 * can only be removed from a draft; after an info request the attorney
 * adds (§2.3 "адвокат догружает"). */
export const EDITABLE_REQUEST_STATUSES = [
  'draft',
  'needs_more_info',
] as const satisfies readonly VerificationRequestStatus[];

/** docs/03 §2.3 sync `verification_requests.status` →
 * `attorney_profiles.verification_status`. */
export const PROFILE_STATUS_FOR_REQUEST: Record<
  VerificationRequestStatus,
  VerificationStatus
> = {
  draft: 'unverified',
  submitted: 'pending',
  in_review: 'pending',
  needs_more_info: 'pending',
  approved: 'verified',
  rejected: 'rejected',
};

/** docs/03 §2.5.4: rejection reason codes (app text:
 * `verification.reject.<code>`). Also used per license. */
export const REJECTION_CODES = [
  'license_not_found',
  'license_inactive',
  'name_mismatch',
  'document_unreadable',
  'document_expired',
  'selfie_mismatch',
  'suspected_fraud',
  'incomplete_submission',
  'other',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

/** Identity documents (§2.1): front for all, back also for driver
 * license and state ID. */
export const IDENTITY_DOC_TYPES = [
  'drivers_license',
  'passport',
  'state_id',
] as const satisfies readonly VerificationDocType[];
export const IDENTITY_NEEDS_BACK: readonly VerificationDocType[] = [
  'drivers_license',
  'state_id',
];

/** docs/03 §2.2: up to 3 files per document. */
export const MAX_FILES_PER_DOCUMENT = 3;
/** Free-text limits of verifier messages. docs/03 only bounds
 * applicant_comment (500); these keep admin input bounded too. */
export const APPLICANT_COMMENT_MAX = 500;
export const VERIFIER_TEXT_MAX = 1000;
export const SUSPEND_REASON_MAX = 500;

/** `verification_update` payload kinds (docs/03 §2.7); the app maps them
 * to `notif.verification.<kind>` texts. */
export const VERIFICATION_NOTIFICATION_KIND = {
  inReview: 'in_review',
  needsMoreInfo: 'needs_more_info',
  approved: 'approved',
  rejected: 'rejected',
  suspended: 'suspended',
  restored: 'restored',
} as const;

/** admin_note prefix of a request created by a verifier's license
 * re-check (§2.5 recheck → manual review queue). */
export const LICENSE_RECHECK_NOTE_PREFIX = 'license_recheck';

/** audit_log actions written by the verifier API (docs/03 §2.2, §2.5). */
export const AUDIT_ACTION = {
  documentView: 'verification.document_view',
  take: 'verification.take',
  licenseDecision: 'verification.license_decision',
  approve: 'verification.approve',
  requestInfo: 'verification.request_info',
  reject: 'verification.reject',
  recheck: 'verification.license_recheck',
  suspend: 'verification.suspend',
  restore: 'verification.restore',
} as const;
