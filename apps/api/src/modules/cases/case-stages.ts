import type { CaseStatus, Prisma } from '../../generated/prisma/client';
import {
  decodeRankedCursor,
  encodeRankedCursor,
  type RankedKey,
} from '../../common/pagination/ranked-cursor';

/**
 * Owner 2026-11-09 («Дела → Активные»): the five stages of a case as the
 * app draws them (apps/mobile `caseStageOf`): 0 published (open, no bids) ·
 * 1 bids (open, at least one) · 2 in progress · 3 wrapping up (pending
 * completion / disputed) · 4 done (closed, archived). The lists that show
 * the stage scale sort by it — the most advanced case on top, then the
 * newest activity — so the server, the phone copy and the rows agree.
 */
export type CaseStage = 0 | 1 | 2 | 3 | 4;

export const CASE_STAGES: readonly CaseStage[] = [0, 1, 2, 3, 4];

export function caseStageOf(status: CaseStatus, bidsCount: number): CaseStage {
  switch (status) {
    case 'open':
      return bidsCount > 0 ? 1 : 0;
    case 'in_progress':
      return 2;
    case 'pending_completion':
    case 'disputed':
      return 3;
    default:
      return 4;
  }
}

/** Prisma `where` of each stage (on the `Case` model). */
export const CASE_STAGE_WHERE: Record<CaseStage, Prisma.CaseWhereInput> = {
  0: { status: 'open', bids_count: 0 },
  1: { status: 'open', bids_count: { gt: 0 } },
  2: { status: 'in_progress' },
  3: { status: { in: ['pending_completion', 'disputed'] } },
  4: { status: { in: ['closed', 'archived'] } },
};

/** The sort of a stage list: by stage (default of «Active»), or by the
 * case's date, newest or oldest first (the «Дата» filter). */
export const CASE_LIST_SORTS = ['stage', 'newest', 'oldest'] as const;
export type CaseListSort = (typeof CASE_LIST_SORTS)[number];

/** Stages picked in a query (`?stages=0,1` or repeated): numbers for the
 * validator (`@IsInt @Min(0) @Max(4)` each), duplicates dropped. */
export function parseStages(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [NaN];
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** `where` of «any of these stages» (an empty pick = no restriction). */
export function stagesWhere(stages: readonly CaseStage[] | undefined) {
  if (!stages || stages.length === 0) return {};
  if (stages.length === 1) return CASE_STAGE_WHERE[stages[0]];
  return { OR: stages.map((s) => CASE_STAGE_WHERE[s]) };
}

/** The cursor of a stage-sorted page: `[stage, last_activity_at, id]`
 * (the ranked cursor of the rating lists, reused as is). */
export const encodeStageCursor = encodeRankedCursor;

export function decodeStageCursor(raw: string): RankedKey | undefined {
  const k = decodeRankedCursor(raw);
  if (!k || !Number.isInteger(k.rank) || k.rank < 0 || k.rank > 4) {
    return undefined;
  }
  return k;
}

/**
 * One page of a list sorted «stage desc, activity desc, id desc», read
 * group by group: the groups are the stages in output order; each is one
 * Prisma query with the group's own `where` and the keyset inside the
 * group, so the search / practice / state filters compose as they do
 * today and the planner uses the same indexes. At most one query per
 * stage that still has rows; most people have one page of cases.
 *
 * [fetch] reads up to [take] rows of a stage after [after] (null = from
 * the top); [hasAny] says whether any of the given stages has a row (used
 * only when a page fills up exactly at a stage boundary).
 */
export async function pageByStages<T>(opts: {
  stages: readonly CaseStage[];
  cursor: RankedKey | undefined;
  limit: number;
  fetch: (
    stage: CaseStage,
    after: { createdAt: Date; id: string } | undefined,
    take: number,
  ) => Promise<T[]>;
  hasAny: (stages: readonly CaseStage[]) => Promise<boolean>;
}): Promise<{ items: T[]; hasMore: boolean }> {
  const { stages, cursor, limit } = opts;
  const items: T[] = [];
  let start = 0;
  if (cursor) {
    const i = stages.indexOf(cursor.rank as CaseStage);
    // A cursor of a stage no longer in the pick: start over at the top.
    start = i < 0 ? 0 : i;
  }
  for (let i = start; i < stages.length; i++) {
    const remaining = limit - items.length;
    const after =
      cursor && i === start && stages[i] === cursor.rank
        ? { createdAt: cursor.createdAt, id: cursor.id }
        : undefined;
    const rows = await opts.fetch(stages[i], after, remaining + 1);
    items.push(...rows.slice(0, remaining));
    if (rows.length > remaining) return { items, hasMore: true };
    if (items.length === limit) {
      const rest = stages.slice(i + 1);
      return {
        items,
        hasMore: rest.length > 0 ? await opts.hasAny(rest) : false,
      };
    }
  }
  return { items, hasMore: false };
}

/** Prisma keyset «after this row» for `[last_activity_at desc, id desc]`. */
export function afterActivity(after: { createdAt: Date; id: string }) {
  return {
    OR: [
      { last_activity_at: { lt: after.createdAt } },
      { last_activity_at: after.createdAt, id: { lt: after.id } },
    ],
  };
}
