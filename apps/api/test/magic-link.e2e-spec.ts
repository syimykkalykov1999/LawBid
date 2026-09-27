import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EMAIL_PROVIDER } from '../src/modules/auth/providers/provider.tokens';
import type {
  EmailMessage,
  EmailProvider,
} from '../src/modules/auth/providers/email/email-provider.interface';

/**
 * Email magic link (docs/01 §10.2 E) after the 2026-09-27 security review:
 * the emailed link must carry no OTP code, and its one-time token must be
 * redeemable only with the verifier kept on the requesting device.
 */
class CapturingEmail implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  sendEmail(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe('Magic link (e2e) — no code in links, device-bound token', () => {
  jest.setTimeout(60_000);
  let app: NestExpressApplication;
  const email = new CapturingEmail();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(email)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  };

  async function requestLink(address: string, challenge?: string) {
    const before = email.sent.length;
    await api()
      .post('/api/v1/auth/otp/request')
      .send({
        channel: 'email',
        identifier: address,
        ...(challenge ? { linkChallenge: challenge } : {}),
      })
      .expect(200);
    const msg = email.sent.slice(before).find((m) => m.to === address);
    expect(msg).toBeDefined();
    const token = /[?&]token=([A-Za-z0-9_-]{43})/.exec(msg!.text)?.[1];
    return { msg: msg!, token };
  }

  it('the email links never contain the code or the address', async () => {
    const { challenge } = pkce();
    const { msg, token } = await requestLink('ml1@example.com', challenge);
    expect(token).toBeDefined();
    const code = /sign-in code: (\d{6})/.exec(msg.text)?.[1];
    expect(code).toBeDefined();
    const links = msg.text.split(/\s+/).filter((w) => w.includes('://'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).not.toContain(code!);
      expect(link).not.toContain('ml1');
    }
  });

  it('without a challenge there is no magic link at all', async () => {
    const { msg, token } = await requestLink('ml2@example.com');
    expect(token).toBeUndefined();
    expect(msg.text).not.toContain('://');
  });

  it('a leaked link is useless without the device verifier, and single-use', async () => {
    const { verifier, challenge } = pkce();
    const { token } = await requestLink('ml3@example.com', challenge);
    const attacker = await api()
      .post('/api/v1/auth/otp/verify-link')
      .send({ token, verifier: randomBytes(32).toString('base64url') })
      .expect(401);
    expect(attacker.body.error.code).toBe('AUTH_OTP_INVALID');
    // The failed attempt burned the token: the owner must request again.
    await api()
      .post('/api/v1/auth/otp/verify-link')
      .send({ token, verifier })
      .expect(401);
  });

  it('the requesting device signs in with token + verifier, once; the code is burned too', async () => {
    const { verifier, challenge } = pkce();
    const { msg, token } = await requestLink('ml4@example.com', challenge);
    const ok = await api()
      .post('/api/v1/auth/otp/verify-link')
      .send({ token, verifier, deviceInfo: { deviceId: 'ml-dev' } })
      .expect(201);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    await api()
      .post('/api/v1/auth/otp/verify-link')
      .send({ token, verifier })
      .expect(401);
    const code = /sign-in code: (\d{6})/.exec(msg.text)![1];
    await api()
      .post('/api/v1/auth/otp/verify')
      .send({ channel: 'email', identifier: 'ml4@example.com', code })
      .expect(401);
  });
});
