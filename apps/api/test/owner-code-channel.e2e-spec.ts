import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  EMAIL_PROVIDER,
  SMS_PROVIDER,
} from '../src/modules/auth/providers/provider.tokens';
import type { SmsProvider } from '../src/modules/auth/providers/sms/sms-provider.interface';
import type { EmailProvider } from '../src/modules/auth/providers/email/email-provider.interface';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { bumpConfigVersion } from '../src/modules/feature-flags/services/config-version';

/**
 * Owner 25.11: «Мы не будем использовать SES … сделай переключатель, по
 * умолчанию SMS». A signed-in person's confirmation code (step-up) goes by
 * `auth.code_channel`: sms (default) → the verified phone, email → the
 * verified e-mail, auto → the e-mail only while SES is ready (never here:
 * the mock provider) — always to the person's OWN verified contact, with
 * the other one as the fallback. The SMS / e-mail providers are watched, so
 * each test proves where the code really went.
 */
jest.setTimeout(90_000);

describe('auth.code_channel: confirmation codes by SMS by default (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let seq = 0;
  /** Where each code really went (the providers are replaced by these). */
  const smsSent: string[] = [];
  const mailSent: string[] = [];
  const smsProvider: SmsProvider = {
    send: (to: string) => {
      smsSent.push(to);
      return Promise.resolve();
    },
    sendText: () => Promise.resolve(),
  };
  const mailProvider: EmailProvider = {
    sendEmail: (m: { to: string }) => {
      mailSent.push(m.to);
      return Promise.resolve();
    },
  };
  const FIXED = '000000';

  const setting = async (key: string, value: unknown) => {
    if (value === undefined) {
      await prisma.appConfig.deleteMany({ where: { key } });
    } else {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await dropAppConfigCache(redis);
    await bumpConfigVersion(redis);
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SMS_PROVIDER)
      .useValue(smsProvider)
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(mailProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  beforeEach(() => {
    smsSent.length = 0;
    mailSent.length = 0;
  });

  afterAll(async () => {
    await setting('auth.code_channel', undefined);
    await app.close();
  });

  const api = () => request(base);
  const fresh = () =>
    `+1415557${String(1000 + (seq += 1) + (Date.now() % 7000)).padStart(4, '0')}`;

  /** A person with an older session (a fresh sign-in is itself a step-up). */
  async function person(opts: { phone?: boolean; email?: boolean } = {}) {
    const phone = fresh();
    const email = `cc-${randomUUID().slice(0, 8)}@example.com`;
    const user = await prisma.user.create({
      data: {
        role: 'client',
        status: 'active',
        phone_e164: phone,
        phone_verified_at: opts.phone === false ? null : new Date(),
        email,
        email_verified_at: opts.email === false ? null : new Date(),
      },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    const sid = randomUUID();
    await prisma.session.create({
      data: {
        user_id: user.id,
        session_chain_id: sid,
        refresh_hash: `code-channel-${sid}`,
        platform: 'ios',
        expires_at: new Date(Date.now() + 86_400_000),
        created_at: new Date(Date.now() - 3_600_000),
      },
    });
    const auth = {
      Authorization: `Bearer ${app.get(TokenService).signAccessToken({
        sub: user.id,
        role: 'client',
        sid,
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
    return { phone, email, auth };
  }

  const ask = (
    auth: Record<string, string>,
    channel: 'phone' | 'email',
    identifier: string,
  ) =>
    api()
      .post('/api/v1/auth/otp/request')
      .set(auth)
      .set('X-Device-Id', randomUUID())
      .send({ channel, identifier, purpose: 'reauth' });
  const confirm = (
    auth: Record<string, string>,
    identifier: string,
    code = FIXED,
  ) =>
    api()
      .post('/api/v1/auth/reauth')
      .set(auth)
      .send({ method: 'otp', identifier, code });
  const smsTo = () => [...smsSent];
  const mailTo = () => [...mailSent];
  const bootstrapChannel = async () =>
    (
      (await api().get('/api/v1/config/bootstrap').expect(200)).body as {
        data: { app_config: Record<string, unknown> };
      }
    ).data.app_config['auth.code_channel'];

  it('default (nothing stored): SMS to the own phone, even when the app names the e-mail', async () => {
    await setting('auth.code_channel', undefined);
    expect(await bootstrapChannel()).toBe('sms');
    const p = await person();
    expect((await ask(p.auth, 'email', p.email)).status).toBe(200);
    expect(smsTo()).toEqual([p.phone]);
    expect(mailTo()).toEqual([]);
    // The app of pack E confirms with the e-mail it named.
    const res = await confirm(p.auth, p.email);
    expect(res.status).toBe(201);
    expect(typeof res.body.data.reauthToken).toBe('string');
  });

  it('sms: the phone named, the phone texted, the code confirms', async () => {
    await setting('auth.code_channel', 'sms');
    const p = await person();
    expect((await ask(p.auth, 'phone', p.phone)).status).toBe(200);
    expect(smsTo()).toEqual([p.phone]);
    expect((await confirm(p.auth, p.phone)).status).toBe(201);
  });

  it('email: the own verified e-mail gets it, not the phone', async () => {
    await setting('auth.code_channel', 'email');
    expect(await bootstrapChannel()).toBe('email');
    const p = await person();
    expect((await ask(p.auth, 'phone', p.phone)).status).toBe(200);
    expect(smsTo()).toEqual([]);
    expect(mailTo()).toEqual([p.email]);
    expect((await confirm(p.auth, p.email)).status).toBe(201);
  });

  it('email, but no verified e-mail: the SMS fallback', async () => {
    await setting('auth.code_channel', 'email');
    const p = await person({ email: false });
    expect((await ask(p.auth, 'phone', p.phone)).status).toBe(200);
    expect(smsTo()).toEqual([p.phone]);
    expect(mailTo()).toEqual([]);
    expect((await confirm(p.auth, p.phone)).status).toBe(201);
  });

  it('sms, but no verified phone: the e-mail fallback; the unverified phone is refused', async () => {
    await setting('auth.code_channel', 'sms');
    const p = await person({ phone: false });
    expect((await ask(p.auth, 'email', p.email)).status).toBe(200);
    expect(mailTo()).toEqual([p.email]);
    expect(smsTo()).toEqual([]);
    expect((await confirm(p.auth, p.email)).status).toBe(201);
    const refused = await ask(p.auth, 'phone', p.phone);
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('REAUTH_INVALID');
  });

  it('neither verified: a clear REAUTH_INVALID, nothing sent', async () => {
    await setting('auth.code_channel', 'sms');
    const p = await person({ phone: false, email: false });
    const res = await ask(p.auth, 'phone', p.phone);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REAUTH_INVALID');
    expect(smsTo()).toEqual([]);
    expect(mailTo()).toEqual([]);
  });

  it('auto with no SES (mock provider): SMS; a typo is SMS too', async () => {
    await setting('auth.code_channel', 'auto');
    expect(await bootstrapChannel()).toBe('sms');
    const p = await person();
    expect((await ask(p.auth, 'email', p.email)).status).toBe(200);
    expect(smsTo()).toEqual([p.phone]);
    expect(mailTo()).toEqual([]);
    await setting('auth.code_channel', 'telegram');
    expect(await bootstrapChannel()).toBe('sms');
  });

  it('the step-up SMS waits for the admin cooldown like every SMS code', async () => {
    await setting('auth.code_channel', 'sms');
    await setting('sms.resend_cooldown_seconds', 60);
    try {
      const p = await person();
      expect((await ask(p.auth, 'phone', p.phone)).status).toBe(200);
      const again = await ask(p.auth, 'phone', p.phone);
      expect(again.status).toBe(429);
      expect(again.body.error.code).toBe('RATE_LIMITED');
      expect(smsTo()).toEqual([p.phone]);
    } finally {
      await setting('sms.resend_cooldown_seconds', 0);
    }
  });

  it('a wrong code is refused', async () => {
    await setting('auth.code_channel', 'sms');
    const p = await person();
    expect((await ask(p.auth, 'phone', p.phone)).status).toBe(200);
    const wrong = await confirm(p.auth, p.phone, '123456');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('REAUTH_INVALID');
  });
});
