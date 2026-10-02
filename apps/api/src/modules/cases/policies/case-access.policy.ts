import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { caseNotFound } from '../domain/case-state-machine';

export interface CaseViewer {
  userId: string;
  /** users.role (client / attorney / admin; null before onboarding). */
  role: string | null;
}

/**
 * - owner: the client who created the case;
 * - attorney_participant: an attorney with a bid or a conversation on it
 *   (any status — their own bid history and work stay reachable);
 * - attorney_prospect: an open case the attorney may see per docs/04 §4.1
 *   / docs/02 §5.4 (verified attorney, verified license in one of the
 *   case's states). Owner 2026-09-30: any practice — `inPractice` says
 *   whether it is one of the attorney's own (the client is warned on a
 *   bid from outside them).
 *
 * `clientIdentityVisible` is false for every attorney access: the client's
 * name, photo and contacts are never part of a case view for an attorney.
 * They are released only by GET /cases/:id/contacts after acceptance with
 * an active subscription (docs/04 §8, stage 4.5, SubscriptionAccessService).
 */
export type CaseAccess =
  | { kind: 'owner'; clientIdentityVisible: true }
  | {
      kind: 'attorney_participant' | 'attorney_prospect';
      clientIdentityVisible: false;
      /** The case's practice is one of the attorney's own (or the §4.1
       * General Practice exception). */
      inPractice: boolean;
    };

/** docs/04 §4.1 exception: not_sure_or_other cases are also shown to
 * attorneys who chose General Practice or Not Sure or Other. */
export const NOT_SURE_OR_OTHER_CODE = 'general_practice.not_sure_or_other';
export const GENERAL_PRACTICE_CODES = [
  'general_practice.general_practice',
  NOT_SURE_OR_OTHER_CODE,
] as const;

type Db = Pick<Prisma.TransactionClient, 'case' | '$queryRaw'>;

/**
 * Deny-by-default access to a single case (.cursorrules: "Доступ к
 * объектам только через policy (CaseAccessPolicy и др.). Deny by
 * default"). Anything not granted below — other clients, admins (who use
 * admin endpoints, file 06), users without a role, attorneys without a
 * bid/conversation who don't meet §4.1, soft-deleted cases — gets null /
 * CASE_NOT_FOUND, never a hint that the case exists.
 */
