import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { PersonaClient } from '../providers/persona.client';
import {
  parsePersonaEvent,
  PersonaVerificationService,
} from './persona-verification.service';
import type { VerificationChecksService } from './verification-checks.service';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;
const CFG = {
  apiKey: 'persona_sandbox_test-token',
  templateId: 'itmpl_T1',
  webhookSecret: 'test-persona-webhook-secret',
};
const REQ = { id: 'r1', attorney_id: 'a1', provider_ref: null };

function setup(opts: {
  cfg?: typeof CFG | null;
  consume?: () => Promise<void>;
  request?: { id: string; status: string } | null;
  seen?: boolean;
}) {
  const persona = {
    config: jest
      .fn()
      .mockResolvedValue(opts.cfg === undefined ? CFG : opts.cfg),
    createInquiry: jest.fn().mockResolvedValue({
      inquiryId: 'inq_1',
      url: 'https://inquiry.withpersona.com/verify?inquiry-id=inq_1',
    }),
    resumeInquiry: jest.fn().mockResolvedValue(null),
  };
  const prisma = {
    verificationRequest: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.request === undefined
            ? { id: 'r1', status: 'submitted' }
            : opts.request,
        ),
    },
    verificationCheck: {
      findFirst: jest.fn().mockResolvedValue(opts.seen ? { id: 'c1' } : null),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const checks = { approveIfRegistryPassed: jest.fn().mockResolvedValue(true) };
  const cost = { consume: jest.fn(opts.consume ?? (() => Promise.resolve())) };
  const svc = new PersonaVerificationService(
    prisma as unknown as PrismaService,
    persona as unknown as PersonaClient,
    checks as unknown as VerificationChecksService,
    logger,
    cost as unknown as CostGuardService,
  );
  return { svc, persona, prisma, checks, cost };
}

type Row = { check_type: string; result: string };
const rows = (prisma: {
  verificationCheck: { createMany: jest.Mock };
}): Row[] =>
  (prisma.verificationCheck.createMany.mock.calls[0] as [{ data: Row[] }])[0]
    .data;

const event = (name: string, referenceId: string | null = 'r1') => ({
  eventId: 'evt_1',
  name,
  inquiryId: 'inq_1',
  status: name.replace('inquiry.', ''),
  referenceId,
});

describe('PersonaVerificationService.start', () => {
  it('no key: 403 FEATURE_DISABLED, nothing spent', async () => {
    const { svc, cost } = setup({ cfg: null });
    const err = await svc.start(REQ, 'manual').catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(cost.consume).not.toHaveBeenCalled();
  });

  it('creates an inquiry, spends one id_check unit, stores the inquiry on the request', async () => {
    const { svc, prisma, cost, persona } = setup({});
    await expect(svc.start(REQ, 'manual')).resolves.toMatchObject({
      inquiryId: 'inq_1',
    });
    expect(cost.consume).toHaveBeenCalledWith('id_check', 1, { userId: 'a1' });
    expect(persona.createInquiry).toHaveBeenCalledWith(CFG, 'r1');
    expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { provider: 'persona', provider_ref: 'inq_1' },
    });
  });

  it('daily cap used up: 503 IDENTITY_PROVIDER_UNAVAILABLE, no inquiry', async () => {
    const { svc, persona } = setup({
      consume: () =>
        Promise.reject(
          new HttpException({ code: ErrorCode.PROVIDER_BUDGET_EXCEEDED }, 503),
        ),
    });
    const err = (await svc
      .start(REQ, 'manual')
      .catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(503);
    expect((err.getResponse() as { code: string }).code).toBe(
      ErrorCode.IDENTITY_PROVIDER_UNAVAILABLE,
    );
    expect(persona.createInquiry).not.toHaveBeenCalled();
  });
});

describe('PersonaVerificationService.handle', () => {
  it('approved: pass checks and an approval attempt for a submitted request', async () => {
    const { svc, prisma, checks } = setup({});
    await expect(svc.handle(event('inquiry.approved'))).resolves.toBe(
      'recorded',
    );
    expect(rows(prisma).map((r) => `${r.check_type}:${r.result}`)).toEqual([
      'id_check:pass',
      'face_match:pass',
    ]);
    expect(checks.approveIfRegistryPassed).toHaveBeenCalled();
  });

  it('declined: fail checks, never an automatic decision', async () => {
    const { svc, prisma, checks } = setup({});
    await svc.handle(event('inquiry.declined'));
    expect(rows(prisma)[0].result).toBe('fail');
    expect(checks.approveIfRegistryPassed).not.toHaveBeenCalled();
  });

  it('marked for review: manual_review', async () => {
    const { svc, prisma } = setup({});
    await svc.handle(event('inquiry.marked-for-review'));
    expect(rows(prisma)[0].result).toBe('manual_review');
  });

  it('ignores a repeated event, an unknown inquiry and a foreign reference id', async () => {
    expect(
      await setup({ seen: true }).svc.handle(event('inquiry.approved')),
    ).toBe('ignored');
    expect(
      await setup({ request: null }).svc.handle(event('inquiry.approved')),
    ).toBe('ignored');
    expect(await setup({}).svc.handle(event('inquiry.approved', 'other'))).toBe(
      'ignored',
    );
  });

  it('expired on a draft: the app may start a new inquiry', async () => {
    const { svc, prisma } = setup({ request: { id: 'r1', status: 'draft' } });
    await svc.handle(event('inquiry.expired'));
    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', provider_ref: 'inq_1' },
      data: { provider_ref: null },
    });
  });
});

it('parses the Persona event body (docs.withpersona.com/docs/webhooks)', () => {
  expect(
    parsePersonaEvent({
      data: {
        type: 'event',
        id: 'evt_X',
        attributes: {
          name: 'inquiry.approved',
          payload: {
            data: {
              type: 'inquiry',
              id: 'inq_Y',
              attributes: { status: 'approved', 'reference-id': 'r1' },
            },
          },
        },
      },
    }),
  ).toEqual({
    eventId: 'evt_X',
    name: 'inquiry.approved',
    inquiryId: 'inq_Y',
    status: 'approved',
    referenceId: 'r1',
  });
  expect(parsePersonaEvent({ data: {} })).toBeNull();
});
