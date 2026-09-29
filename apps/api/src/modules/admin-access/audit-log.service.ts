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
      },
    });
  }
}
