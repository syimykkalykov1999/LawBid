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

function build(opts: { enabled?: boolean; stepUpTtl?: number } = {}) {
  const cred: {
    user_id: string;
    totp_secret_enc: string;
    totp_enabled_at: Date | null;
    recovery_codes_hash: string[];
    password_hash: string;
  } = {
    user_id: 'u1',
    totp_secret_enc: cipher.encrypt('JBSWY3DPEHPK3PXP', 'u1'),
    totp_enabled_at: opts.enabled ? new Date() : null,
    recovery_codes_hash: [],
    password_hash: 'x',
  };
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const redis = {
    set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    exists: jest.fn((k: string) => Promise.resolve(store.has(k) ? 1 : 0)),
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    ttl: jest.fn((k: string) =>
      Promise.resolve(store.has(k) ? (ttls.get(k) ?? 1) : -2),
    ),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
    expire: jest.fn((k: string, sec: number) => {
      ttls.set(k, sec);
      return Promise.resolve(store.has(k) ? 1 : 0);
    }),
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
    // One atomic statement (array_remove … WHERE hash = ANY(…)), the way
    // PostgreSQL runs it: two parallel removals never resurrect a code.
    $queryRaw: jest.fn((_s: TemplateStringsArray, ...v: unknown[]) => {
      const hash = v.find(
        (x) => typeof x === 'string' && cred.recovery_codes_hash.includes(x),
      ) as string | undefined;
      if (!hash) return Promise.resolve([]);
      cred.recovery_codes_hash = cred.recovery_codes_hash.filter(
        (h) => h !== hash,
      );
      return Promise.resolve([{ left: cred.recovery_codes_hash.length }]);
    }),
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
    resetFixedWindow: jest.fn().mockResolvedValue(undefined),
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
    opts.stepUpTtl === undefined
      ? undefined
      : ({
          number: jest.fn((k: string) =>
            Promise.resolve(
              k === 'admin.step_up_ttl_seconds' ? opts.stepUpTtl : 0,
            ),
          ),
        } as never),
  );
  // A live ticket, as loginPassword leaves it.
  store.set('adm:ticket:j1', '0');
  return { svc, cred, store, ttls, prisma, sessions, audit, redis, rateLimit };
}

