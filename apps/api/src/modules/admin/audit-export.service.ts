import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';

export const AUDIT_EXPORT_CURSOR_KEY = 'admin.audit_export_cursor';
/** Rows per file, and files per run (a quiet system needs one). */
export const AUDIT_EXPORT_BATCH = 5000;
export const AUDIT_EXPORT_MAX_FILES = 20;

export interface AuditExportResult {
  skipped?: string;
  files: number;
  rows: number;
  lastSeq: number | null;
  chainBrokenAtSeq: number | null;
}

/** Minimal S3 surface, so a test can pass a fake. */
export interface AuditPutter {
  put(bucket: string, key: string, body: string): Promise<void>;
}

class S3Putter implements AuditPutter {
  private client: S3Client | null = null;
  constructor(private readonly config: ConfigService) {}

  async put(bucket: string, key: string, body: string): Promise<void> {
    this.client ??= new S3Client({
      region: this.config.get<string>('S3_REGION'),
    });
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/x-ndjson',
        // S3 verifies the bytes on arrival.
        ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
      }),
    );
  }
}

/**
 * Owner 2026-10-28: `admin.audit-export` — once a day every audit row that
 * is not yet outside the database is written, as one JSON line per row
 * with its chain hashes, to the audit bucket (infra/modules/audit-logs).
 * The bucket denies deletes by IAM and may have Object Lock, so even an
 * attacker who owns the database cannot rewrite what was already copied.
 * Each run first re-checks the hash chain and records where it breaks.
 * Without ADMIN_AUDIT_EXPORT_BUCKET (Terraform) the job does nothing.
 */
@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);
  private putter: AuditPutter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.putter = new S3Putter(config);
  }

  /** Tests swap the S3 client. */
  useUploader(p: AuditPutter): void {
    this.putter = p;
  }

  private async readCursor(): Promise<number> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: AUDIT_EXPORT_CURSOR_KEY },
    });
    const v = (row?.value as { seq?: unknown } | null)?.seq;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  async run(now = new Date()): Promise<AuditExportResult> {
    const bucket = this.config.get<string>('ADMIN_AUDIT_EXPORT_BUCKET');
    const empty = {
      files: 0,
      rows: 0,
      lastSeq: null,
      chainBrokenAtSeq: null,
    };
    if (!bucket) return { ...empty, skipped: 'no bucket configured' };
    if (
      this.settings &&
      !(await this.settings.boolean('admin.audit_export_enabled'))
    ) {
      return { ...empty, skipped: 'switched off' };
    }
    // The nightly recount: the stored result is what the admin endpoint shows.
    const chain = await this.audit.verifyChain({ fresh: true });
    if (chain.brokenAtSeq !== null) {
      // Loud on purpose: the status watchdog and log alarms pick it up.
      this.logger.error(
        `audit_log hash chain is BROKEN at seq ${chain.brokenAtSeq}`,
      );
    }
    let cursor = await this.readCursor();
    let files = 0;
    let rows = 0;
    const day = now.toISOString().slice(0, 10).replace(/-/g, '/');
    for (let i = 0; i < AUDIT_EXPORT_MAX_FILES; i++) {
      const batch = await this.prisma.auditLog.findMany({
        where: { seq: { gt: cursor } },
        orderBy: { seq: 'asc' },
        take: AUDIT_EXPORT_BATCH,
      });
      if (batch.length === 0) break;
      const first = Number(batch[0].seq);
      const last = Number(batch[batch.length - 1].seq);
      const body =
        batch
          .map((r) =>
            JSON.stringify({
              seq: Number(r.seq),
              id: r.id,
              adminId: r.admin_id,
              action: r.action,
              targetType: r.target_type,
              targetId: r.target_id,
              justification: r.justification,
              reasonCode: r.reason_code,
              before: r.before,
              after: r.after,
              ip: r.ip,
              createdAt: r.created_at.toISOString(),
              prevHash: r.prev_hash,
              rowHash: r.row_hash,
            }),
          )
          .join('\n') + '\n';
      await this.putter.put(
        bucket,
        `admin-audit/${day}/audit-${first}-${last}.jsonl`,
        body,
      );
      cursor = last;
      // Advance only after the upload succeeded: a crash re-sends, never skips.
      await this.prisma.appConfig.upsert({
        where: { key: AUDIT_EXPORT_CURSOR_KEY },
        create: { key: AUDIT_EXPORT_CURSOR_KEY, value: { seq: last } },
        update: { value: { seq: last } },
      });
      files += 1;
      rows += batch.length;
      if (batch.length < AUDIT_EXPORT_BATCH) break;
    }
    return {
      files,
      rows,
      lastSeq: cursor || null,
      chainBrokenAtSeq: chain.brokenAtSeq,
    };
  }
}
