import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';

/**
 * Owner 2026-10-17: percent (contingency) budgets and bids. The percent is
 * a deal between the client and the attorney (LawBid takes nothing from
 * it), stored in basis points: 3300 = 33 %, 3333 = 33.33 %.
 */
export const PERCENT_BPS_MIN = 1;
export const PERCENT_BPS_MAX = 10_000;

export interface ContingencyPolicy {
  /** Highest allowed percent, in basis points. */
  maxBps: number;
  /** Practice codes (each also covers its `code.` subtopics). */
  blockedPractices: string[];
}

export async function contingencyPolicy(
  settings: Pick<AppSettingsService, 'number' | 'string'> | undefined,
): Promise<ContingencyPolicy> {
  const maxPercent =
    (await settings?.number('fees.contingency_max_percent')) ?? 100;
  const blocked =
    (await settings?.string('fees.contingency_blocked_practices')) ??
    'criminal_defense,dui_and_dwi,traffic_tickets,family_law';
  return {
    maxBps: Math.round(
      Math.min(100, Math.max(0.01, Number(maxPercent) || 100)) * 100,
    ),
    blockedPractices: blocked
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  };
}

/** True when a percent may not be offered for a case naming [codes]. */
export function contingencyBlocked(
  policy: ContingencyPolicy,
  codes: string[],
): boolean {
  return codes.some((code) =>
    policy.blockedPractices.some((b) => code === b || code.startsWith(`${b}.`)),
  );
}

/** 400 unless [bps] is a percent this case allows. */
export function assertContingency(
  policy: ContingencyPolicy,
  codes: string[],
  bps: number | undefined,
  field: string,
): number {
  if (contingencyBlocked(policy, codes)) {
    throw new BadRequestException({
      code: ErrorCode.CONTINGENCY_NOT_ALLOWED,
      message: 'A percent fee is not allowed for this kind of case.',
      details: { field },
    });
  }
  if (
    bps === undefined ||
    !Number.isInteger(bps) ||
    bps < PERCENT_BPS_MIN ||
    bps > policy.maxBps
  ) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `${field} must be between ${PERCENT_BPS_MIN} and ${policy.maxBps} basis points.`,
      details: { field, max: policy.maxBps },
    });
  }
  return bps;
}
