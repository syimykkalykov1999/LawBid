import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AdminActor } from '../../admin-auth/admin-auth.decorators';
import type { AuditLogService } from '../../admin-access/audit-log.service';
import type { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import type { RateLimitService } from '../../auth/services/rate-limit.service';
import type { BidStateMachine } from '../../bids/domain/bid-state-machine';
import type { FilesService } from '../../files/files.service';
import type { CaseJournalService } from '../../journal/case-journal.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { VerificationProviderSelector } from '../providers/verification-provider.selector';
import type { BarLookupProvider } from '../providers/verification-providers';
import {
  REGISTRY_CHECK_TIMEOUT_MS,
  RegistryCheckQueue,
  type RegistryCheckJobData,
} from '../registry-check.queue';
import { VerificationAdminService } from './verification-admin.service';
import { VerificationChecksService } from './verification-checks.service';

/**
 * Owner 2026-11-04 (R-394): «Подтвердить» works by hand whatever the
 * registry said; «По реестру» / «Перепроверить» never wait on the state
 * registry inside the click — they queue a job, the worker stores the
 * result with a hard timeout.
 */
const admin = { id: 'admin-1', ip: '10.0.0.1' } as AdminActor;
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

function service(over: {
  prisma: Record<string, unknown>;
  checks?: Partial<VerificationChecksService>;
  queue?: Partial<RegistryCheckQueue>;
  provider?: Partial<BarLookupProvider>;
}) {
  const record = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    ...over.prisma,
  } as unknown as PrismaService & Record<string, unknown>;
  const selector = {
    barLookup: jest.fn().mockResolvedValue({ name: 'auto', ...over.provider }),
  } as unknown as VerificationProviderSelector;
  const svc = new VerificationAdminService(
    prisma,
    {} as FilesService,
    { record } as unknown as AuditLogService,
    {} as NotificationsService,
    (over.checks ?? {}) as VerificationChecksService,
    selector,
    {} as RateLimitService,
    {} as BidStateMachine,
    {} as CaseJournalService,
    { recompute: jest.fn() } as unknown as AttorneyTrustService,
    { blockOnReject: jest.fn(() => Promise.resolve(false)) } as never,
    undefined,
    undefined,
    undefined,
    over.queue as RegistryCheckQueue | undefined,
  );
  return { svc, record, prisma };
}

describe('R-394 manual license confirmation', () => {
  it('a super-admin confirms a pending license the registry never checked; the audit says manual', async () => {
    const submittedAt = new Date('2026-11-04T07:00:00Z');
    const update = jest.fn().mockResolvedValue({});
    const { svc, record } = service({
      prisma: {
        verificationRequest: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'req-1',
            status: 'in_review',
            reviewed_by: admin.id,
            attorney_id: 'att-1',
            submitted_at: submittedAt,
          }),
        },
        attorneyLicense: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'lic-1',
            attorney_id: 'att-1',
            license_status: 'pending',
            rejection_code: null,
            registry_flag: null,
            auto_check_result: null,
            verified_by: null,
            updated_at: submittedAt,
          }),
          update,
        },
      },
    });
    jest.spyOn(svc, 'card').mockResolvedValue({} as never);

    await svc.decideLicense(admin, 'req-1', 'lic-1', { decision: 'verified' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({ license_status: 'verified' }),
      }),
    );
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'verification.license_decision',
      after: {
        status: 'verified',
        manual: true,
        decidedBy: admin.id,
        registryResult: null,
      },
    });
  });
});

