import { ConflictException } from '@nestjs/common';
import type { DealRecordStatus } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';

/**
 * Deal record 2026-10-27 (plan §6): the pure state table. Every status
 * change in DealRecordsService / DealRecordRunner goes through
 * `dealRecordTransition`, so the invariants ("sign only while waiting, each
 * side once, decline only before the second signature, a sealed record never
 * changes") live in one place and one unit test.
 */
export type DealRecordAction =
  | 'rendered' // the unsigned PDF exists
  | 'sign' // one side signed (signedBefore = how many had signed already)
  | 'sealed' // the final PDF exists
  | 'decline'
  | 'fail';

/** Statuses in which the record still waits for people. */
export const LIVE_DEAL_RECORD_STATUSES: readonly DealRecordStatus[] = [
  'preparing',
  'awaiting_signatures',
  'sealing',
];

export const invalidDealRecordState = (
  action: DealRecordAction,
  status: DealRecordStatus,
  message?: string,
): ConflictException =>
  new ConflictException({
    code: ErrorCode.DEAL_RECORD_INVALID_STATE,
    message: message ?? 'The deal record is not in a state that allows this.',
    details: { action, status },
  });

export function dealRecordTransition(
  status: DealRecordStatus,
  action: DealRecordAction,
  signedBefore = 0,
): DealRecordStatus {
  switch (action) {
    case 'rendered':
      if (status === 'preparing') return 'awaiting_signatures';
      break;
    case 'sign':
      if (status === 'awaiting_signatures') {
        if (signedBefore === 0) return 'awaiting_signatures';
        if (signedBefore === 1) return 'sealing';
      }
      break;
    case 'sealed':
      if (status === 'sealing') return 'sealed';
      break;
    case 'decline':
      if (status === 'preparing' || status === 'awaiting_signatures') {
        return 'declined';
      }
      break;
    case 'fail':
      if (status === 'preparing' || status === 'sealing') return 'failed';
      break;
  }
  throw invalidDealRecordState(action, status);
}

/** Who has to sign next: the acceptor first, then the other party. */
export function nextSigner(
  acceptedBy: 'client' | 'attorney',
  signedRoles: readonly string[],
): 'client' | 'attorney' | null {
  if (!signedRoles.includes(acceptedBy)) return acceptedBy;
  const other = acceptedBy === 'client' ? 'attorney' : 'client';
  return signedRoles.includes(other) ? null : other;
}
