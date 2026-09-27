/* eslint-disable @typescript-eslint/unbound-method -- jest.fn() members are
   only asserted on (toHaveBeenCalled...), never invoked unbound. */
import type { PinoLogger } from 'nestjs-pino';
import type { AuthEventService } from '../services/auth-event.service';
import type {
  LoginNotificationChannel,
  NewDeviceLoginNotice,
} from './login-notification-channel';
import {
  NewDeviceNotifier,
  type LoginContext,
} from './new-device-notifier.service';

function logger(): PinoLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

function channel(
  name: string,
  impl?: (n: NewDeviceLoginNotice) => Promise<never>,
) {
  const notifyNewDevice = jest.fn(
    impl ?? (() => Promise.resolve({ channel: name, status: 'sent' as const })),
  );
  return { name, notifyNewDevice } as unknown as LoginNotificationChannel & {
    notifyNewDevice: jest.Mock;
  };
}

const baseCtx: LoginContext = {
  user: {
    id: 'user-1',
    email: 'u@example.com',
    email_verified_at: new Date(),
  },
  isNewUser: false,
  isNewDevice: true,
  device: { deviceId: 'dev-9', deviceName: 'Pixel', platform: 'android' },
  meta: { ip: '10.0.0.1', userAgent: 'ua' },
};

describe('NewDeviceNotifier', () => {
  it('records new_device and notifies every channel for an existing user on a new device', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const email = channel('email');
    const push = channel('push');
    const notifier = new NewDeviceNotifier(
      [email, push],
      { record } as unknown as AuthEventService,
      logger(),
    );

    await notifier.onLogin(baseCtx);
    await notifier.drain();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'new_device',
        success: true,
        deviceId: 'dev-9',
      }),
    );
    const notice = email.notifyNewDevice.mock
      .calls[0][0] as NewDeviceLoginNotice;
    expect(notice).toMatchObject({
      userId: 'user-1',
      verifiedEmail: 'u@example.com',
      deviceName: 'Pixel',
    });
    expect(push.notifyNewDevice).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a brand-new user', { isNewUser: true }],
    ['a known device', { isNewDevice: false }],
    ['a login without deviceId', { device: {} }],
  ])('does nothing for %s', async (_, patch) => {
    const record = jest.fn();
    const email = channel('email');
    const notifier = new NewDeviceNotifier(
      [email],
      { record } as unknown as AuthEventService,
      logger(),
    );
    await notifier.onLogin({ ...baseCtx, ...patch });
    await notifier.drain();
    expect(record).not.toHaveBeenCalled();
    expect(email.notifyNewDevice).not.toHaveBeenCalled();
  });

  it('passes no email for an unverified address', async () => {
    const email = channel('email');
    const notifier = new NewDeviceNotifier(
      [email],
      { record: jest.fn() } as unknown as AuthEventService,
      logger(),
    );
    await notifier.onLogin({
      ...baseCtx,
      user: { ...baseCtx.user, email_verified_at: null },
    });
    await notifier.drain();
    expect(
      (email.notifyNewDevice.mock.calls[0][0] as NewDeviceLoginNotice)
        .verifiedEmail,
    ).toBeUndefined();
  });

  it('never throws into the login: audit and channel failures are swallowed', async () => {
    const failing = channel('email', () => Promise.reject(new Error('smtp')));
    const other = channel('push');
    const notifier = new NewDeviceNotifier(
      [failing, other],
      {
        record: jest.fn().mockRejectedValue(new Error('db')),
      } as unknown as AuthEventService,
      logger(),
    );
    await expect(notifier.onLogin(baseCtx)).resolves.toBeUndefined();
    await notifier.drain();
    expect(other.notifyNewDevice).toHaveBeenCalledTimes(1);
  });

  it('does not wait for delivery before returning', async () => {
    let release: () => void = () => undefined;
    const slow = channel(
      'email',
      () =>
        new Promise<never>((resolve) => {
          release = () => resolve(undefined as never);
        }),
    );
    const notifier = new NewDeviceNotifier(
      [slow],
      { record: jest.fn() } as unknown as AuthEventService,
      logger(),
    );
    await notifier.onLogin(baseCtx); // resolves while delivery is pending
    expect(slow.notifyNewDevice).toHaveBeenCalled();
    release();
    await notifier.drain();
  });
});