describe('forced authenticator setup at sign-in', () => {
  it('QR step → first code: switched on, 10 recovery codes, then a session', async () => {
    const { svc, cred, sessions, audit, store } = build();
    const setup = await svc.totpSetupBegin('ticket-jwt');
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(cipher.decrypt(cred.totp_secret_enc, 'u1')).toBe(setup.secret);

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

  it('owner 12.11: only wrong codes count; a good code clears the attempt counter', async () => {
    const { svc, rateLimit } = build({ enabled: true });
    await expect(svc.stepUp('u1', 'sess-1', '000000')).rejects.toBeDefined();
    expect(rateLimit.resetFixedWindow).not.toHaveBeenCalled();
    await svc.stepUp('u1', 'sess-1', totpCode('JBSWY3DPEHPK3PXP'));
    expect(rateLimit.resetFixedWindow).toHaveBeenCalledWith([
      'admin-stepup',
      'u1',
    ]);
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

describe('owner 14.11 (row 179, B8): the step-up window is an owner setting', () => {
  it('admin.step_up_ttl_seconds sets how long a code covers money actions', async () => {
    const { svc, redis } = build({ enabled: true, stepUpTtl: 900 });
    const r = await svc.stepUp('u1', 'sess-1', totpCode('JBSWY3DPEHPK3PXP'));
    expect(r.validForSeconds).toBe(900);
    expect(redis.set).toHaveBeenCalledWith(
      stepUpKey('sess-1'),
      expect.any(String),
      'EX',
      900,
    );
  });

  it('a fresh-step-up check counts the age of the code, whatever the window', async () => {
    const { svc, store } = build({ enabled: true, stepUpTtl: 900 });
    store.set(stepUpKey('old'), String(Date.now() - 200_000));
    store.set(stepUpKey('new'), String(Date.now() - 60_000));
    await expect(svc.assertFreshStepUp('old', 120)).rejects.toMatchObject({
      response: { code: 'ADMIN_STEP_UP_REQUIRED' },
    });
    await expect(svc.assertFreshStepUp('new', 120)).resolves.toBeUndefined();
    await expect(svc.assertFreshStepUp('none', 120)).rejects.toMatchObject({
      response: { code: 'ADMIN_STEP_UP_REQUIRED' },
    });
  });

  it('rolling deploy: a step-up an older task wrote (value 1, 5-min key) still counts by its TTL', async () => {
    const { svc, store, ttls } = build({ enabled: true, stepUpTtl: 900 });
    // Written 50 s ago by the old code: SET '1' EX 300 → 250 s left.
    store.set(stepUpKey('legacy-new'), '1');
    ttls.set(stepUpKey('legacy-new'), 250);
    await expect(
      svc.assertFreshStepUp('legacy-new', 120),
    ).resolves.toBeUndefined();
    // Written 200 s ago: older than the 120 s the reveal allows.
    store.set(stepUpKey('legacy-old'), '1');
    ttls.set(stepUpKey('legacy-old'), 100);
    await expect(
      svc.assertFreshStepUp('legacy-old', 120),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_STEP_UP_REQUIRED' } });
  });

  it('without the settings service the window stays 5 minutes', async () => {
    const { svc } = build({ enabled: true });
    const r = await svc.stepUp('u1', 'sess-1', totpCode('JBSWY3DPEHPK3PXP'));
    expect(r.validForSeconds).toBe(300);
  });
});

describe('verify batch 11: the 5-try budget of a sign-in ticket', () => {
  it('A1: parallel wrong codes try at most 5 and never revive the ticket', async () => {
    const { svc, store } = build({ enabled: true });
    const out = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        svc.totpVerify('ticket-jwt', '000000', null),
      ),
    );
    const codes = out.map((r) =>
      r.status === 'rejected'
        ? (r.reason as { response: { code: string } }).response.code
        : 'ok',
    );
    // 4 wrong answers say "try again"; the 5th and every later one end it.
    expect(codes.filter((c) => c === 'ADMIN_TOTP_INVALID')).toHaveLength(4);
    expect(codes.filter((c) => c === 'ADMIN_TICKET_INVALID')).toHaveLength(6);
    expect(store.has('adm:ticket:j1')).toBe(false);
    await expect(
      svc.totpVerify('ticket-jwt', '000000', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_TICKET_INVALID' } });
    expect(store.has('adm:ticket:j1')).toBe(false);
  });

  it('A1: a slow try that lands after the burn does not bring the ticket back', async () => {
    const { svc, store, prisma } = build({ enabled: true });
    const real = prisma.user.findUnique.getMockImplementation() as (
      ...a: unknown[]
    ) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    prisma.user.findUnique.mockImplementationOnce(async (...a: unknown[]) => {
      await gate;
      return real(...a);
    });
    // The slow request has already seen a live ticket…
    const slow = svc.totpVerify('ticket-jwt', '000000', null);
    // …while five wrong codes burn it.
    for (let i = 0; i < 5; i++) {
      await svc.totpVerify('ticket-jwt', '000000', null).catch(() => undefined);
    }
    expect(store.has('adm:ticket:j1')).toBe(false);
    release();
    await expect(slow).rejects.toMatchObject({
      response: { code: 'ADMIN_TICKET_INVALID' },
    });
    expect(store.has('adm:ticket:j1')).toBe(false);
    await expect(
      svc.totpVerify('ticket-jwt', '000000', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_TICKET_INVALID' } });
  });

  it('A1: the try counter expires with the ticket', async () => {
    const { svc, ttls } = build({ enabled: true });
    await expect(
      svc.totpVerify('ticket-jwt', '000000', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_TOTP_INVALID' } });
    expect([...ttls.values()].some((t) => t > 0)).toBe(true);
  });

  it('A2: two different recovery codes used at once are both gone', async () => {
    const { svc, cred, store } = build({ enabled: true });
    cred.recovery_codes_hash = ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'].map(
      hashRecoveryCode,
    );
    // Two sign-in tickets (two windows), each with its own code.
    store.set('adm:ticket:j2', '0');
    const tokens = (
      svc as unknown as { tokens: { verifyAdminTicket: jest.Mock } }
    ).tokens;
    tokens.verifyAdminTicket.mockImplementation((t: string) => ({
      sub: 'u1',
      jti: t === 't2' ? 'j2' : 'j1',
    }));
    await Promise.all([
      svc.recovery('t1', 'AAAA-BBBB', null),
      svc.recovery('t2', 'CCCC-DDDD', null),
    ]);
    expect(cred.recovery_codes_hash).toEqual([hashRecoveryCode('EEEE-FFFF')]);
  });
});

describe('verify batch 11 (A8): a password change ends the sign-in tickets issued before it', () => {
  it('a setup ticket from before a password reset cannot bind an authenticator', async () => {
    const { svc, cred, store } = build();
    // The ticket was issued a minute ago…
    store.set('adm:ticket:j1', String(Date.now() - 60_000));
    // …then the manager set a new password.
    Object.assign(cred, { password_changed_at: new Date() });
    await expect(svc.totpSetupBegin('ticket-jwt')).rejects.toMatchObject({
      response: { code: 'ADMIN_TICKET_INVALID' },
    });
  });

  it('a ticket issued after the change works', async () => {
    const { svc, cred, store } = build();
    Object.assign(cred, { password_changed_at: new Date(Date.now() - 60_000) });
    store.set('adm:ticket:j1', String(Date.now()));
    await expect(svc.totpSetupBegin('ticket-jwt')).resolves.toBeDefined();
  });
});
