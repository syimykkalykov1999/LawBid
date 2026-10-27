import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../files/storage/s3-storage.service';

/** Where the object copies live (private documents bucket). */
export const ERASURE_LEDGER_PREFIX = 'erasure-ledger/';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ErasureReason =
  'deletion_request' | 'minor_confirmed' | 'restore_reapply';

/** The object written for one erasure: an opaque id and a date, nothing else. */
export interface ErasureRecord {
  userId: string;
  anonymizedAt: string;
  reason: ErasureReason;
}

/**
 * Owner 2026-10-25 (privacy round 13, S13-1): the erasure ledger. A database
 * restore (PITR, disaster recovery) brings back rows that were erased after
 * the restore point, and `users.anonymized_at` — the idempotency key of the
 * anonymization — is rolled back with them. The ledger therefore lives in
 * TWO places: the `erasure_ledger` table (written in the same transaction
 * as the anonymization) and one small object per person in the private
 * bucket (`erasure-ledger/<id>.json`, written right after the commit and
 * retried by the nightly `privacy.reconcile`). After a restore the runbook
 * (docs/runbooks/backups.md) re-runs the anonymization for every id found
 * in either place (`scripts/reapply-erasures.ts`).
 *
 * No personal data is kept here: the id is opaque and the person is already
 * anonymized. CNIL/ICO: backups may expire on their own, but restored data
 * must not be processed again — this is the suppression list that enforces it.
 */
@Injectable()
export class ErasureLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ErasureLedgerService.name);
  }

  static key(userId: string): string {
    return `${ERASURE_LEDGER_PREFIX}${userId}.json`;
  }

  /** Writes the table row (inside the caller's transaction when given).
   * Idempotent: the first date stays. */
  async record(
    userId: string,
    anonymizedAt: Date,
    reason: ErasureReason,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).erasureLedger.upsert({
      where: { user_id: userId },
      create: { user_id: userId, anonymized_at: anonymizedAt, reason },
      update: {},
    });
  }

  /** Copies one ledger row to the bucket. False when storage is not
   * configured (dev) or the write failed; the nightly job tries again. */
  async syncToStore(userId: string): Promise<boolean> {
    const row = await this.prisma.erasureLedger.findUnique({
      where: { user_id: userId },
    });
    if (!row) return false;
    if (!(await this.storage.ready())) return false;
    const record: ErasureRecord = {
      userId: row.user_id,
      anonymizedAt: row.anonymized_at.toISOString(),
      reason: row.reason as ErasureReason,
    };
    try {
      await this.storage.put(
        this.storage.awsBucket('documents'),
        ErasureLedgerService.key(userId),
        Buffer.from(JSON.stringify(record)),
        'application/json',
      );
    } catch (err) {
      this.logger.error({ err, userId }, 'erasure ledger copy not written');
      return false;
    }
    await this.prisma.erasureLedger.update({
      where: { user_id: userId },
      data: { s3_synced_at: new Date() },
    });
    return true;
  }

  /** Nightly: copies every row that has no object yet. */
  async syncPending(
    limit = 500,
  ): Promise<{ synced: number; failed: number; pending: number }> {
    const rows = await this.prisma.erasureLedger.findMany({
      where: { s3_synced_at: null },
      select: { user_id: true },
      orderBy: { created_at: 'asc' },
      take: limit,
    });
    let synced = 0;
    for (const r of rows) {
      if (await this.syncToStore(r.user_id)) synced += 1;
    }
    return { synced, failed: rows.length - synced, pending: rows.length };
  }

  /** Every erased id: the table plus the bucket (the bucket survives a
   * restore, the table may not). */
  async allErasedIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const r of await this.prisma.erasureLedger.findMany({
      select: { user_id: true },
    })) {
      ids.add(r.user_id);
    }
    if (await this.storage.ready()) {
      const keys = await this.storage.listKeys(
        this.storage.awsBucket('documents'),
        ERASURE_LEDGER_PREFIX,
      );
      for (const k of keys) {
        const id = k.slice(ERASURE_LEDGER_PREFIX.length).replace(/\.json$/, '');
        if (UUID_RE.test(id)) ids.add(id.toLowerCase());
      }
    }
    return [...ids];
  }

  /** After a restore: ids of the ledger whose user row is NOT anonymized
   * (the restore brought them back). */
  async resurrected(): Promise<string[]> {
    const ids = await this.allErasedIds();
    const out: string[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const back = await this.prisma.user.findMany({
        where: { id: { in: chunk }, anonymized_at: null },
        select: { id: true },
      });
      out.push(...back.map((u) => u.id));
    }
    return out;
  }
}
