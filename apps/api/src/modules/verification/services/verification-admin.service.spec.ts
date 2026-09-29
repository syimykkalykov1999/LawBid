import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { AdminActor } from '../../admin-auth/admin-auth.decorators';
import type { AuditLogService } from '../../admin-access/audit-log.service';
import type { RateLimitService } from '../../auth/services/rate-limit.service';
import type { BidStateMachine } from '../../bids/domain/bid-state-machine';
import type { CaseJournalService } from '../../journal/case-journal.service';
import type { FilesService } from '../../files/files.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { VerificationProviderSelector } from '../providers/verification-provider.selector';
import { DOCUMENT_URL_LIMIT_PER_ADMIN_PER_HOUR } from '../verification.constants';
import type { VerificationChecksService } from './verification-checks.service';
import { VerificationAdminService } from './verification-admin.service';

describe('VerificationAdminService.documentUrl rate limit', () => {
  const admin = { id: 'admin-1', ip: '10.0.0.1' } as AdminActor;
  const link = {
    url: 'https://s3.test/doc',
    expiresAt: '2026-09-27T00:05:00.000Z',
  };

  function build(allowed: boolean) {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'doc-1',
      request_id: 'req-1',
      file_id: 'file-1',
      doc_type: 'selfie',
    });
    const prisma = {
      verificationDocument: { findUnique },
    } as unknown as PrismaService;
    const verificationFileUrl = jest.fn().mockResolvedValue(link);
    const files = { verificationFileUrl } as unknown as FilesService;
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditLogService;
    const consumeFixedWindow = jest.fn().mockResolvedValue({
      allowed,
      remaining: allowed ? 5 : 0,
      retryAfterSeconds: 1200,
    });
    const rateLimit = { consumeFixedWindow } as unknown as RateLimitService;
    const service = new VerificationAdminService(
      prisma,
      files,
      audit,
      {} as NotificationsService,
      {} as VerificationChecksService,
      {} as VerificationProviderSelector,
      rateLimit,
      {} as BidStateMachine,
      {} as CaseJournalService,
    );
    return {
      service,
      consumeFixedWindow,
      findUnique,
      verificationFileUrl,
      record,
    };
  }

  it('consumes the per-admin hourly budget and returns the audited link', async () => {
    const t = build(true);
    await expect(t.service.documentUrl(admin, 'doc-1')).resolves.toEqual(link);
    expect(t.consumeFixedWindow).toHaveBeenCalledWith(
      ['verification-document-url', 'admin', 'admin-1'],
      DOCUMENT_URL_LIMIT_PER_ADMIN_PER_HOUR,
      3600,
    );
    expect(t.record).toHaveBeenCalledTimes(1);
  });

  it('rejects with 429 RATE_LIMITED once the budget is spent, before any presign or audit', async () => {
    const t = build(false);
    const err = await t.service
      .documentUrl(admin, 'doc-1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    const http = err as HttpException;
    expect(http.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(http.getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      details: { retryAfterSeconds: 1200 },
    });
    expect(t.findUnique).not.toHaveBeenCalled();
    expect(t.verificationFileUrl).not.toHaveBeenCalled();
    expect(t.record).not.toHaveBeenCalled();
  });
});
