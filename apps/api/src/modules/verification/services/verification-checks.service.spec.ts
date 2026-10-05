import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { VerificationProviderSelector } from '../providers/verification-provider.selector';
import type { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import {
  registryFlagFor,
  SELF_ATTESTED_NOTE,
  VerificationChecksService,
} from './verification-checks.service';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

function setup(opts: {
  barName: 'manual' | 'auto';
  idProvider: 'manual' | 'stripe_identity';
  verify?: () => Promise<unknown>;
  docs?: string[];
  lookupResult?: 'pass' | 'fail' | 'manual_review';
}) {
  const checkCreate = jest.fn().mockResolvedValue({});
  const licenseUpdate = jest.fn().mockResolvedValue({});
  const requestUpdate = jest.fn().mockResolvedValue({});
  const licenseUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const profileUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const emit = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    verificationRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'r1',
        status: 'submitted',
        attorney_id: 'a1',
        documents: (opts.docs ?? ['passport', 'selfie']).map((doc_type) => ({
          doc_type,
        })),
        attorney: {
          user: { first_name: 'Kim', last_name: 'Wexler' },
          licenses: [{ id: 'l1', state_code: 'NY', bar_number: '1' }],
        },
      }),
      update: requestUpdate,
    },
    verificationCheck: { create: checkCreate },
    attorneyLicense: { update: licenseUpdate, updateMany: licenseUpdateMany },
    attorneyProfile: { updateMany: profileUpdateMany },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ first_name: 'Kim', last_name: 'Wexler' }),
    },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: unknown }).$transaction = (
    fn: (tx: PrismaService) => Promise<unknown>,
  ) => fn(prisma);
  const lookup = jest.fn().mockResolvedValue({
    result: opts.lookupResult ?? 'pass',
    details: { found: true },
  });
  const matchFace = jest
    .fn()
    .mockResolvedValue({ result: 'pass', details: {} });
  const selector = {
    // 'manual' = no state registry enabled for NY (owner 2026-10-05).
    barLookup: () =>
      Promise.resolve({
        name: 'auto',
        lookup,
        supports: () => Promise.resolve(opts.barName === 'auto'),
      }),
    idVerification: () =>
      Promise.resolve({
        provider: opts.idProvider,
        impl: {
          verify:
            opts.verify ??
            (() => Promise.resolve({ result: 'pass', details: {} })),
          matchFace,
        },
      }),
  } as unknown as VerificationProviderSelector;
  return {
    service: new VerificationChecksService(
      prisma,
      selector,
      { emit } as unknown as NotificationsService,
      { recompute: jest.fn() } as unknown as AttorneyTrustService,
      logger,
    ),
    checkCreate,
    licenseUpdateMany,
    emit,
    licenseUpdate,
    requestUpdate,
    lookup,
    matchFace,
  };
}

