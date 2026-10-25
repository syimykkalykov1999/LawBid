import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
   * Owner 2026-10-28: re-computes the hash chain (the audit_log_chain
   * trigger writes it, see the migration). A row that was edited, removed
   * or inserted out of order breaks the link at its `seq`. Cutting rows off
   * the END is caught by comparing the head with the daily S3 export.
   */
  async verifyChain(fromSeq = 0): Promise<ChainCheck> {
    const broken = await this.prisma.$queryRaw<{ seq: bigint }[]>`
      SELECT seq FROM (
        SELECT a.seq, a.prev_hash, a.row_hash,
               lag(a.row_hash) OVER (ORDER BY a.seq) AS expected_prev,
               audit_log_row_hash(a.prev_hash, a) AS recomputed,
               row_number() OVER (ORDER BY a.seq) AS rn
          FROM audit_log a WHERE a.seq IS NOT NULL AND a.seq >= ${fromSeq}
      ) t
      WHERE (t.rn > 1 AND t.prev_hash IS DISTINCT FROM t.expected_prev)
         OR t.row_hash IS DISTINCT FROM t.recomputed
      ORDER BY seq LIMIT 1`;
    const head = await this.prisma.auditLog.findFirst({
      where: { seq: { not: null } },
      orderBy: { seq: 'desc' },
      select: { seq: true, row_hash: true },
    });
    const checked = await this.prisma.auditLog.count({
      where: { seq: { gte: fromSeq } },
    });
    return {
      checked,
      brokenAtSeq: broken[0] ? Number(broken[0].seq) : null,
      headHash: head?.row_hash ?? null,
      headSeq: head?.seq != null ? Number(head.seq) : null,
    };
  }
}
