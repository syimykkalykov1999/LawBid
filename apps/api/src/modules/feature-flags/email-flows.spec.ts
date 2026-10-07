import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { FirmEmailService } from '../attorney-trust/firm-email.service';
import { EmailLoginNotificationChannel } from '../auth/notifications/email-login-notification.channel';
import { ContactsService } from '../users/services/contacts.service';
import { CountriesController } from '../countries/countries.controller';
import {
  EMAIL_FLOWS_FLAG,
  assertEmailFlowsOn,
  emailFlowsOn,
} from './email-flows';
import type { FeatureFlagsService } from './services/feature-flags.service';

/** Owner 2026-10-07: admin «Вход и письма по почте» — one switch for every
 * user-facing e-mail flow. */
function flagsWith(value: boolean | undefined): FeatureFlagsService {
  return {
    isEnabled: jest.fn((key: string, def: boolean) =>
      Promise.resolve(
        key === EMAIL_FLOWS_FLAG && value !== undefined ? value : def,
      ),
    ),
  } as unknown as FeatureFlagsService;
}

async function expectEmailOff(p: Promise<unknown>): Promise<void> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({
    code: ErrorCode.FEATURE_DISABLED,
    details: { feature: EMAIL_FLOWS_FLAG },
  });
}

describe('email flows switch', () => {
  it('reads the existing email_login flag; a missing row counts as on', async () => {
    expect(EMAIL_FLOWS_FLAG).toBe('email_login');
    await expect(emailFlowsOn(flagsWith(undefined))).resolves.toBe(true);
    await expect(emailFlowsOn(undefined)).resolves.toBe(true);
    await expect(emailFlowsOn(flagsWith(false))).resolves.toBe(false);
    await expectEmailOff(assertEmailFlowsOn(flagsWith(false)));
    await expect(assertEmailFlowsOn(flagsWith(true))).resolves.toBeUndefined();
  });

  it('adding / changing the account e-mail is refused when off; the phone is not', async () => {
    const otp = { requestOtp: jest.fn() };
    const contacts = new ContactsService(
      {} as never,
      otp as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      flagsWith(false),
    );
    await expectEmailOff(
      contacts.requestVerification('u1', 'email', 'a@example.com'),
    );
    expect(otp.requestOtp).not.toHaveBeenCalled();
  });

  it('the firm e-mail code is refused when off and nothing is sent', async () => {
    const email = { sendEmail: jest.fn() };
    const redis = { incr: jest.fn(), expire: jest.fn(), set: jest.fn() };
    const svc = new FirmEmailService(
      {} as never,
      redis as never,
      email,
      { info: jest.fn() } as never,
      flagsWith(false),
    );
    await expectEmailOff(svc.request('a1', 'me@smithlaw.com', 'en'));
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('the new-device e-mail is skipped when off', async () => {
    const email = { sendEmail: jest.fn() };
    const costGuard = { consume: jest.fn() };
    const channel = new EmailLoginNotificationChannel(
      email,
      costGuard as never,
      { get: () => undefined } as never,
      flagsWith(false),
    );
    await expect(
      channel.notifyNewDevice({
        userId: 'u1',
        verifiedEmail: 'a@example.com',
        deviceId: 'd1',
        at: new Date(),
      }),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'email_off' });
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(costGuard.consume).not.toHaveBeenCalled();
  });

  it('the country waiting list is refused when off', async () => {
    const countries = { joinWaitlist: jest.fn() };
    const ctrl = new CountriesController(countries as never, flagsWith(false));
    await expectEmailOff(
      ctrl.joinCountryWaitlist({
        countryCode: 'DE',
        email: 'a@example.com',
        locale: 'en',
      }),
    );
    expect(countries.joinWaitlist).not.toHaveBeenCalled();
  });
});