describe('VerificationChecksService (docs/03 §2.4)', () => {
  it('flags off: no automatic check is recorded', async () => {
    const s = setup({ barName: 'manual', idProvider: 'manual' });
    await s.service.runOnSubmit('r1');
    expect(s.lookup).not.toHaveBeenCalled();
    expect(s.checkCreate).not.toHaveBeenCalled();
  });

  it('auto bar check stores the result on the license and as a check', async () => {
    const s = setup({ barName: 'auto', idProvider: 'manual' });
    await s.service.runOnSubmit('r1');
    expect(s.licenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: {
          auto_check_result: expect.objectContaining({
            result: 'pass',
            found: true,
          }) as unknown,
        },
      }),
    );
    expect(s.checkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        request_id: 'r1',
        check_type: 'bar_lookup',
        result: 'pass',
      }) as unknown,
    });
  });

  it('an exhausted id_check budget is recorded as manual_review, never thrown', async () => {
    const s = setup({
      barName: 'manual',
      idProvider: 'stripe_identity',
      verify: () =>
        Promise.reject(
          new HttpException(
            { code: ErrorCode.PROVIDER_BUDGET_EXCEEDED },
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
        ),
    });
    await s.service.runOnSubmit('r1');
    const rows = s.checkCreate.mock.calls.map(
      (
        c: [{ data: { check_type: string; result: string; details: unknown } }],
      ) => c[0].data,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        check_type: 'id_check',
        provider: 'stripe_identity',
        result: 'manual_review',
        details: { provider: 'stripe_identity', reason: 'budget_exceeded' },
      }),
      expect.objectContaining({
        check_type: 'face_match',
        result: 'manual_review',
      }),
    ]);
    expect(s.matchFace).not.toHaveBeenCalled();
  });

  it('no identity document (verified attorney adding a state) → no ID check', async () => {
    const s = setup({
      barName: 'manual',
      idProvider: 'stripe_identity',
      docs: ['bar_license'],
    });
    await s.service.runOnSubmit('r1');
    expect(s.checkCreate).not.toHaveBeenCalled();
    expect(s.requestUpdate).not.toHaveBeenCalled();
  });

  describe('auto-approval (owner 2026-10-04, "только номер")', () => {
    it('registry match and no ID documents → approved without a verifier', async () => {
      const s = setup({ barName: 'auto', idProvider: 'manual', docs: [] });
      await s.service.runOnSubmit('r1');
      expect(s.licenseUpdateMany).toHaveBeenCalledWith({
        where: { attorney_id: 'a1', license_status: 'pending' },
        data: expect.objectContaining({
          license_status: 'verified',
        }) as unknown,
      });
      expect(s.requestUpdate).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ status: 'approved' }) as unknown,
      });
      expect(s.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'verification_update',
          payload: expect.objectContaining({ kind: 'approved' }) as unknown,
        }),
        expect.anything(),
      );
    });

    it.each(['fail', 'manual_review'] as const)(
      'registry %s → stays in the queue',
      async (lookupResult) => {
        const s = setup({
          barName: 'auto',
          idProvider: 'manual',
          docs: [],
          lookupResult,
        });
        await s.service.runOnSubmit('r1');
        expect(s.licenseUpdateMany).not.toHaveBeenCalled();
        expect(s.emit).not.toHaveBeenCalled();
      },
    );

    it('ID documents nobody checked automatically → stays in the queue', async () => {
      const s = setup({ barName: 'auto', idProvider: 'manual' });
      await s.service.runOnSubmit('r1');
      expect(s.licenseUpdateMany).not.toHaveBeenCalled();
    });

    it('registry match + passed ID check → approved', async () => {
      const s = setup({ barName: 'auto', idProvider: 'stripe_identity' });
      await s.service.runOnSubmit('r1');
      expect(s.licenseUpdateMany).toHaveBeenCalled();
    });
  });

  describe('self-attestation + state registry (owner 2026-10-05)', () => {
    it('approves at once, then a matching registry clears the flag', async () => {
      const s = setup({ barName: 'auto', idProvider: 'manual' });
      await s.service.approveSelfAttested('r1');
      expect(s.requestUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'approved',
            admin_note: SELF_ATTESTED_NOTE,
          }) as unknown,
        }),
      );
      expect(s.lookup).toHaveBeenCalledTimes(1);
      expect(s.licenseUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'l1' },
          data: { registry_flag: null, registry_flagged_at: null },
        }),
      );
    });

    it('a registry difference flags the license, never rejects', async () => {
      const s = setup({
        barName: 'auto',
        idProvider: 'manual',
        lookupResult: 'fail',
      });
      await s.service.approveSelfAttested('r1');
      expect(s.licenseUpdateMany).toHaveBeenCalled();
      expect(s.licenseUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'l1' },
          data: {
            registry_flag: 'not_found',
            registry_flagged_at: expect.any(Date) as unknown,
          },
        }),
      );
    });

    it('a state without a registry: approved, nothing looked up', async () => {
      const s = setup({ barName: 'manual', idProvider: 'manual' });
      await s.service.approveSelfAttested('r1');
      expect(s.licenseUpdateMany).toHaveBeenCalled();
      expect(s.lookup).not.toHaveBeenCalled();
    });

    it.each([
      [{ result: 'pass', details: {} }, null],
      [{ result: 'fail', details: { reason: 'not_active' } }, 'not_active'],
      [{ result: 'fail', details: { reason: 'not_found' } }, 'not_found'],
      [
        { result: 'manual_review', details: { reason: 'name_mismatch' } },
        'name_mismatch',
      ],
      [
        { result: 'manual_review', details: { reason: 'provider_error' } },
        undefined,
      ],
    ] as const)('registryFlagFor(%j) → %s', (outcome, flag) => {
      expect(
        registryFlagFor({ result: outcome.result, details: outcome.details }),
      ).toBe(flag);
    });
  });
});
