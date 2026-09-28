import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CaseJournal,
  CaseJournalEvent,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caseNotFound } from '../cases/domain/case-state-machine';
import { canonicalJson } from './canonical-json';

/** docs/04 §1, docs/02 §6.4: journal rows are kept 5 years. */
export const JOURNAL_RETENTION_YEARS = 5;

/** Who did it. `null` user/role: the system (cron jobs, auto-transitions). */
export interface JournalActor {
  userId: string | null;
  role: UserRole | null;
}

export const SYSTEM_ACTOR: JournalActor = { userId: null, role: null };

export interface JournalAppendInput {
  caseId: string;
  clientId: string;
  actor: JournalActor;
  event: CaseJournalEvent;
  /** bid_id, amounts, statuses, actor IP/device (docs/02 §4.D). */
  payload: Prisma.InputJsonObject;
  /** docs/04 §14: set for events tied to a bid or the attorney's work. */
  attorneyId?: string | null;
}

/** The hashed fields of a row: everything except row_hash itself. The
 * payload is typed loosely: the same row is hashed on insert (input JSON)
 * and on verification (JSON read back from JSONB). */
type HashedRow = Omit<CaseJournal, 'row_hash' | 'payload'> & {
  payload: unknown;
};

export function computeRowHash(row: HashedRow): string {
  const content = canonicalJson({
    id: row.id,
    case_id: row.case_id,
    client_id: row.client_id,
    attorney_id: row.attorney_id,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    event_type: row.event_type,
    payload: row.payload,
    prev_hash: row.prev_hash,
    retain_until: row.retain_until,
    created_at: row.created_at,
  });
  return createHash('sha256')
    .update((row.prev_hash ?? '') + content)
    .digest('hex');
}

export function retainUntil(createdAt: Date): Date {
  const d = new Date(createdAt.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + JOURNAL_RETENTION_YEARS);
  return d;
}

export type ChainBreakReason = 'hash_mismatch' | 'link_mismatch';

export interface ChainVerification {
  valid: boolean;
  /** Rows checked (all rows of the case when valid). */
  checked: number;
  /** First broken row, when invalid. */
  brokenAt?: { id: string; reason: ChainBreakReason };
}

type JournalReader = Pick<Prisma.TransactionClient, 'caseJournal'>;

/**
 * docs/02_DATABASE.md §4.D / §6.2 — the ONLY writer of case_journal
 * (.cursorrules: "запись журнала только через CaseJournalService.append()
 * в той же транзакции"). Rows form a per-case hash chain:
 * prev_hash = row_hash of the case's previous row (null for the first),
 * row_hash = SHA-256(prev_hash + canonical JSON of the row), so any later
 * edit, deletion or reordering is detectable by verifyChain().
 *
 * Per-case serialization (safe on CockroachDB): append() first takes
 * `SELECT ... FOR UPDATE` on the case's `cases` row — the journal row
 * itself can't be locked (lawbid_app has no UPDATE on case_journal, and
 * the first row doesn't exist yet) — so two transactions appending to the
 * same case run one after the other and each sees the other's tail. Under
 * CockroachDB SERIALIZABLE the read of the tail would already conflict;
 * the lock turns that retry into a wait. created_at is made strictly
 * increasing within a case, so "last row" is unambiguous.
 */
@Injectable()
export class CaseJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    tx: Prisma.TransactionClient,
    input: JournalAppendInput,
  ): Promise<CaseJournal> {
    const owner = await tx.$queryRaw<{ client_id: string }[]>`
      SELECT client_id FROM cases WHERE id = ${input.caseId}::UUID FOR UPDATE`;
    if (owner.length === 0) throw caseNotFound();
    if (owner[0].client_id !== input.clientId) {
      throw new Error('case_journal: clientId does not own the case');
    }

    const last = await tx.caseJournal.findFirst({
      where: { case_id: input.caseId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { row_hash: true, created_at: true },
    });
    const now = Date.now();
    const createdAt = new Date(
      last ? Math.max(now, last.created_at.getTime() + 1) : now,
    );
    const row: HashedRow = {
      id: randomUUID(),
      case_id: input.caseId,
      client_id: input.clientId,
      attorney_id: input.attorneyId ?? null,
      actor_user_id: input.actor.userId,
      actor_role: input.actor.role,
      event_type: input.event,
      payload: input.payload,
      prev_hash: last?.row_hash ?? null,
      retain_until: retainUntil(createdAt),
      created_at: createdAt,
    };
    return tx.caseJournal.create({
      data: {
        ...row,
        payload: input.payload,
        row_hash: computeRowHash(row),
      },
    });
  }

  /**
   * Recomputes the case's chain from its first row. Used by the file-06
   * daily integrity worker.
   * TODO(docs/06 integrity worker): once lawbid_retention starts deleting
   * rows past retain_until (docs/02 §6.2), the oldest remaining row of a
   * long-lived case has a non-null prev_hash; the worker must then accept
   * a head whose predecessor is past retention.
   */
  async verifyChain(
    caseId: string,
    db: JournalReader = this.prisma,
  ): Promise<ChainVerification> {
    const rows = await db.caseJournal.findMany({
      where: { case_id: caseId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    return verifyRows(rows);
  }
}

/** Pure chain check over rows in chain order. */
export function verifyRows(rows: readonly CaseJournal[]): ChainVerification {
  let expectedPrev: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prev_hash !== expectedPrev) {
      return {
        valid: false,
        checked: i,
        brokenAt: { id: row.id, reason: 'link_mismatch' },
      };
    }
    if (computeRowHash(row) !== row.row_hash) {
      return {
        valid: false,
        checked: i,
        brokenAt: { id: row.id, reason: 'hash_mismatch' },
      };
    }
    expectedPrev = row.row_hash;
  }
  return { valid: true, checked: rows.length };
}
