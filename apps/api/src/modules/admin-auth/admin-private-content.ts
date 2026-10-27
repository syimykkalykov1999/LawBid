import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';

/**
 * Owner 2026-10-28 (attorney-client privilege): the only reasons for which
 * LawBid staff may read private content. They mirror the promise in the
 * privileged-content policy (legal settings): after a report, to prevent
 * imminent harm, for valid legal process, or to fix a technical problem
 * with the user's consent. Anything else is not a reason.
 */
export const PRIVATE_REASON_CODES = [
  'report_review',
  'imminent_harm',
  'legal_process',
  'tech_fix_consent',
] as const;
export type PrivateReasonCode = (typeof PRIVATE_REASON_CODES)[number];

/** What kind of private content is read (the audit action suffix). */
export const PRIVATE_KINDS = [
  'chat_messages',
  'message_body',
  'call_metadata',
  'case_files',
  'private_document',
] as const;
export type PrivateKind = (typeof PRIVATE_KINDS)[number];

export const PRIVATE_READ_ACTION_PREFIX = 'admin.private_read.';

export function isPrivateReasonCode(v: unknown): v is PrivateReasonCode {
  return (
    typeof v === 'string' &&
    (PRIVATE_REASON_CODES as readonly string[]).includes(v)
  );
}

/** The `X-Reason-Code` header value, or REASON_CODE_REQUIRED. */
export function readReasonCode(raw: string | undefined): PrivateReasonCode {
  const value = (raw ?? '').trim();
  if (!isPrivateReasonCode(value)) {
    throw new BadRequestException({
      code: ErrorCode.REASON_CODE_REQUIRED,
      message: `X-Reason-Code must be one of: ${PRIVATE_REASON_CODES.join(', ')}.`,
    });
  }
  return value;
}
