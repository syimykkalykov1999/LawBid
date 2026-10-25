import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { caseNotFound } from '../domain/case-state-machine';
import { readsAreSplit } from '../../../sharding/split-reads';

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
 * - attorney_browser (owner 2026-10-04): any other open case (any state,
 *   any practice) a verified attorney may see AND bid on — the client is
 *   told on the bid that the attorney has no licence in the case's states.
 *
 * `clientIdentityVisible` is false for every attorney access: the client's
 * name, photo and contacts are never part of a case view for an attorney.
 * They are released only by GET /cases/:id/contacts after acceptance with
 * an active subscription (docs/04 §8, stage 4.5, SubscriptionAccessService).
 */
export type CaseAccess =
  | { kind: 'owner'; clientIdentityVisible: true }
  | {
      kind: 'attorney_participant' | 'attorney_prospect' | 'attorney_browser';
      clientIdentityVisible: false;
      /** The case's practice is one of the attorney's own (or the §4.1
       * General Practice exception). */
      inPractice: boolean;
      /** Owner 2026-10-04: the attorney holds a verified licence in one of
       * the case's states. Informational only — never blocks a bid; the
       * client is told on the bid when it is false. */
      inLicensedState: boolean;
    };

/** docs/04 §4.1 exception: not_sure_or_other cases are also shown to
 * attorneys who chose General Practice or Not Sure or Other. */
export const NOT_SURE_OR_OTHER_CODE = 'general_practice.not_sure_or_other';
export const GENERAL_PRACTICE_CODES = [
  'general_practice.general_practice',
  NOT_SURE_OR_OTHER_CODE,
] as const;

type Db = Pick<Prisma.TransactionClient, 'case' | '$queryRaw'>;

