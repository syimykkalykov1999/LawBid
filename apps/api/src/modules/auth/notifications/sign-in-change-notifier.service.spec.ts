import { SignInChangeNotifier } from './sign-in-change-notifier.service';

/** Owner 2026-10-22 (security audit #3, finding 2). */
function make(opts: { ageMs?: number; budget?: boolean; emailOn?: boolean }) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        created_at: new Date(Date.now() - (opts.ageMs ?? 86_400_000)),
      }),
    },
  };
  const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const costGuard = {
    consume: jest.fn(
      opts.budget === false
        ? () => Promise.reject(new Error('budget'))
        : () => Promise.resolve(),
    ),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const flags = {
    isEnabled: jest.fn().mockResolvedValue(opts.emailOn ?? true),
    isOn: jest.fn().mockResolvedValue(opts.emailOn ?? true),
  };
  const notifier = new SignInChangeNotifier(
    prisma as never,
    notifications as never,
    email,
    costGuard as never,
    logger as never,
    config as never,
    opts.emailOn === undefined ? undefined : (flags as never),
  );
  return { notifier, notifications, email, logger };
}

describe('SignInChangeNotifier', () => {
  it('pushes to every device and mails the PREVIOUS e-mail', async () => {
    const { notifier, notifications, email } = make({});
    await notifier.notify({
      userId: 'u1',
      kind: 'email',
      previousEmail: 'old@example.com',
    });
    expect(notifications.emit).toHaveBeenCalledWith({
      type: 'security_sign_in_changed',
      recipientId: 'u1',
      payload: { kind: 'email' },
    });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const msg = email.sendEmail.mock.calls[0][0] as {
      to: string;
      text: string;
    };
    expect(msg.to).toBe('old@example.com');
    expect(msg.text).toContain('The e-mail address of your account');
  });

  it('a brand-new account (its own sign-up) is not told anything', async () => {
    const { notifier, notifications, email } = make({ ageMs: 60_000 });
    await notifier.notify({
      userId: 'u1',
      kind: 'password',
      previousEmail: 'old@example.com',
    });
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('no previous e-mail or no budget: the push still goes, nothing throws', async () => {
    const a = make({});
    await a.notifier.notify({
      userId: 'u1',
      kind: 'phone',
      previousEmail: null,
    });
    expect(a.notifications.emit).toHaveBeenCalledTimes(1);
    expect(a.email.sendEmail).not.toHaveBeenCalled();

    const b = make({ budget: false });
    await b.notifier.notify({
      userId: 'u1',
      kind: 'google',
      previousEmail: 'old@example.com',
    });
    expect(b.notifications.emit).toHaveBeenCalledTimes(1);
    expect(b.email.sendEmail).not.toHaveBeenCalled();
  });

  it('a delivery failure never breaks the change itself', async () => {
    const { notifier, notifications, logger } = make({});
    notifications.emit.mockRejectedValue(new Error('down'));
    await expect(
      notifier.notify({ userId: 'u1', kind: 'apple', previousEmail: null }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
