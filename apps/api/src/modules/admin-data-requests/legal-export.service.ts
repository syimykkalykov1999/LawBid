import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { LegalExport, LegalHold, Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CronIdleBackoffService } from '../../common/ops/cron-idle-backoff.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import type {
  CreateLegalExportDto,
  CreateLegalHoldDto,
  LegalDownloadDto,
  LegalExportDto,
  LegalHoldDto,
} from './legal-export.dto';

export const LEGAL_AUDIT = {
  lookup: 'legal.lookup',
  card: 'legal.card',
  queue: 'legal_export.queue',
  download: 'legal_export.download',
  holdOn: 'legal_hold.create',
  holdOff: 'legal_hold.release',
} as const;

/** Pending archives waiting for the worker; a safety valve, not a quota. */
const QUEUE_MAX = 50;
const DOWNLOAD_TTL_SEC = 300;

/** Owner 2026-10-20: queueing, listing and downloading evidence archives, and
 * the manual legal holds. The ZIP itself is built by LegalExportBuilder. */
@Injectable()
export class LegalExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly storage: S3StorageService,
    private readonly settings: AppSettingsService,
    // S20-6: a queued archive wakes the slowed-down builder at once.
    @Optional() private readonly idleBackoff?: CronIdleBackoffService,
  ) {}

  async queue(
    admin: AdminActor,
    requestId: string,
    dto: CreateLegalExportDto,
  ): Promise<LegalExportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const request = await this.prisma.dataAccessRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw notFound('Data request not found.');
    if (request.status === 'fulfilled' || request.status === 'rejected') {
      throw bad('The request is closed.');
    }
    const subject = await this.prisma.user.findUnique({
      where: withDeleted({ id: dto.userId }),
      select: { id: true },
    });
    if (!subject) throw notFound('User not found.');
    if (dto.dateFrom && dto.dateTo && dto.dateFrom > dto.dateTo) {
      throw bad('dateFrom is after dateTo.');
    }
    const waiting = await this.prisma.legalExport.count({
      where: { status: { in: ['queued', 'running'] } },
    });
    if (waiting >= QUEUE_MAX) throw bad('The export queue is full; wait.');

    const selection: Prisma.InputJsonObject = {
      sections: [...new Set(dto.sections)],
      ...(dto.conversationIds?.length
        ? { conversationIds: dto.conversationIds }
        : {}),
      ...(dto.groupIds?.length ? { groupIds: dto.groupIds } : {}),
      ...(dto.dateFrom ? { dateFrom: dto.dateFrom } : {}),
      ...(dto.dateTo ? { dateTo: dto.dateTo } : {}),
    };
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.legalExport.create({
        data: {
          request_id: requestId,
          subject_user_id: dto.userId,
          requested_by: admin.id,
          selection,
        },
      });
      if (request.status === 'received') {
        await tx.dataAccessRequest.update({
          where: { id: requestId },
          data: { status: 'in_progress' },
        });
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_AUDIT.queue,
          targetType: 'legal_export',
          targetId: created.id,
          after: { requestId, userId: dto.userId, selection },
          ip: admin.ip,
          justification: admin.justification,
        },
        tx,
      );
      return created;
    });
    await this.idleBackoff?.wake('legal.exports');
    return presentExport(row);
  }

  async list(requestId: string): Promise<LegalExportDto[]> {
    const rows = await this.prisma.legalExport.findMany({
      where: { request_id: requestId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map(presentExport);
  }

  /** A five-minute signed link; every download is an audit row. */
  async download(
    admin: AdminActor,
    exportId: string,
  ): Promise<LegalDownloadDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const row = await this.prisma.legalExport.findUnique({
      where: { id: exportId },
    });
    if (!row) throw notFound('Export not found.');
    if (row.status !== 'ready' || !row.file_bucket || !row.file_key) {
      throw bad('The archive is not ready or has expired.');
    }
    // Owner 2026-10-28: a production leaves the system a limited number of
    // times; the counter is bumped first and atomically, so two admins
    // cannot both use the last download.
    const max = await this.settings.number('legal.export_max_downloads');
    const claimed = await this.prisma.legalExport.updateMany({
      where: {
        id: row.id,
        ...(max > 0 ? { download_count: { lt: max } } : {}),
      },
      data: {
        download_count: { increment: 1 },
        last_downloaded_at: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw bad('The download limit for this archive is used up.');
    }
    const url = await this.storage.signedGetUrl(
      row.file_bucket,
      row.file_key,
      DOWNLOAD_TTL_SEC,
      `lawbid-records-${row.id}.zip`,
    );
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_AUDIT.download,
      targetType: 'legal_export',
      targetId: row.id,
      after: {
        sha256: row.sha256,
        manifestSha256: row.manifest_sha256,
        downloadNumber: row.download_count + 1,
        of: max > 0 ? max : null,
      },
      ip: admin.ip,
      justification: admin.justification,
    });
    return {
      downloadsLeft: max > 0 ? Math.max(0, max - row.download_count - 1) : null,
      url,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString(),
      sha256: row.sha256,
    };
  }

  async createHold(
    admin: AdminActor,
    requestId: string,
    dto: CreateLegalHoldDto,
  ): Promise<LegalHoldDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const request = await this.prisma.dataAccessRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw notFound('Data request not found.');
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
      throw bad('expiresAt must be in the future.');
    }
    // 18 U.S.C. 2703(f): a preservation request lasts 90 days (one renewal
    // of 90 more = a new hold). Other requests keep "until released".
    let expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (!expiresAt && request.request_type === 'preservation') {
      const days = await this.settings.number('legal.preservation_days');
      if (days > 0) expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);
    }
    if (!(await this.targetExists(dto.targetType, dto.targetId))) {
      throw notFound('Target not found.');
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.legalHold.create({
        data: {
          request_id: requestId,
          target_type: dto.targetType,
          target_id: dto.targetId,
          created_by: admin.id,
          expires_at: expiresAt,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_AUDIT.holdOn,
          targetType: 'legal_hold',
          targetId: created.id,
          after: { requestId, ...dto },
          ip: admin.ip,
        },
        tx,
      );
      return created;
    });
    return presentHold(row);
  }

  async releaseHold(admin: AdminActor, holdId: string): Promise<LegalHoldDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.legalHold.findUnique({ where: { id: holdId } });
      if (!before) throw notFound('Hold not found.');
      if (before.released_at) return before;
      const updated = await tx.legalHold.update({
        where: { id: holdId },
        data: { released_at: new Date() },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_AUDIT.holdOff,
          targetType: 'legal_hold',
          targetId: holdId,
          ip: admin.ip,
        },
        tx,
      );
      return updated;
    });
    return presentHold(row);
  }

  async listHolds(requestId: string): Promise<LegalHoldDto[]> {
    const rows = await this.prisma.legalHold.findMany({
      where: { request_id: requestId },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map(presentHold);
  }

  /** The retention window the owner configured (for the panel's hint). */
  retentionDays(): Promise<number> {
    return this.settings.number('legal.deleted_retention_days');
  }

  private async targetExists(type: string, id: string): Promise<boolean> {
    if (type === 'user') {
      return !!(await this.prisma.user.findUnique({
        where: withDeleted({ id }),
        select: { id: true },
      }));
    }
    if (type === 'case') {
      return !!(await this.prisma.case.findUnique({
        where: { id },
        select: { id: true },
      }));
    }
    if (type === 'conversation') {
      return !!(await this.prisma.conversation.findUnique({
        where: { id },
        select: { id: true },
      }));
    }
    return !!(await this.prisma.chatGroup.findUnique({
      where: withDeleted({ id }),
      select: { id: true },
    }));
  }
}

function presentExport(r: LegalExport): LegalExportDto {
  return {
    id: r.id,
    requestId: r.request_id,
    subjectUserId: r.subject_user_id,
    requestedBy: r.requested_by,
    status: r.status,
    selection: r.selection as Record<string, unknown>,
    rowCounts: (r.row_counts as Record<string, number> | null) ?? null,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    sha256: r.sha256,
    manifestSha256: r.manifest_sha256,
    manifestSignature: r.manifest_signature,
    signatureAlg: r.signature_alg,
    downloadCount: r.download_count,
    lastDownloadedAt: r.last_downloaded_at?.toISOString() ?? null,
    error: r.error,
    createdAt: r.created_at.toISOString(),
    finishedAt: r.finished_at?.toISOString() ?? null,
    expiresAt: r.expires_at?.toISOString() ?? null,
  };
}

function presentHold(r: LegalHold): LegalHoldDto {
  return {
    id: r.id,
    requestId: r.request_id,
    targetType: r.target_type,
    targetId: r.target_id,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at?.toISOString() ?? null,
    releasedAt: r.released_at?.toISOString() ?? null,
  };
}

const notFound = (message: string) =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
const bad = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });
