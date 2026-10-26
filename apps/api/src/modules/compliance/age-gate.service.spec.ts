import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AgeGateService } from './age-gate.service';

function build(
  settings: Record<string, string | number | boolean>,
  existing = false,
) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    userIdentifier: {
      findUnique: jest
        .fn()
        .mockResolvedValue(existing ? { user_id: 'u1' } : null),
    },
    ageAttestation: { upsert },
  };
  const app = {
    string: jest.fn((k: string) => Promise.resolve(settings[k])),
    number: jest.fn((k: string) => Promise.resolve(settings[k])),
    boolean: jest.fn((k: string) => Promise.resolve(settings[k])),
  };
  const svc = new AgeGateService(prisma as never, app as never);
  return { svc, prisma, upsert };
}
const base = {
  'compliance.age_gate.mode': 'enforce',
  'compliance.age_gate.min_age': 18,
  'compliance.age_gate.text_version': 'age-18-v1',
  'compliance.age_gate.require_birth_date': false,
};
const ok = { confirmed: true, textVersion: 'age-18-v1' };

async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return ((e as ForbiddenException).getResponse() as { code: string }).code;
  }
}

describe('AgeGateService', () => {
  it('does nothing when off (today’s behaviour)', async () => {
    const { svc, prisma } = build({
      ...base,
      'compliance.age_gate.mode': 'off',
    });
    await svc.assertNewAccountAllowed(undefined);
    await svc.precheckOtp('phone', '+15551230000', undefined);
    expect(prisma.userIdentifier.findUnique).not.toHaveBeenCalled();
  });

  it('enforce: a new account without the box is refused', async () => {
    const { svc } = build(base);
    expect(await code(svc.assertNewAccountAllowed(undefined))).toBe(
      ErrorCode.AGE_ATTESTATION_REQUIRED,
    );
  });

  it('enforce: a child’s birth date gets AGE_UNDER_MINIMUM', async () => {
    const { svc } = build(base);
    expect(
      await code(
        svc.assertNewAccountAllowed(
          { ...ok, birthDate: '2015-01-01' },
          new Date('2026-10-25'),
        ),
      ),
    ).toBe(ErrorCode.AGE_UNDER_MINIMUM);
  });

  it('enforce: a ticked box passes', async () => {
    const { svc } = build(base);
    await expect(svc.assertNewAccountAllowed(ok)).resolves.toBeUndefined();
  });

  it('record: a missing box passes, a child still does not', async () => {
    const { svc } = build({ ...base, 'compliance.age_gate.mode': 'record' });
    await expect(
      svc.assertNewAccountAllowed(undefined),
    ).resolves.toBeUndefined();
    expect(
      await code(
        svc.assertNewAccountAllowed(
          { ...ok, birthDate: '2015-01-01' },
          new Date('2026-10-25'),
        ),
      ),
    ).toBe(ErrorCode.AGE_UNDER_MINIMUM);
  });

  it('precheck: an existing account is not a sign-up', async () => {
    const { svc } = build(base, true);
    await expect(
      svc.precheckOtp('phone', '+15551230000', undefined),
    ).resolves.toBeUndefined();
  });

  it('precheck: an unknown number needs the box', async () => {
    const { svc } = build(base, false);
    expect(
      await code(svc.precheckOtp('phone', '+15551230000', undefined)),
    ).toBe(ErrorCode.AGE_ATTESTATION_REQUIRED);
  });

  it('records the attestation with its wording version', async () => {
    const { svc, upsert } = build(base);
    await svc.record(
      { ageAttestation: { upsert } } as never,
      'u1',
      { ...ok, birthDate: '1990-02-03' },
      'otp',
      new Date('2026-10-25'),
    );
    const arg = upsert.mock.calls[0][0] as {
      create: {
        user_id: string;
        text_version: string;
        birth_date: Date;
        source: string;
      };
    };
    expect(arg.create).toMatchObject({
      user_id: 'u1',
      text_version: 'age-18-v1',
      source: 'otp',
    });
    expect(arg.create.birth_date.toISOString().slice(0, 10)).toBe('1990-02-03');
  });

  it('does not record when off or without input', async () => {
    const off = build({ ...base, 'compliance.age_gate.mode': 'off' });
    await off.svc.record(
      { ageAttestation: { upsert: off.upsert } } as never,
      'u1',
      ok,
      'otp',
    );
    const none = build(base);
    await none.svc.record(
      { ageAttestation: { upsert: none.upsert } } as never,
      'u1',
      undefined,
      'otp',
    );
    expect(off.upsert).not.toHaveBeenCalled();
    expect(none.upsert).not.toHaveBeenCalled();
  });
});
