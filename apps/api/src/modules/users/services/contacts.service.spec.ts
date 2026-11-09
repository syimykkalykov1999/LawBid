import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { ContactsService } from './contacts.service';

/** Owner rule (memory sms-two-cases): the phone is changed with the password
 * / passkey (POST /users/me/phone), never with an SMS code. */
function setup(opts: { previous?: string | null; allowed?: boolean } = {}) {
  const previous = opts.previous === undefined ? '+14155550100' : opts.previous;
  const tx = {
    user: { update: jest.fn().mockResolvedValue({}) },
    userIdentifier: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        phone_e164: previous,
        phone_verified_at: previous ? new Date() : null,
        email: 'me@example.com',
        email_verified_at: new Date(),
      }),
    },
    userIdentifier: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const otp = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    assertSmsDestinationAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const identity = {
    linkIdentifier: jest.fn().mockResolvedValue({ linked: true }),
  };
  const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const allowed = opts.allowed ?? true;
  const rateLimit = {
    consumeFixedWindow: jest.fn().mockResolvedValue({
      allowed,
      retryAfterSeconds: allowed ? 0 : 120,
      remaining: 0,
    }),
    consumeSlidingWindow: jest.fn(),
    hashIdentifier: (v: string) => v,
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(3) };
  const signInChange = { notify: jest.fn().mockResolvedValue(undefined) };
  const revocation = {
    revokeOtherChainsForUser: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ContactsService(
    prisma as never,
    otp as never,
    identity as never,
    authEvents as never,
    rateLimit as never,
    config as never,
    undefined,
    signInChange as never,
    revocation as never,
  );
  return { service, otp, identity, tx, rateLimit, signInChange, revocation };
}

const NEW = '+14155550199';

describe('ContactsService — phone without an SMS code', () => {
  it('contacts/request for a phone is refused and sends nothing', async () => {
    const { service, otp } = setup();
    const err = await service
      .requestVerification('u1', 'phone', NEW)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(otp.requestOtp).not.toHaveBeenCalled();
  });

  it('contacts/verify for a phone is refused (no code exists)', async () => {
    const { service, otp } = setup();
    await expect(
      service.verify('u1', 'phone', NEW, '000000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(otp.verifyOtp).not.toHaveBeenCalled();
  });

  it('changePhone replaces the number: old one stops signing in, other sessions end, user told — no SMS', async () => {
    const { service, otp, identity, tx, signInChange, revocation } = setup();
    await service.changePhone('u1', ` ${NEW} `, 'sid-1');
    expect(otp.assertSmsDestinationAllowed).toHaveBeenCalledWith(NEW);
    expect(otp.requestOtp).not.toHaveBeenCalled();
    expect(identity.linkIdentifier).toHaveBeenCalledWith('u1', 'phone', NEW);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          phone_e164: NEW,
          phone_verified_at: expect.any(Date),
          contacts_announced_at: null,
        }),
      }),
    );
    expect(tx.userIdentifier.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', provider: 'phone', provider_uid: '+14155550100' },
    });
    expect(revocation.revokeOtherChainsForUser).toHaveBeenCalledWith(
      'u1',
      'sid-1',
      'credentials_changed',
    );
    expect(signInChange.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', kind: 'phone' }),
    );
  });

  it('changePhone adds a first phone without deleting anything', async () => {
    const { service, tx } = setup({ previous: null });
    await service.changePhone('u1', NEW, 'sid-1');
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.userIdentifier.deleteMany).not.toHaveBeenCalled();
  });

  it('a number of another account is refused', async () => {
    const { service, identity, tx } = setup();
    identity.linkIdentifier.mockResolvedValue({
      linked: false,
      reason: 'already_linked_elsewhere',
    });
    const err = await service
      .changePhone('u1', NEW, 'sid-1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.CONTACT_ALREADY_EXISTS,
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('an unsupported number is refused before anything changes', async () => {
    const { service, otp, identity } = setup();
    otp.assertSmsDestinationAllowed.mockRejectedValue(
      new HttpException(
        { code: ErrorCode.PHONE_COUNTRY_NOT_SUPPORTED },
        HttpStatus.BAD_REQUEST,
      ),
    );
    await expect(service.changePhone('u1', NEW)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(identity.linkIdentifier).not.toHaveBeenCalled();
  });

  it('too many changes → 429 RATE_LIMITED, nothing changes', async () => {
    const { service, identity } = setup({ allowed: false });
    const err = await service.changePhone('u1', NEW).catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
    });
    expect(identity.linkIdentifier).not.toHaveBeenCalled();
  });
});
