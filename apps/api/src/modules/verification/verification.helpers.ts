import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  Prisma,
  VerificationRequestStatus,
  VerificationStatus,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { NAME_RECHECK_NOTE_PREFIX } from '../users/services/attorney-name-recheck';
import {
  LICENSE_RECHECK_NOTE_PREFIX,
  PROFILE_STATUS_FOR_REQUEST,
} from './verification.constants';

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUBMISSION_WINDOW_MS = 30 * DAY_MS;

export function httpError(
  status: HttpStatus,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException({ code, message, details }, status);
}

export function invalidStatus(
  status: VerificationRequestStatus,
  details: Record<string, unknown> = {},
): HttpException {
  return httpError(
    HttpStatus.CONFLICT,
    ErrorCode.VERIFICATION_INVALID_STATUS,
    'The request status does not allow this action.',
    { status, ...details },
  );
}

/**
 * docs/03 §2.3 sync of `attorney_profiles.verification_status` with the
 * request status. Two guards keep other decisions intact:
 *  - `suspended` is only changed by suspend/restore (§2.5);
 *  - a `verified` attorney stays verified while a request of theirs is
 *    open or rejected (adding a state later, §2.1 — their verified
 *    licenses keep working). A name re-check (§4.1) already moved the
 *    profile to `pending`, so it follows the mapping normally.
 * Approval (`verified`) sets verified_at the first time.
 */
export async function syncProfileStatus(
  tx: Tx,
  attorneyId: string,
  requestStatus: VerificationRequestStatus,
  now: Date,
): Promise<void> {
  const target: VerificationStatus = PROFILE_STATUS_FOR_REQUEST[requestStatus];
  if (target === 'verified') {
    await tx.attorneyProfile.updateMany({
      where: { user_id: attorneyId, verification_status: { not: 'suspended' } },
      data: { verification_status: 'verified' },
    });
    await tx.attorneyProfile.updateMany({
      where: { user_id: attorneyId, verified_at: null },
      data: { verified_at: now },
    });
    return;
  }
  await tx.attorneyProfile.updateMany({
    where: {
      user_id: attorneyId,
      verification_status: { notIn: ['suspended', 'verified'] },
    },
    data: { verification_status: target },
  });
}

/** Requests the attorney submitted in the last 30 days (the §2.3 / §9
 * `verification.max_submissions_30d` limit). Requests the system opened
 * (name re-check, license re-check) don't count against the attorney. */
export function attorneySubmissionsWhere(
  attorneyId: string,
  now: Date,
  excludeId?: string,
): Prisma.VerificationRequestWhereInput {
  return {
    attorney_id: attorneyId,
    submitted_at: { gte: new Date(now.getTime() - SUBMISSION_WINDOW_MS) },
    ...(excludeId ? { id: { not: excludeId } } : {}),
    OR: [
      { admin_note: null },
      {
        AND: [
          { NOT: { admin_note: { startsWith: NAME_RECHECK_NOTE_PREFIX } } },
          { NOT: { admin_note: { startsWith: LICENSE_RECHECK_NOTE_PREFIX } } },
        ],
      },
    ],
  };
}

/** UTC calendar day string of a DATE column. */
export function isoDay(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
