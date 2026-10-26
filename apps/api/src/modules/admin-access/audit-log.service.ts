import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  checkAuditChain,
  TOTALS_BUTTON_COOLDOWN_MS,
} from '../admin/dashboard.service';

/** The stored result of the last chain check (AdminSummaryService). */
export const AUDIT_CHAIN_SUMMARY_KEY = 'audit-chain';

export interface AuditEntry {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
  // docs/06 §2.1: why sensitive data was viewed (X-Justification).
  justification?: string | null;
  // Owner 2026-10-28: coded reason of a private-content read.
  reasonCode?: string | null;
}

export interface ChainCheck {
  /** Hashed rows examined. */
  checked: number;
  /** First `seq` whose link or hash does not match, else null. */
  brokenAtSeq: number | null;
  /** Hash of the newest row (the "head"), null when nothing is hashed yet. */
  headHash: string | null;
  headSeq: number | null;
}

/**
 * Append-only `audit_log` writer (docs/02 §6.2; docs/03 §2.5 "Все
 * действия пишутся в audit_log (кто, что, когда, до/после)"). Pass the
 * caller's transaction so the audit row commits atomically with the
 * change it records.
 */
@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  async record(
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        admin_id: entry.adminId,
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        before: entry.before ?? Prisma.DbNull,
        after: entry.after ?? Prisma.DbNull,
        ip: entry.ip ?? null,
        justification: entry.justification ?? null,
        reason_code: entry.reasonCode ?? null,
      },
    });
  }

  /**
   * Owner 2026-10-28: the audit_log hash chain check (a row that was
   * edited, removed or inserted out of order breaks the link at its `seq`).
   * Snapshot rule 2026-10-25: the scan itself is the snapshot compute
   * (checkAuditChain in dashboard.service.ts). The nightly export recounts
   * it (`fresh`) and stores the result; the admin endpoint reads the stored
   * result and recounts at most once per 10 minutes.
   */
  async verifyChain(opts: { fresh?: boolean } = {}): Promise<ChainCheck> {
    const compute = () => checkAuditChain(this.prisma);
    if (!this.summary) return compute();
    if (!opts.fresh) {
      const hit = await this.summary.peek<ChainCheck>(AUDIT_CHAIN_SUMMARY_KEY);
      if (
        hit &&
        Date.now() - Date.parse(hit.computedAt) < TOTALS_BUTTON_COOLDOWN_MS
      )
        return hit.data;
    }
    return (
      await this.summary.refresh(AUDIT_CHAIN_SUMMARY_KEY, compute, !opts.fresh)
    ).data;
  }
}
