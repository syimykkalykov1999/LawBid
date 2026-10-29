import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_PROVIDER } from '../src/modules/auth/providers/provider.tokens';
import type {
  EmailMessage,
  EmailProvider,
} from '../src/modules/auth/providers/email/email-provider.interface';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { NewDeviceNotifier } from '../src/modules/auth/notifications/new-device-notifier.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

/** Captures every email instead of dialing SMTP/SES. */
class RecordingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  sendEmail(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
  to(address: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }
}

const GOOGLE_AUDIENCE = '123456789012-e2etest.apps.googleusercontent.com';
const FIXED_CODE = '000000';

/**
 * Ledger leaf-1.2 G2 — docs/01 §10.3 (blocked accounts), §10.4 (refresh),
 * §10.2 E (email magic link), §10.6 (login flags, new-device alert), §10.2 G (social token nonce). Real PostgreSQL +
 * Redis (isolated per E2E_ISOLATION), only the outbound email provider,
 * Google's JWKS signature check are faked.
 */
describe('Auth hardening (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
  let notifier: NewDeviceNotifier;
  let redis: Redis;
  const email = new RecordingEmailProvider();
  let googlePayload: Record<string, unknown> = {};
  let verifyIdTokenSpy: jest.Mock;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_CLIENT_IDS = GOOGLE_AUDIENCE;
    process.env.AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR = '3';
    // X-Forwarded-For names the caller (the address-scoped tests below).
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.APP_LINK_BASE_URL = 'https://links.lawbid.test';

    // Signature/audience/expiry are google-auth-library's job (and need
    // Google's JWKS over the network); the nonce rule under test is ours.
    verifyIdTokenSpy = jest.spyOn(
      OAuth2Client.prototype,
      'verifyIdToken',
    ) as unknown as jest.Mock;
    verifyIdTokenSpy.mockImplementation(() =>
      Promise.resolve({
        getPayload: () => googlePayload,
      } as unknown as LoginTicket),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(email)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    // One real listener for the suite: supertest reuses a listening
    // server instead of an ephemeral one per request, which avoided
    // intermittent ECONNRESET under load.
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    flags = app.get(FeatureFlagsService);
    notifier = app.get(NewDeviceNotifier);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const api = () => request(app.getHttpServer());

  async function setFlag(key: string, enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
    await flags.invalidate();
  }

  async function clearFlag(key: string): Promise<void> {
    await prisma.featureFlag.deleteMany({ where: { key } });
    await flags.invalidate();
  }

  async function otpLogin(
    channel: 'phone' | 'email',
    identifier: string,
    deviceId: string,
    deviceName = 'Test phone',
  ) {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel, identifier })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel,
        identifier,
        code: FIXED_CODE,
        deviceInfo: { deviceId, deviceName, platform: 'ios' },
      });
    // Owner 2026-10-01: another phone signed in → confirm to continue.
    if (res.status === 409) {
      expect(res.body.error.code).toBe('AUTH_OTHER_DEVICE_ACTIVE');
      const cont = await api()
        .post('/api/v1/auth/login/continue')
        .send({ pendingToken: res.body.error.details.pendingToken });
      expect(cont.status).toBe(201);
      return cont.body.data as {
        accessToken: string;
        refreshToken: string;
        isNewUser: boolean;
      };
    }
    expect(res.status).toBe(201);
    return res.body.data as {
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
    };
  }

  async function userIdFor(
    provider: 'phone' | 'email',
    uid: string,
  ): Promise<string> {
    const row = await prisma.userIdentifier.findUniqueOrThrow({
      where: { provider_provider_uid: { provider, provider_uid: uid } },
    });
    return row.user_id;
  }

  // -------------------------------------------------------------------
  describe('refresh for blocked accounts (docs/01 §10.3)', () => {
    it.each([
      [
        'suspended',
        'ACCOUNT_SUSPENDED',
        'admin_block',
        'login_blocked_suspended',
      ],
      [
        'deleted',
        'ACCOUNT_DELETED',
        'account_deletion',
        'login_blocked_deleted',
      ],
    ] as const)(
      'a %s user cannot refresh; the chain is revoked',
      async (status, code, revokedReason, eventType) => {
        const phone = status === 'suspended' ? '+12025558101' : '+12025558102';
        const tokens = await otpLogin('phone', phone, `dev-${status}`);
        const userId = await userIdFor('phone', phone);
        await prisma.user.update({ where: { id: userId }, data: { status } });

        const res = await api()
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: tokens.refreshToken });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(code);

        const live = await prisma.session.count({
          where: { user_id: userId, revoked_at: null },
        });
        expect(live).toBe(0);
        const revoked = await prisma.session.findFirstOrThrow({
          where: { user_id: userId },
        });
        expect(revoked.revoked_reason).toBe(revokedReason);
        const event = await prisma.authEvent.findFirst({
          where: { user_id: userId, event_type: eventType },
        });
        expect(event?.meta).toMatchObject({ via: 'refresh' });

        // The access token of that chain is dead too (blacklist).
        await api()
          .get('/api/v1/auth/sessions')
          .set('Authorization', `Bearer ${tokens.accessToken}`)
          .expect(401);
      },
    );
  });

  // -------------------------------------------------------------------
  describe('per-session-chain refresh limit', () => {
    it('caps rotations per chain (limit 3/h here) without affecting other chains', async () => {
      const phone = '+12025558201';
      let { refreshToken } = await otpLogin('phone', phone, 'dev-chain-a');
      for (let i = 0; i < 3; i += 1) {
        const ok = await api()
          .post('/api/v1/auth/refresh')
          .send({ refreshToken, deviceInfo: { deviceId: 'dev-chain-a' } });
        expect(ok.status).toBe(201);
        refreshToken = ok.body.data.refreshToken as string;
      }
      const limited = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, deviceInfo: { deviceId: 'dev-chain-a' } });
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

      // Not reuse: the limited token was never rotated, chain is intact.
      const userId = await userIdFor('phone', phone);
      expect(
        await prisma.session.count({
          where: { user_id: userId, revoked_at: null },
        }),
      ).toBe(1);

      // A second device (its own chain) still refreshes.
      const other = await otpLogin('phone', phone, 'dev-chain-b');
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(201);
    });
  });

  // -------------------------------------------------------------------
  describe('login-method flags enforced server-side', () => {
    afterAll(async () => {
      for (const k of ['phone_login', 'email_login', 'google_login']) {
        await clearFlag(k);
      }
    });

    it('phone_login=false rejects otp/request and otp/verify with AUTH_PROVIDER_DISABLED; email keeps working', async () => {
      await setFlag('phone_login', false);
      const req = await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: '+12025558301' });
      expect(req.status).toBe(403);
      expect(req.body.error.code).toBe('AUTH_PROVIDER_DISABLED');

      const verify = await api().post('/api/v1/auth/otp/verify').send({
        channel: 'phone',
        identifier: '+12025558301',
        code: FIXED_CODE,
      });
      expect(verify.status).toBe(403);
      expect(verify.body.error.code).toBe('AUTH_PROVIDER_DISABLED');

      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', identifier: 'flags-ok@example.com' })
        .expect(200);

      await setFlag('phone_login', true);
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: '+12025558301' })
        .expect(200);
    });

    it('email_login=false rejects the email channel', async () => {
      await setFlag('email_login', false);
      const res = await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', identifier: 'flags-off@example.com' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_PROVIDER_DISABLED');
      expect(email.to('flags-off@example.com')).toHaveLength(0);
    });

    it('google_login=false rejects /auth/social before the token is even verified', async () => {
      await setFlag('google_login', false);
      const verifySpy = verifyIdTokenSpy;
      const callsBefore = verifySpy.mock.calls.length;
      const res = await api()
        .post('/api/v1/auth/social')
        .send({
          provider: 'google',
          idToken: 'header.payload.sig',
          nonce: 'n'.repeat(32),
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_PROVIDER_DISABLED');
      expect(verifySpy.mock.calls.length).toBe(callsBefore);
    });
  });

  // -------------------------------------------------------------------
  describe('email OTP magic link (docs/01 §10.2 E)', () => {
    it('the login email carries the code; its links carry only a one-time token (security review 2026-09-27)', async () => {
      const address = 'Magic.Link+1@Example.com';
      const challenge = createHash('sha256')
        .update('v'.repeat(43))
        .digest('base64url');
      await api()
        .post('/api/v1/auth/otp/request')
        .send({
          channel: 'email',
          identifier: address,
          linkChallenge: challenge,
        })
        .expect(200);
      const [msg] = email.to('magic.link+1@example.com');
      expect(msg).toBeDefined();
      expect(msg.text).toContain(FIXED_CODE);
      expect(msg.text).toMatch(
        /lawbid:\/\/auth\/email-code\?token=[A-Za-z0-9_-]{43}/,
      );
      expect(msg.text).toMatch(
        /https:\/\/links\.lawbid\.test\/auth\/email-code\?token=[A-Za-z0-9_-]{43}/,
      );
      for (const link of msg.text
        .split(/\s+/)
        .filter((w) => w.includes('://'))) {
        expect(link).not.toContain(FIXED_CODE);
        expect(link).not.toContain('example.com');
      }
      expect(msg.html).toContain(FIXED_CODE);
    });
  });

  // -------------------------------------------------------------------
  describe('new-device notification (docs/01 §10.6)', () => {
    it('emails a verified address and records new_device when an existing user signs in on a new device', async () => {
      const address = 'newdevice@example.com';
      const first = await otpLogin('email', address, 'nd-device-1');
      expect(first.isNewUser).toBe(true);
      await notifier.drain();
      const alerts = () =>
        email
          .to(address)
          .filter((m) => m.subject === 'New sign-in to your LawBid account');
      expect(alerts()).toHaveLength(0); // sign-up is not a "new device"

      await otpLogin('email', address, 'nd-device-1'); // same device again
      await notifier.drain();
      expect(alerts()).toHaveLength(0);

      await otpLogin('email', address, 'nd-device-2', 'Pixel 9');
      await notifier.drain();
      expect(alerts()).toHaveLength(1);
      const [alert] = alerts();
      expect(alert.text).toContain('Pixel 9');
      expect(alert.text).toContain('lawbid://profile/settings/devices');
      expect(alert.text).toContain(
        'https://links.lawbid.test/profile/settings/devices',
      );
      expect(alert.html).toContain('href="https://links.lawbid.test/');

      const userId = await userIdFor('email', address);
      const events = await prisma.authEvent.findMany({
        where: { user_id: userId, event_type: 'new_device' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].device_id).toBe('nd-device-2');
    });

    it('records new_device but sends no email when the user has no verified email', async () => {
      const phone = '+12025558401';
      await otpLogin('phone', phone, 'np-1');
      const sentBefore = email.sent.length;
      await otpLogin('phone', phone, 'np-2');
      await notifier.drain();
      expect(email.sent.length).toBe(sentBefore);
      const userId = await userIdFor('phone', phone);
      expect(
        await prisma.authEvent.count({
          where: { user_id: userId, event_type: 'new_device' },
        }),
      ).toBe(1);
    });

    it('a failing email provider never fails the login', async () => {
      const address = 'flaky@example.com';
      await otpLogin('email', address, 'fl-1');
      const spy = jest
        .spyOn(email, 'sendEmail')
        .mockImplementation((m: EmailMessage) =>
          m.subject.startsWith('New sign-in')
            ? Promise.reject(new Error('SES down'))
            : Promise.resolve(void email.sent.push(m)),
        );
      try {
        const res = await otpLogin('email', address, 'fl-2');
        expect(res.accessToken).toBeDefined();
        await notifier.drain();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------
  describe('Google id_token nonce (docs/01 §10.2 G)', () => {
    const raw = 'e2e-raw-nonce-0123456789abcdef';
    const socialBody = (deviceId: string) => ({
      provider: 'google',
      idToken: 'header.payload.sig',
      nonce: raw,
      deviceInfo: { deviceId },
    });

    it('rejects a token whose nonce claim does not match with AUTH_SOCIAL_TOKEN_INVALID', async () => {
      googlePayload = {
        sub: 'google-e2e-1',
        nonce: 'someone-elses-nonce',
        email: 'g1@example.com',
        email_verified: true,
      };
      const res = await api()
        .post('/api/v1/auth/social')
        .send(socialBody('g-dev-1'));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_SOCIAL_TOKEN_INVALID');
      expect(
        await prisma.userIdentifier.count({
          where: { provider: 'google', provider_uid: 'google-e2e-1' },
        }),
      ).toBe(0);
    });

    it('rejects a token without a nonce claim', async () => {
      googlePayload = { sub: 'google-e2e-2', email_verified: false };
      const res = await api()
        .post('/api/v1/auth/social')
        .send(socialBody('g-dev-2'));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_SOCIAL_TOKEN_INVALID');
    });

    it.each([
      ['raw', raw],
      ['sha256(raw)', createHash('sha256').update(raw).digest('hex')],
    ])('accepts a nonce claim equal to the %s nonce', async (_, claim) => {
      googlePayload = {
        sub: `google-e2e-ok-${claim.length}`,
        nonce: claim,
        email_verified: false,
      };
      const res = await api()
        .post('/api/v1/auth/social')
        .send(socialBody(`g-ok-${claim.length}`));
      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    // Owner 2026-10-01: one phone per account — Google on a second phone
    // asks first; continuing signs the first phone out.
    it('a second phone via Google asks, then signs the first phone out', async () => {
      googlePayload = {
        sub: 'google-e2e-two',
        nonce: raw,
        email_verified: false,
      };
      const first = await api()
        .post('/api/v1/auth/social')
        .send(socialBody('g-two-a'));
      expect(first.status).toBe(201);
      const second = await api()
        .post('/api/v1/auth/social')
        .send(socialBody('g-two-b'));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('AUTH_OTHER_DEVICE_ACTIVE');
      const cont = await api()
        .post('/api/v1/auth/login/continue')
        .send({ pendingToken: second.body.error.details.pendingToken });
      expect(cont.status).toBe(201);
      const old = await api()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${first.body.data.accessToken}`);
      expect(old.status).toBe(401);
      expect(old.body.error.code).toBe('AUTH_SIGNED_IN_ELSEWHERE');
    });
  });

  // -------------------------------------------------------------------
  describe('hardening 2 (S14-4 / 5 / 6 / 8 / 10 / 12)', () => {
    const setting = async (key: string, value: unknown) => {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
      await redis.del('config:app_config');
    };
    const ipOf = (n: number) => `198.51.100.${n}`;

    it('S14-6: a disposable e-mail opens no NEW account, an existing one still signs in', async () => {
      await prisma.blockedEmailDomain.upsert({
        where: { domain: 'junk-mail.test' },
        create: { domain: 'junk-mail.test', reason: 'e2e' },
        update: {},
      });
      const blocked = await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', identifier: 'fresh@junk-mail.test' });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('CONTACT_DOMAIN_BLOCKED');
      // An address that already signs someone in is never refused.
      const user = await prisma.user.create({
        data: { role: 'client', status: 'active', email: 'old@junk-mail.test' },
      });
      await prisma.userIdentifier.create({
        data: {
          user_id: user.id,
          provider: 'email',
          provider_uid: 'old@junk-mail.test',
        },
      });
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', identifier: 'old@junk-mail.test' })
        .expect(200);
      // Switch off: the same new address is accepted.
      await setting('security.signup_block_disposable_email', false);
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', identifier: 'fresh2@junk-mail.test' })
        .expect(200);
      await setting('security.signup_block_disposable_email', true);
    });

    it('S14-6: Gmail dots and +tags share one hourly budget', async () => {
      const variants = [
        'tag.fold@gmail.com',
        'tagfold@gmail.com',
        'tag.fold+a@gmail.com',
        'ta.g.fold+b@gmail.com',
      ];
      for (const v of variants) {
        await api()
          .post('/api/v1/auth/otp/request')
          .set('X-Forwarded-For', ipOf(40))
          .send({ channel: 'email', identifier: v });
      }
      const key = `rl:sliding:otp-req:id:${createHash('sha256')
        .update('tagfold@gmail.com')
        .digest('hex')
        .slice(0, 32)}`;
      expect(await redis.zcard(key)).toBe(variants.length);
    });

    it('S14-8: wrong codes lock per address — another address still signs in', async () => {
      const phone = '+12025558701';
      await api()
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', ipOf(50))
        .send({ channel: 'phone', identifier: phone })
        .expect(200);
      let last = 0;
      for (let i = 0; i < 5; i += 1) {
        last = (
          await api()
            .post('/api/v1/auth/otp/verify')
            .set('X-Forwarded-For', ipOf(51))
            .send({ channel: 'phone', identifier: phone, code: '999999' })
        ).status;
      }
      expect(last).toBe(423);
      // The attacker's address is locked even for the right code...
      const locked = await api()
        .post('/api/v1/auth/otp/verify')
        .set('X-Forwarded-For', ipOf(51))
        .send({ channel: 'phone', identifier: phone, code: FIXED_CODE });
      expect(locked.status).toBe(423);
      // ...the owner's address is not.
      const ok = await api()
        .post('/api/v1/auth/otp/verify')
        .set('X-Forwarded-For', ipOf(52))
        .send({ channel: 'phone', identifier: phone, code: FIXED_CODE });
      expect(ok.status).toBe(201);
    });

    it('S14-12: a re-authentication code is its own purpose, bound to the session', async () => {
      const phone = '+12025558702';
      const tokens = await otpLogin('phone', phone, 'reauth-dev');
      const bearer = { Authorization: `Bearer ${tokens.accessToken}` };
      await setting('security.otp_legacy_purpose_fallback', false);
      try {
        // A plain sign-in code does not step up any more.
        await api()
          .post('/api/v1/auth/otp/request')
          .set('X-Forwarded-For', ipOf(60))
          .send({ channel: 'phone', identifier: phone })
          .expect(200);
        const plain = await api()
          .post('/api/v1/auth/reauth')
          .set(bearer)
          .send({ method: 'otp', identifier: phone, code: FIXED_CODE });
        expect(plain.status).toBe(401);
        expect(plain.body.error.code).toBe('REAUTH_INVALID');
        // The same code asked as `reauth` does.
        const cool = await redis.keys('*sms-resend*');
        if (cool.length > 0) await redis.del(...cool);
        await api()
          .post('/api/v1/auth/otp/request')
          .set(bearer)
          .set('X-Forwarded-For', ipOf(61))
          .send({ channel: 'phone', identifier: phone, purpose: 'reauth' })
          .expect(200);
        await api()
          .post('/api/v1/auth/reauth')
          .set(bearer)
          .send({ method: 'otp', identifier: phone, code: FIXED_CODE })
          .expect(201);
        // `reauth` / `link` need a signed-in caller...
        const anon = await api()
          .post('/api/v1/auth/otp/request')
          .send({ channel: 'phone', identifier: phone, purpose: 'reauth' });
        expect(anon.status).toBe(401);
        // ...and a reauth code is only for the caller's OWN contact.
        const foreign = await api()
          .post('/api/v1/auth/otp/request')
          .set(bearer)
          .send({
            channel: 'phone',
            identifier: '+12025558799',
            purpose: 'reauth',
          });
        expect(foreign.status).toBe(401);
        expect(foreign.body.error.code).toBe('REAUTH_INVALID');
      } finally {
        await setting('security.otp_legacy_purpose_fallback', true);
      }
    });

    it('owner 2026-10-28: step-up with the account password (no SMS)', async () => {
      const phone = '+12025558704';
      const tokens = await otpLogin('phone', phone, 'reauth-pwd-dev');
      const bearer = { Authorization: `Bearer ${tokens.accessToken}` };
      // No password yet: the app is told to use the code instead.
      const none = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .set('X-Forwarded-For', ipOf(80))
        .send({ method: 'password', password: 'whatever-1' });
      expect(none.status).toBe(401);
      expect(none.body.error.code).toBe('REAUTH_INVALID');
      expect(none.body.error.details.reason).toBe('no_password');
      // Fresh sign-in: the password can be set without a code.
      await api()
        .post('/api/v1/auth/password')
        .set(bearer)
        .send({ password: 'Lawbid-e2e-Step-up-77' })
        .expect(200);
      // A wrong password.
      const wrong = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .set('X-Forwarded-For', ipOf(80))
        .send({ method: 'password', password: 'not-my-password' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe('REAUTH_INVALID');
      expect(wrong.body.error.details.reason).toBe('wrong_password');
      // The right one: the usual single-use token of this session.
      const ok = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .set('X-Forwarded-For', ipOf(80))
        .send({ method: 'password', password: 'Lawbid-e2e-Step-up-77' })
        .expect(201);
      const reauthToken = ok.body.data.reauthToken as string;
      expect(reauthToken).toEqual(expect.any(String));
      const claims = JSON.parse(
        Buffer.from(reauthToken.split('.')[1], 'base64url').toString(),
      ) as { sub: string; sid: string };
      expect(claims.sid).toEqual(expect.any(String));
      // The code path still works with the old body shape (older apps)...
      const old = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .send({ method: 'otp', identifier: phone });
      expect(old.status).toBe(400);
      // ...and a password body without a password is refused.
      const empty = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .send({ method: 'password' });
      expect(empty.status).toBe(400);
      // Five wrong passwords lock the step-up, even for the right one.
      for (let i = 0; i < 5; i += 1) {
        await api()
          .post('/api/v1/auth/reauth')
          .set(bearer)
          .set('X-Forwarded-For', ipOf(81))
          .send({ method: 'password', password: `wrong-${i}` });
      }
      const locked = await api()
        .post('/api/v1/auth/reauth')
        .set(bearer)
        .set('X-Forwarded-For', ipOf(81))
        .send({ method: 'password', password: 'Lawbid-e2e-Step-up-77' });
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe('RATE_LIMITED');
      expect(locked.body.error.details.reason).toBe('locked');
      const events = await prisma.authEvent.count({
        where: { event_type: 'reauth_failed' },
      });
      expect(events).toBeGreaterThan(0);
    });

    it('S14-10: the session list says where from (masked address, country, browser)', async () => {
      const phone = '+12025558703';
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: phone })
        .expect(200);
      const res = await api()
        .post('/api/v1/auth/otp/verify')
        .set('X-Forwarded-For', ipOf(70))
        .set('CloudFront-Viewer-Country', 'US')
        .set(
          'User-Agent',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        )
        .send({
          channel: 'phone',
          identifier: phone,
          code: FIXED_CODE,
          deviceInfo: { deviceId: 'list-dev', platform: 'ios' },
        })
        .expect(201);
      const list = await api()
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${res.body.data.accessToken as string}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        ipHint: '198.51.100.x',
        country: 'US',
        browser: 'Safari · macOS',
        isCurrent: true,
      });
    });

    it('S14-4: a refresh from a new country alerts once; "this wasn\'t me" ends every session', async () => {
      const phone = '+12025558704';
      await setting('security.new_country_alert_enabled', true);
      await api()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'phone', identifier: phone })
        .expect(200);
      const login = await api()
        .post('/api/v1/auth/otp/verify')
        .set('CloudFront-Viewer-Country', 'US')
        .send({
          channel: 'phone',
          identifier: phone,
          code: FIXED_CODE,
          deviceInfo: { deviceId: 'nc-dev' },
        })
        .expect(201);
      const userId = await userIdFor('phone', phone);
      const refreshFrom = (token: string, country: string) =>
        api()
          .post('/api/v1/auth/refresh')
          .set('CloudFront-Viewer-Country', country)
          .send({ refreshToken: token });
      const same = await refreshFrom(login.body.data.refreshToken, 'US');
      expect(same.status).toBe(201);
      await notifier.drain();
      const alerts = () =>
        prisma.authEvent.count({
          where: { user_id: userId, event_type: 'new_country' },
        });
      expect(await alerts()).toBe(0);
      const moved = await refreshFrom(same.body.data.refreshToken, 'DE');
      expect(moved.status).toBe(201);
      await notifier.drain();
      expect(await alerts()).toBe(1);
      const again = await refreshFrom(moved.body.data.refreshToken, 'DE');
      expect(again.status).toBe(201);
      await notifier.drain();
      expect(await alerts()).toBe(1);

      const bearer = {
        Authorization: `Bearer ${again.body.data.accessToken as string}`,
      };
      await api().post('/api/v1/auth/wasnt-me').set(bearer).expect(200);
      expect(
        await prisma.authEvent.count({
          where: { user_id: userId, event_type: 'wasnt_me' },
        }),
      ).toBe(1);
      expect(
        await prisma.session.count({
          where: { user_id: userId, revoked_at: null },
        }),
      ).toBe(0);
      await api().get('/api/v1/auth/sessions').set(bearer).expect(401);
    });

    it('S14-5: social sign-in honours the ban list (device and e-mail)', async () => {
      const raw = 'e2e-raw-nonce-0123456789abcdef';
      const device = `ban-dev-${randomUUID()}`;
      await prisma.accountBan.create({
        data: {
          kind: 'device',
          value: device,
          reason: 'fraud',
          created_by: randomUUID(),
        },
      });
      googlePayload = {
        sub: `google-banned-${device}`,
        nonce: raw,
        email: 'clean@example.com',
        email_verified: true,
      };
      const byDevice = await api()
        .post('/api/v1/auth/social')
        .send({
          provider: 'google',
          idToken: 'header.payload.sig',
          nonce: raw,
          deviceInfo: { deviceId: device },
        });
      expect(byDevice.status).toBe(403);
      expect(byDevice.body.error.code).toBe('ACCOUNT_SUSPENDED');
      expect(
        await prisma.userIdentifier.count({
          where: {
            provider: 'google',
            provider_uid: googlePayload.sub as string,
          },
        }),
      ).toBe(0);

      const bannedMail = `banned-${randomUUID()}@example.com`;
      await prisma.accountBan.create({
        data: {
          kind: 'email',
          value: bannedMail,
          reason: 'fraud',
          created_by: randomUUID(),
        },
      });
      googlePayload = {
        sub: `google-banned-mail-${bannedMail}`,
        nonce: raw,
        email: bannedMail,
        email_verified: true,
      };
      const byMail = await api()
        .post('/api/v1/auth/social')
        .send({
          provider: 'google',
          idToken: 'header.payload.sig',
          nonce: raw,
          deviceInfo: { deviceId: `ok-${randomUUID()}` },
        });
      expect(byMail.status).toBe(403);
      expect(byMail.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('S14-6: a first Google sign-in with a disposable e-mail opens no account', async () => {
      const raw = 'e2e-raw-nonce-0123456789abcdef';
      googlePayload = {
        sub: 'google-disposable-1',
        nonce: raw,
        email: 'throwaway@junk-mail.test',
        email_verified: true,
      };
      const res = await api()
        .post('/api/v1/auth/social')
        .send({
          provider: 'google',
          idToken: 'header.payload.sig',
          nonce: raw,
          deviceInfo: { deviceId: `dis-${randomUUID()}` },
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CONTACT_DOMAIN_BLOCKED');
    });
  });
});