describe('R-394 registry checks run in the background', () => {
  it('«Перепроверить» answers at once with a check id and never calls the registry', async () => {
    const enqueue = jest.fn(
      (input: Omit<RegistryCheckJobData, 'checkId' | 'queuedAt'>) =>
        Promise.resolve({
          ...input,
          checkId: 'check-1',
          queuedAt: '2026-11-04T07:30:00.000Z',
        }),
    );
    const lookup = jest.fn();
    const barLookup = jest.fn();
    const { svc } = service({
      prisma: {
        attorneyLicense: {
          findUnique: jest.fn().mockResolvedValue({ id: 'lic-1' }),
        },
      },
      queue: { enqueue },
      checks: { barLookup },
      provider: { lookup },
    });

    const res = await svc.recheck(admin, 'lic-1');

    expect(res).toEqual({
      licenseId: 'lic-1',
      checkId: 'check-1',
      kind: 'recheck',
      status: 'queued',
      queuedAt: '2026-11-04T07:30:00.000Z',
    });
    expect(enqueue).toHaveBeenCalledWith(
      {
        licenseId: 'lic-1',
        kind: 'recheck',
        adminId: admin.id,
        adminIp: admin.ip,
      },
      expect.any(Function),
    );
    expect(barLookup).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('the job looks the license up with the hard timeout, stores the result and clears «проверяется…»', async () => {
    const barLookup = jest.fn().mockResolvedValue({
      result: 'manual_review',
      details: { reason: 'provider_error' },
    });
    const clearPending = jest.fn().mockResolvedValue(undefined);
    const { svc, record } = service({
      prisma: {
        attorneyLicense: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'lic-1',
            attorney_id: 'att-1',
            state_code: 'IL',
            bar_number: '6248201047',
            license_status: 'pending',
            registry_flag: null,
            attorney: { user: { first_name: 'A', last_name: 'B' } },
          }),
        },
      },
      checks: { barLookup },
      queue: { clearPending },
    });

    await svc.runRegistryCheck({
      checkId: 'check-1',
      licenseId: 'lic-1',
      kind: 'recheck',
      adminId: admin.id,
      adminIp: admin.ip,
      queuedAt: '2026-11-04T07:30:00.000Z',
    });

    expect(barLookup).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'auto' }),
      expect.objectContaining({ id: 'lic-1' }),
      null,
      { firstName: 'A', lastName: 'B' },
      { timeoutMs: REGISTRY_CHECK_TIMEOUT_MS },
    );
    // A license already under review is only looked up again.
    expect(record.mock.calls[0][0]).toMatchObject({
      adminId: admin.id,
      action: 'verification.license_recheck',
      after: {
        status: 'pending',
        result: 'manual_review',
        reason: 'provider_error',
        requestId: null,
        checkId: 'check-1',
      },
    });
    expect(clearPending).toHaveBeenCalledWith('lic-1');
  });

  it('a registry that never answers is stored as «недоступен» after the timeout, with the state bar link', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const update = jest.fn().mockResolvedValue({});
      const prisma = {
        attorneyLicense: { update },
      } as unknown as PrismaService;
      const checks = new VerificationChecksService(
        prisma,
        {} as VerificationProviderSelector,
        {} as NotificationsService,
        {} as AttorneyTrustService,
        logger,
      );
      const hanging: BarLookupProvider = {
        name: 'auto',
        lookup: () => new Promise(() => undefined),
      };
      const pending = checks.barLookup(
        hanging,
        { id: 'lic-1', state_code: 'IL', bar_number: '6248201047' },
        null,
        { firstName: 'A', lastName: 'B' },
        { timeoutMs: REGISTRY_CHECK_TIMEOUT_MS },
      );
      await jest.advanceTimersByTimeAsync(REGISTRY_CHECK_TIMEOUT_MS + 1);
      const outcome = await pending;
      expect(outcome).toEqual({
        result: 'manual_review',
        details: { provider: 'auto', reason: 'provider_error' },
      });
      const stored = (
        update.mock.calls[0][0] as {
          data: { auto_check_result: Record<string, unknown> };
        }
      ).data.auto_check_result;
      expect(stored).toMatchObject({
        result: 'manual_review',
        reason: 'provider_error',
        lookupProvider: 'auto',
        checkedAt: expect.any(String) as unknown,
      });
      expect(stored).toHaveProperty('sourceUrl');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('RegistryCheckQueue', () => {
  const config = { get: () => undefined } as unknown as ConfigService;

  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: jest.fn((k: string, v: string, ...args: unknown[]) => {
        if (args.includes('NX') && store.has(k)) return Promise.resolve(null);
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      del: jest.fn((...keys: string[]) => {
        keys.flat().forEach((k) => store.delete(k));
        return Promise.resolve(1);
      }),
    };
  }

  it('a second click while a lookup runs gets the same check; the card sees it as pending', async () => {
    const redis = fakeRedis();
    const queue = new RegistryCheckQueue(config, logger, redis as never);
    const run = jest.fn().mockResolvedValue(undefined);
    const input = {
      licenseId: 'lic-1',
      kind: 'registry' as const,
      adminId: admin.id,
      adminIp: null,
    };

    const first = await queue.enqueue(input, run);
    const second = await queue.enqueue(input, run);

    expect(second.checkId).toBe(first.checkId);
    const pending = await queue.pending(['lic-1', 'lic-2']);
    expect([...pending.keys()]).toEqual(['lic-1']);
    expect(pending.get('lic-1')?.checkId).toBe(first.checkId);
    // No BullMQ queue in this process: the job still runs, off the request.
    await new Promise((r) => setImmediate(r));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