interface DecideRow {
  participant: boolean;
  visible: boolean;
  browsable: boolean;
  in_practice: boolean;
  in_licensed_state: boolean;
}

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
    // Shard-ready step 6: with several databases the statement below (it
    // joins cases with attorney / block / practice tables) is answered by
    // one query per family instead.
    if (readsAreSplit(this.prisma)) {
      const split = await this.decideRowSplit(a, caseId, db);
      return split ? this.accessOf(split) : null;
    }
    const rows = await db.$queryRaw<
      {
        participant: boolean;
        visible: boolean;
        browsable: boolean;
        in_practice: boolean;
        in_licensed_state: boolean;
      }[]
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
        (c.status = 'open'
         AND EXISTS (SELECT 1 FROM attorney_profiles p
                     WHERE p.user_id = ${a}::UUID
                       AND p.verification_status = 'verified')
         AND NOT EXISTS (SELECT 1 FROM user_blocks ub
                         WHERE (ub.blocker_id = ${a}::UUID AND ub.blocked_id = c.client_id)
                            OR (ub.blocker_id = c.client_id AND ub.blocked_id = ${a}::UUID)))
          AS browsable,
        EXISTS (SELECT 1 FROM attorney_practice_areas ap
                WHERE ap.attorney_id = ${a}::UUID
                  AND (ap.practice_area_id = c.practice_area_id
                       -- Owner 2026-10-15: any of the case's topics counts.
                       OR EXISTS (SELECT 1 FROM case_extra_practices x
                                  WHERE x.case_id = c.id
                                    AND x.practice_area_id = ap.practice_area_id)
                       OR (pa.code = ${NOT_SURE_OR_OTHER_CODE}
                           AND ap.practice_area_id IN (
                             SELECT id FROM practice_areas
                             WHERE code IN (${GENERAL_PRACTICE_CODES[0]},
                                            ${GENERAL_PRACTICE_CODES[1]})))))
          AS in_practice,
        EXISTS (SELECT 1 FROM case_states cs
                JOIN attorney_licenses l ON l.state_code = cs.state_code
                WHERE cs.case_id = c.id AND l.attorney_id = ${a}::UUID
                  AND l.license_status = 'verified')
          AS in_licensed_state
      FROM cases c
      JOIN practice_areas pa ON pa.id = c.practice_area_id
      WHERE c.id = ${caseId}::UUID AND c.deleted_at IS NULL`;
    const row = rows[0];
    if (!row) return null;
    return this.accessOf(row);
  }

  private accessOf(row: DecideRow): CaseAccess | null {
    const inPractice = row.in_practice;
    const inLicensedState = row.in_licensed_state;
    if (row.participant) {
      return {
        kind: 'attorney_participant',
        clientIdentityVisible: false,
        inPractice,
        inLicensedState,
      };
    }
    if (row.visible) {
      return {
        kind: 'attorney_prospect',
        clientIdentityVisible: false,
        inPractice,
        inLicensedState,
      };
    }
    if (row.browsable) {
      return {
        kind: 'attorney_browser',
        clientIdentityVisible: false,
        inPractice,
        inLicensedState,
      };
    }
    return null;
  }

  /**
   * The same five answers as the single statement of decide(), computed
   * from one read of the case family (the case, its bids / conversations /
   * states / extra topics) and a few reads of the global family (profile,
   * licences, blocks, practice areas). Identical results: both paths are
   * exercised by the same e2e suites (SHARD_SPLIT_READS=on).
   */
  private async decideRowSplit(
    a: string,
    caseId: string,
    db: Db,
  ): Promise<DecideRow | null> {
    const c = await db.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        status: true,
        client_id: true,
        practice_area_id: true,
        states: { select: { state_code: true } },
        extra_practices: { select: { practice_area_id: true } },
      },
    });
    if (!c) return null;
    const stateCodes = c.states.map((x) => x.state_code);
    const caseAreaIds = [
      c.practice_area_id,
      ...c.extra_practices.map((x) => x.practice_area_id),
    ];
    const [bid, conv, verified, licences, block, mine, pa, general] =
      await Promise.all([
        this.prisma.bid.findFirst({
          where: { case_id: caseId, attorney_id: a },
          select: { id: true },
        }),
        this.prisma.conversation.findFirst({
          where: { case_id: caseId, attorney_id: a },
          select: { id: true },
        }),
        this.prisma.attorneyProfile.findFirst({
          where: { user_id: a, verification_status: 'verified' },
          select: { user_id: true },
        }),
        stateCodes.length
          ? this.prisma.attorneyLicense.findFirst({
              where: {
                attorney_id: a,
                license_status: 'verified',
                state_code: { in: stateCodes },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        this.prisma.userBlock.findFirst({
          where: {
            OR: [
              { blocker_id: a, blocked_id: c.client_id },
              { blocker_id: c.client_id, blocked_id: a },
            ],
          },
          select: { blocker_id: true },
        }),
        this.prisma.attorneyPracticeArea.findMany({
          where: { attorney_id: a },
          select: { practice_area_id: true },
        }),
        this.prisma.practiceArea.findUnique({
          where: { id: c.practice_area_id },
          select: { code: true },
        }),
        this.prisma.practiceArea.findMany({
          where: { code: { in: [...GENERAL_PRACTICE_CODES] } },
          select: { id: true },
        }),
      ]);
    const open = c.status === 'open';
    const isVerified = verified !== null;
    const blocked = block !== null;
    const mineIds = new Set(mine.map((m) => m.practice_area_id));
    const generalIds = new Set(general.map((g) => g.id));
    const inPractice =
      caseAreaIds.some((id) => mineIds.has(id)) ||
      (pa?.code === NOT_SURE_OR_OTHER_CODE &&
        [...mineIds].some((id) => generalIds.has(id)));
    return {
      participant: bid !== null || conv !== null,
      visible: open && isVerified && licences !== null && !blocked,
      browsable: open && isVerified && !blocked,
      in_practice: inPractice,
      in_licensed_state: licences !== null,
    };
  }

  /** Batched decide() for attorney lists (saved cases): the ids among
   * [caseIds] the attorney may currently see — participant or §5.4
   * prospect — in one query instead of one per row (load review). */
  async visibleCaseIds(
    attorneyId: string,
    caseIds: string[],
    db: Db = this.prisma,
    /** OQ-054: Search drops PAUSED cases (a ranked list kept for a few
     * minutes may still hold one); participants keep theirs. */
    opts: { hidePaused?: boolean } = {},
  ): Promise<Set<string>> {
    const hidePaused = opts.hidePaused ?? false;
    if (caseIds.length === 0) return new Set();
    const a = attorneyId;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id::TEXT AS id
      FROM cases c
      JOIN practice_areas pa ON pa.id = c.practice_area_id
      WHERE c.id = ANY(${caseIds}::UUID[]) AND c.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM bids b
                  WHERE b.case_id = c.id AND b.attorney_id = ${a}::UUID)
          OR EXISTS (SELECT 1 FROM conversations v
                     WHERE v.case_id = c.id AND v.attorney_id = ${a}::UUID)
          OR (c.status = 'open'
              AND (NOT ${hidePaused} OR c.paused_at IS NULL)
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
    Extract<
      CaseAccess,
      {
        kind: 'attorney_participant' | 'attorney_prospect' | 'attorney_browser';
      }
    >
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
      {
        kind: 'attorney_participant' | 'attorney_prospect' | 'attorney_browser';
      }
    >;
  }
}

export function caseNotAvailable(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_AVAILABLE,
    message: 'This case is not available to you.',
  });
}
