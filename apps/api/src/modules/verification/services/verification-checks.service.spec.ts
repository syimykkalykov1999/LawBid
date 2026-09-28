import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { VerificationProviderSelector } from '../providers/verification-provider.selector';
import { VerificationChecksService } from './verification-checks.service';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

function setup(opts: {
  barName: 'manual' | 'auto';
  idProvider: 'manual' | 'stripe_identity';
  verify?: () => Promise<unknown>;
  docs?: string[];
}) {
  const checkCreate = jest.fn().mockResolvedValue({});
  const licenseUpdate = jest.fn().mockResolvedValue({});
  const requestUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    verificationRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'r1',
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
    attorneyLicense: { update: licenseUpdate },
  } as unknown as PrismaService;
  const lookup = jest
    .fn()
    .mockResolvedValue({ result: 'pass', details: { found: true } });
  const matchFace = jest
    .fn()
    .mockResolvedValue({ result: 'pass', details: {} });
  const selector = {
    barLookup: () => Promise.resolve({ name: opts.barName, lookup }),
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
    service: new VerificationChecksService(prisma, selector, logger),
    checkCreate,
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
});
