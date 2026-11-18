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
import type { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';

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
      {
        recompute: jest.fn(),
        confirmDocuments: jest.fn(),
      } as unknown as AttorneyTrustService,
      { blockOnReject: jest.fn(() => Promise.resolve(false)) } as never,
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

  it('owner 12.11: the super admin has no hourly cap (staff keep it)', async () => {
    const t = build(false);
    const owner = { ...admin, adminRole: 'super_admin' } as AdminActor;
    await expect(t.service.documentUrl(owner, 'doc-1')).resolves.toEqual(link);
    expect(t.consumeFixedWindow).not.toHaveBeenCalled();
    expect(t.record).toHaveBeenCalledTimes(1);
  });
});

/** VE1 (17.11): a verifier limited to some countries opens neither the
 * documents nor the decisions of an attorney outside them — the same 404 the
 * queue and the card already give (country-scope.ts userInScope). */
describe('VerificationAdminService country scope on every action', () => {
  const scoped = {
    id: 'admin-1',
    ip: '10.0.0.1',
    countries: ['CA'],
  } as unknown as AdminActor;

  function build() {
    const req = {
      id: 'req-1',
      attorney_id: 'att-1',
      status: 'in_review',
      reviewed_by: 'admin-1',
      submitted_at: new Date(),
    };
    const tx = {
      verificationRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...req, status: 'submitted' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(req),
      },
      attorneyLicense: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      verificationDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          request_id: 'req-1',
          file_id: 'file-1',
          doc_type: 'selfie',
          request: { attorney_id: 'att-1' },
        }),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const verificationFileUrl = jest.fn().mockResolvedValue({ url: 'u' });
    const record = jest.fn().mockResolvedValue(undefined);
    const service = new VerificationAdminService(
      prisma,
      { verificationFileUrl } as unknown as FilesService,
      { record } as unknown as AuditLogService,
      {} as NotificationsService,
      {} as VerificationChecksService,
      {} as VerificationProviderSelector,
      {
        consumeFixedWindow: jest
          .fn()
          .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
      } as unknown as RateLimitService,
      {} as BidStateMachine,
      {} as CaseJournalService,
      {
        recompute: jest.fn(),
        confirmDocuments: jest.fn(),
      } as unknown as AttorneyTrustService,
      { blockOnReject: jest.fn(() => Promise.resolve(false)) } as never,
    );
    return { service, tx, req, verificationFileUrl, record };
  }

  const expect404 = (err: unknown) => {
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  };

  it('documentUrl: no link and no audited view out of scope', async () => {
    const t = build();
    expect404(
      await t.service.documentUrl(scoped, 'doc-1').catch((e: unknown) => e),
    );
    expect(t.verificationFileUrl).not.toHaveBeenCalled();
    expect(t.record).not.toHaveBeenCalled();
  });

  it('take: the request is not locked to the verifier out of scope', async () => {
    const t = build();
    expect404(await t.service.take(scoped, 'req-1').catch((e: unknown) => e));
    expect(t.tx.verificationRequest.updateMany).not.toHaveBeenCalled();
  });

  it('approve: nothing changes out of scope', async () => {
    const t = build();
    t.tx.verificationRequest.findUnique.mockResolvedValue(t.req);
    expect404(
      await t.service.approve(scoped, 'req-1').catch((e: unknown) => e),
    );
    expect(t.tx.verificationRequest.update).not.toHaveBeenCalled();
  });

  it('reject: nothing changes out of scope', async () => {
    const t = build();
    t.tx.verificationRequest.findUnique.mockResolvedValue(t.req);
    expect404(
      await t.service
        .reject(scoped, 'req-1', { rejectionCode: 'other' } as never)
        .catch((e: unknown) => e),
    );
    expect(t.tx.attorneyLicense.updateMany).not.toHaveBeenCalled();
    expect(t.tx.verificationRequest.update).not.toHaveBeenCalled();
  });
});