@Injectable()
export class CaseAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async decide(
    viewer: CaseViewer,
    caseId: string,
    db: Db = this.prisma,
  ): Promise<CaseAccess | null> {
    if (viewer.role === 'client') {
      const c = await db.case.findUnique({
        where: { id: caseId },
        select: { client_id: true },
      });
      return c && c.client_id === viewer.userId
        ? { kind: 'owner', clientIdentityVisible: true }
        : null;
    }
    if (viewer.role !== 'attorney') return null;

    const a = viewer.userId;
    // Single-case form of the §5.4 predicate (+ the §4.1 General Practice
    // exception), constrained by the case's primary key. The feed (stage
    // 4.3) uses the index-friendly list shape (visibleQuery in
    // test/db-roles-indexes.e2e-spec.ts).
    const rows = await db.$queryRaw<
      { participant: boolean; visible: boolean; in_practice: boolean }[]
    >`
      SELECT
        (EXISTS (SELECT 1 FROM bids b
                 WHERE b.case_id = c.id AND b.attorney_id = ${a}::UUID)
         OR EXISTS (SELECT 1 FROM conversations v
                    WHERE v.case_id = c.id AND v.attorney_id = ${a}::UUID))
          AS participant,
        (c.status = 'open'
         AND EXISTS (SELECT 1 FROM attorney_profiles p
                     WHERE p.user_id = ${a}::UUID
                       AND p.verification_status = 'verified')
         AND EXISTS (SELECT 1 FROM case_states cs
                     JOIN attorney_licenses l ON l.state_code = cs.state_code
                     WHERE cs.case_id = c.id AND l.attorney_id = ${a}::UUID
                       AND l.license_status = 'verified')
         -- Owner 2026-10-02: a block either way hides the case (no bids,
         -- no comments) — the block screen promises no contact at all.
         AND NOT EXISTS (SELECT 1 FROM user_blocks ub
                         WHERE (ub.blocker_id = ${a}::UUID AND ub.blocked_id = c.client_id)
                            OR (ub.blocker_id = c.client_id AND ub.blocked_id = ${a}::UUID)))
          AS visible,
        EXISTS (SELECT 1 FROM attorney_practice_areas ap
                WHERE ap.attorney_id = ${a}::UUID
                  AND (ap.practice_area_id = c.practice_area_id
                       OR (pa.code = ${NOT_SURE_OR_OTHER_CODE}
                           AND ap.practice_area_id IN (
                             SELECT id FROM practice_areas
                             WHERE code IN (${GENERAL_PRACTICE_CODES[0]},
                                            ${GENERAL_PRACTICE_CODES[1]})))))
          AS in_practice
      FROM cases c
      JOIN practice_areas pa ON pa.id = c.practice_area_id
      WHERE c.id = ${caseId}::UUID AND c.deleted_at IS NULL`;
    const row = rows[0];
    if (!row) return null;
    const inPractice = row.in_practice;
    if (row.participant) {
      return {
        kind: 'attorney_participant',
        clientIdentityVisible: false,
        inPractice,
      };
    }
    if (row.visible) {
      return {
        kind: 'attorney_prospect',
        clientIdentityVisible: false,
        inPractice,
      };
    }
    return null;
  }

  /** Batched decide() for attorney lists (saved cases): the ids among
   * [caseIds] the attorney may currently see — participant or §5.4
   * prospect — in one query instead of one per row (load review). */
  async visibleCaseIds(
    attorneyId: string,
    caseIds: string[],
    db: Db = this.prisma,
  ): Promise<Set<string>> {
    if (caseIds.length === 0) return new Set();
    const a = attorneyId;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id::STRING AS id
      FROM cases c
      JOIN practice_areas pa ON pa.id = c.practice_area_id
      WHERE c.id = ANY(${caseIds}::UUID[]) AND c.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM bids b
                  WHERE b.case_id = c.id AND b.attorney_id = ${a}::UUID)
          OR EXISTS (SELECT 1 FROM conversations v
                     WHERE v.case_id = c.id AND v.attorney_id = ${a}::UUID)
          OR (c.status = 'open'
              AND EXISTS (SELECT 1 FROM attorney_profiles p
                          WHERE p.user_id = ${a}::UUID
                            AND p.verification_status = 'verified')
              AND EXISTS (SELECT 1 FROM case_states cs
                          JOIN attorney_licenses l ON l.state_code = cs.state_code
                          WHERE cs.case_id = c.id AND l.attorney_id = ${a}::UUID
                            AND l.license_status = 'verified'))
        )`;
    return new Set(rows.map((r) => r.id));
  }

  /** decide() or CASE_NOT_FOUND (404). */
  async assertCanView(
    viewer: CaseViewer,
    caseId: string,
    db: Db = this.prisma,
  ): Promise<CaseAccess> {
    const access = await this.decide(viewer, caseId, db);
    if (!access) throw caseNotFound();
    return access;
  }

  /**
   * Attorney-only variant of assertCanView (docs/04 §4.3 stage 4.3
   * acceptance): "адвокат без лицензии в штате кейса не видит кейс и
   * получает CASE_NOT_AVAILABLE по прямому id". Still deny by default —
   * this does not distinguish "no such case" from "not licensed/wrong
   * practice" from "no bid/conversation on it", it only picks the error
   * code docs/04 §15 documents for the attorney-facing feed/detail routes
   * instead of the generic CASE_NOT_FOUND other call sites use.
   */
  async assertVisibleToAttorney(
    attorneyId: string,
    caseId: string,
    db: Db = this.prisma,
  ): Promise<
    Extract<CaseAccess, { kind: 'attorney_participant' | 'attorney_prospect' }>
  > {
    const access = await this.decide(
      { userId: attorneyId, role: 'attorney' },
      caseId,
      db,
    );
    if (!access) throw caseNotAvailable();
    // decide() with role: 'attorney' never returns the 'owner' branch of
    // the union (see the `if (viewer.role === 'client')` guard above it).
    return access as Extract<
      CaseAccess,
      { kind: 'attorney_participant' | 'attorney_prospect' }
    >;
  }
}

export function caseNotAvailable(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_AVAILABLE,
    message: 'This case is not available to you.',
  });
}
