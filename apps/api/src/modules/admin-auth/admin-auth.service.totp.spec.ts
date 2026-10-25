import {
  AdminAuthService,
  hashRecoveryCode,
  stepUpKey,
} from './admin-auth.service';
import { SecretCipher } from './secret-cipher';
import { totpCode } from './totp.util';

/**
 * Owner 2026-10-22 (system audit #2, item 1): the authenticator is
 * mandatory. An admin without one is forced through its setup after the
 * password, before any session; step-up is the authenticator code only.
 */
const KEY = 'k'.repeat(40);
const cipher = new SecretCipher(KEY);

function build(opts: { enabled?: boolean } = {}) {
  const cred: {
    user_id: string;
    totp_secret_enc: string;
    totp_enabled_at: Date | null;
    recovery_codes_hash: string[];
    password_hash: string;
  } = {
    user_id: 'u1',
    totp_secret_enc: cipher.encrypt('JBSWY3DPEHPK3PXP'),
    totp_enabled_at: opts.enabled ? new Date() : null,
    recovery_codes_hash: [],
    password_hash: 'x',
  };
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    exists: jest.fn((k: string) => Promise.resolve(store.has(k) ? 1 : 0)),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? '0') + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
  };
  const prisma = {
    country: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUnique: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: 'u1',
          email: 'boss@x.io',
          role: 'admin',
          status: 'active',
          deleted_at: null,
          admin_profile: { admin_role: 'support' },
          admin_credential: { ...cred },
        }),
      ),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'boss@x.io',
        admin_profile: { admin_role: 'support', permissions: {} },
        admin_credential: null,
      }),
    },
    adminCredential: {
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...cred })),
      upsert: jest.fn().mockImplementation(({ update }) => {
        Object.assign(cred, update);
        return Promise.resolve({});
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        if (where.totp_enabled_at === null && cred.totp_enabled_at) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(cred, data);
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const tokens = {
    signAdminTicket: jest.fn().mockReturnValue('ticket-jwt'),
    signAdminToken: jest.fn().mockReturnValue('admin-jwt'),
    verifyAdminTicket: jest.fn().mockReturnValue({ sub: 'u1', jti: 'j1' }),
  };
  const sessions = { create: jest.fn().mockResolvedValue(undefined) };
  const rateLimit = {
    hashIdentifier: (s: string) => `h:${s}`,
    consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: (k: string) => (k === 'ADMIN_TOTP_ENC_KEY' ? KEY : undefined),
    getOrThrow: () => 50,
  };
  const svc = new AdminAuthService(
    prisma as never,
    redis as never,
    tokens as never,
    sessions as never,
    rateLimit as never,
    audit as never,
    config as never,
  );
  // A live ticket, as loginPassword leaves it.
  store.set('adm:ticket:j1', '0');
  return { svc, cred, store, prisma, sessions, audit, redis };
}

describe('forced authenticator setup at sign-in', () => {
  it('QR step → first code: switched on, 10 recovery codes, then a session', async () => {
    const { svc, cred, sessions, audit, store } = build();
    const setup = await svc.totpSetupBegin('ticket-jwt');
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(cipher.decrypt(cred.totp_secret_enc)).toBe(setup.secret);

    const res = await svc.totpSetupFinish(
      'ticket-jwt',
      totpCode(setup.secret),
      '1.1.1.1',
    );
    expect(res.recoveryCodes).toHaveLength(10);
    expect(cred.totp_enabled_at).toBeInstanceOf(Date);
    expect(cred.recovery_codes_hash).toEqual(
      res.recoveryCodes.map(hashRecoveryCode),
    );
    expect(res.session.accessToken).toBe('admin-jwt');
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(store.has('adm:ticket:j1')).toBe(false); // spent
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.totp_enrolled' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.login',
        after: expect.objectContaining({ method: 'totp_setup' }),
      }),
    );
  });

  it('a wrong first code signs nobody in and counts the attempt', async () => {
    const { svc, cred, sessions } = build();
    await svc.totpSetupBegin('ticket-jwt');
    await expect(
      svc.totpSetupFinish('ticket-jwt', '000000', null),
    ).rejects.toMatchObject({
      response: {
        code: 'ADMIN_TOTP_INVALID',
        details: { remainingAttempts: 4 },
      },
    });
    expect(cred.totp_enabled_at).toBeNull();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('an admin who already has an authenticator cannot re-bind it with only a password ticket', async () => {
    const { svc, cred } = build({ enabled: true });
    const before = cred.totp_secret_enc;
    await expect(svc.totpSetupBegin('ticket-jwt')).rejects.toMatchObject({
      response: { code: 'ADMIN_TICKET_INVALID' },
    });
    await expect(
      svc.totpSetupFinish('ticket-jwt', '123456', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_TICKET_INVALID' } });
    expect(cred.totp_secret_enc).toBe(before);
  });

  it('the authenticator-code step refuses an admin who has none yet', async () => {
    const { svc, sessions } = build();
    await expect(
      svc.totpVerify('ticket-jwt', '123456', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_TICKET_INVALID' } });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('a dead ticket cannot start the setup', async () => {
    const { svc, store } = build();
    store.delete('adm:ticket:j1');
    await expect(svc.totpSetupBegin('ticket-jwt')).rejects.toMatchObject({
      response: { code: 'ADMIN_TICKET_INVALID' },
    });
  });
});

describe('step-up (authenticator code only, audited)', () => {
  it('a fresh code opens a 5-minute window for this session and is audited', async () => {
    const { svc, store, audit } = build({ enabled: true });
    const r = await svc.stepUp(
      'u1',
      'sess-1',
      totpCode('JBSWY3DPEHPK3PXP'),
      '2.2.2.2',
    );
    expect(r.validForSeconds).toBe(300);
    expect(store.has(stepUpKey('sess-1'))).toBe(true);
    await expect(svc.assertStepUp('sess-1')).resolves.toBeUndefined();
    await expect(svc.assertStepUp('sess-2')).rejects.toMatchObject({
      response: { code: 'ADMIN_STEP_UP_REQUIRED' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.step_up', ip: '2.2.2.2' }),
    );
  });

  it('a wrong code (or a password) is refused and audited as a failure', async () => {
    const { svc, store, audit } = build({ enabled: true });
    for (const bad of ['000000', 'Right-pass-2026', undefined]) {
      await expect(svc.stepUp('u1', 'sess-1', bad)).rejects.toMatchObject({
        response: { code: 'ADMIN_TOTP_INVALID' },
      });
    }
    expect(store.has(stepUpKey('sess-1'))).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.step_up_failed' }),
    );
  });

  it('the same code cannot be replayed for a second step-up', async () => {
    const { svc } = build({ enabled: true });
    const code = totpCode('JBSWY3DPEHPK3PXP');
    await svc.stepUp('u1', 'sess-1', code);
    await expect(svc.stepUp('u1', 'sess-2', code)).rejects.toMatchObject({
      response: { code: 'ADMIN_TOTP_INVALID' },
    });
  });

  it('without an authenticator there is no step-up at all', async () => {
    const { svc } = build();
    await expect(svc.stepUp('u1', 'sess-1', '123456')).rejects.toMatchObject({
      response: { code: 'ADMIN_TOTP_SETUP_REQUIRED' },
    });
  });
});
