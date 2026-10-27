import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { WebAuthnConfig } from '../src/modules/auth/passkeys/webauthn-config';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import {
  adminSession,
  adminStepUp,
  E2E_ADMIN_PASSWORD,
  e2eLogin,
} from './support/admin-login';
import { FakeAuthenticator } from './support/webauthn-authenticator';

jest.setTimeout(60_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * Owner 2026-10-22 (systems checklist §1): passkeys (WebAuthn) — the app
 * enrols one, signs in with it (no code), confirms a sensitive action
 * with it (reauth), removes it; the admin enrols one after a step-up,
 * uses it as the second factor instead of the authenticator code and for
 * the step-up itself. A software authenticator plays the platform.
 */
describe('passkeys (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let origin = '';
  let rpId = '';
  const api = () => request(baseUrl);
  const data = (r: request.Response) => (r.body as Body).data;
  const code = (r: request.Response) => (r.body as Body).error?.code;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port.port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    const rp = await app.get(WebAuthnConfig).relyingParty();
    rpId = rp.rpId;
    // Outside production any localhost port is an accepted origin.
    origin = 'http://localhost:3000';
  });

  afterAll(async () => {
    await app.close();
  });

  const user = async () => {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        status: 'active',
        email: `pk-${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
        email_verified_at: new Date(),
        first_name: 'Pass',
        last_name: 'Key',
      },
    });
    const sid = randomUUID();
    const bearer = `Bearer ${tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid,
      verified: false,
      subscriptionStatus: 'none',
    })}`;
    const reauth = () => ({
      'X-Reauth-Token': tokens.signReauthToken({ sub: u.id, sid }),
    });
    return { id: u.id, email: u.email!, bearer, reauth };
  };

  it('app: enrol → sign in with the passkey → reauth with it → remove; replays and strangers fail', async () => {
    const me = await user();
    const authenticator = new FakeAuthenticator(origin, rpId);

    // Enrolling asks for a recent sign-in (or a reauth token).
    const denied = await api()
      .post('/api/v1/auth/passkeys/register/options')
      .set('Authorization', me.bearer)
      .expect(403);
    expect(code(denied)).toBe('REAUTH_REQUIRED');

    const opts = await api()
      .post('/api/v1/auth/passkeys/register/options')
      .set('Authorization', me.bearer)
      .set(me.reauth())
      .expect(200);
    const options = data(opts).options as Record<string, unknown>;
    expect((options.rp as { id: string }).id).toBe(rpId);
    expect(
      (options.authenticatorSelection as { residentKey: string }).residentKey,
    ).toBe('required');
    // S14-9: registration asks for user verification too.
    expect(
      (options.authenticatorSelection as { userVerification: string })
        .userVerification,
    ).toBe('required');

    const created = await api()
      .post('/api/v1/auth/passkeys/register')
      .set('Authorization', me.bearer)
      .send({ response: authenticator.create(options), name: 'iPhone' })
      .expect(201);
    expect(data(created)).toMatchObject({
      name: 'iPhone',
      deviceType: 'singleDevice',
    });
    const passkeyId = data(created).id as string;

    const list = await api()
      .get('/api/v1/auth/passkeys')
      .set('Authorization', me.bearer)
      .expect(200);
    expect(data(list).passkeys).toHaveLength(1);

    // Sign in: no identifier typed, the authenticator names the account.
    const loginOpts = await api()
      .post('/api/v1/auth/passkeys/login/options')
      .send({ deviceInfo: { platform: 'ios', deviceId: 'd-pk-1' } })
      .expect(200);
    const challengeId = data(loginOpts).challengeId as string;
    const assertion = authenticator.get(
      data(loginOpts).options as Record<string, unknown>,
    );
    const login = await api()
      .post('/api/v1/auth/passkeys/login')
      .set('X-Device-Id', 'd-pk-1')
      .send({
        challengeId,
        response: assertion,
        deviceInfo: { platform: 'ios', deviceId: 'd-pk-1' },
      })
      .expect(201);
    expect(data(login)).toMatchObject({
      isNewUser: false,
      accessTokenExpiresIn: expect.any(Number),
    });
    expect(typeof data(login).accessToken).toBe('string');
    expect(typeof data(login).refreshToken).toBe('string');
    const events = await prisma.authEvent.findMany({
      where: { user_id: me.id },
      orderBy: { created_at: 'asc' },
    });
    expect(events.map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['passkey_added', 'passkey_login_success']),
    );

    // The challenge is single use.
    const replay = await api()
      .post('/api/v1/auth/passkeys/login')
      .send({ challengeId, response: assertion })
      .expect(401);
    expect(code(replay)).toBe('PASSKEY_INVALID');

    // A stranger's key, or a stale counter, never signs in.
    const stranger = new FakeAuthenticator(origin, rpId);
    const strangerOpts = await api()
      .post('/api/v1/auth/passkeys/login/options')
      .send({})
      .expect(200);
    const bad = await api()
      .post('/api/v1/auth/passkeys/login')
      .send({
        challengeId: data(strangerOpts).challengeId,
        response: stranger.get(
          data(strangerOpts).options as Record<string, unknown>,
        ),
      })
      .expect(401);
    expect(code(bad)).toBe('PASSKEY_INVALID');

    // S14-9: the step-up needs USER VERIFICATION — a bare touch (UP only)
    // is refused, and the options ask for it.
    const bareOpts = await api()
      .post('/api/v1/auth/passkeys/reauth/options')
      .set('Authorization', me.bearer)
      .expect(200);
    expect(
      (data(bareOpts).options as { userVerification: string }).userVerification,
    ).toBe('required');
    const bare = await api()
      .post('/api/v1/auth/passkeys/reauth')
      .set('Authorization', me.bearer)
      .send({
        challengeId: data(bareOpts).challengeId,
        response: authenticator.get(
          data(bareOpts).options as Record<string, unknown>,
          { userVerified: false },
        ),
      })
      .expect(401);
    expect(code(bare)).toBe('PASSKEY_INVALID');

    // Reauth with the passkey: a single-use X-Reauth-Token.
    const reauthOpts = await api()
      .post('/api/v1/auth/passkeys/reauth/options')
      .set('Authorization', me.bearer)
      .expect(200);
    const allow = (data(reauthOpts).options as { allowCredentials: unknown[] })
      .allowCredentials;
    expect(allow).toHaveLength(1);
    const reauth = await api()
      .post('/api/v1/auth/passkeys/reauth')
      .set('Authorization', me.bearer)
      .send({
        challengeId: data(reauthOpts).challengeId,
        response: authenticator.get(
          data(reauthOpts).options as Record<string, unknown>,
        ),
      })
      .expect(201);
    const reauthToken = data(reauth).reauthToken as string;
    expect(typeof reauthToken).toBe('string');

    // …which unlocks a sensitive action: removing the passkey.
    const removed = await api()
      .delete(`/api/v1/auth/passkeys/${passkeyId}`)
      .set('Authorization', me.bearer)
      .set('X-Reauth-Token', reauthToken)
      .expect(200);
    expect(data(removed)).toEqual({ removed: true });
    const empty = await api()
      .get('/api/v1/auth/passkeys')
      .set('Authorization', me.bearer)
      .expect(200);
    expect(data(empty).passkeys).toEqual([]);
    const noKey = await api()
      .post('/api/v1/auth/passkeys/reauth/options')
      .set('Authorization', me.bearer)
      .expect(404);
    expect(code(noKey)).toBe('PASSKEY_NOT_FOUND');
  });

  it('app: the passkey_login flag refuses sign-ins (enrolled keys stay for reauth)', async () => {
    const flags = app.get(FeatureFlagsService);
    await prisma.featureFlag.upsert({
      where: { key: 'passkey_login' },
      create: { key: 'passkey_login', enabled: false },
      update: { enabled: false },
    });
    await flags.invalidate();
    try {
      const r = await api()
        .post('/api/v1/auth/passkeys/login/options')
        .send({})
        .expect(403);
      expect(code(r)).toBe('AUTH_PROVIDER_DISABLED');
    } finally {
      await prisma.featureFlag.update({
        where: { key: 'passkey_login' },
        data: { enabled: true },
      });
      await flags.invalidate();
    }
  });

  it('admin: enrol after a step-up → passkey as the second factor → passkey step-up; wrong keys burn the ticket', async () => {
    const s = await adminSession(baseUrl, prisma, 'moderator');
    const authenticator = new FakeAuthenticator(origin, rpId);

    // Enrolment is gated by the step-up.
    const gated = await api()
      .post('/api/v1/admin/auth/passkeys/options')
      .set(s.auth)
      .expect(403);
    expect(code(gated)).toBe('ADMIN_STEP_UP_REQUIRED');
    await adminStepUp(baseUrl, s);
    const opts = await api()
      .post('/api/v1/admin/auth/passkeys/options')
      .set(s.auth)
      .expect(200);
    const enrolled = await api()
      .post('/api/v1/admin/auth/passkeys')
      .set(s.auth)
      .send({
        response: authenticator.create(
          data(opts).options as Record<string, unknown>,
        ),
        name: 'YubiKey',
      })
      .expect(201);
    const passkeyId = data(enrolled).id as string;
    const me = await api().get('/api/v1/admin/auth/me').set(s.auth).expect(200);
    expect(data(me)).toMatchObject({ totpEnabled: true, passkeyCount: 1 });

    // Sign in again: password → the ticket says a passkey may be used.
    const step1 = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login: e2eLogin(s.email), password: E2E_ADMIN_PASSWORD })
      .expect(200);
    expect(data(step1)).toMatchObject({
      totpSetupRequired: false,
      passkeyAvailable: true,
    });
    const ticket = data(step1).ticket as string;

    // A stranger's key is a wrong second factor: counted like a wrong code.
    const stranger = new FakeAuthenticator(origin, rpId);
    const wrongOpts = await api()
      .post('/api/v1/admin/auth/login/passkey/options')
      .send({ ticket })
      .expect(200);
    const wrong = await api()
      .post('/api/v1/admin/auth/login/passkey')
      .send({
        ticket,
        challengeId: data(wrongOpts).challengeId,
        response: stranger.get(
          data(wrongOpts).options as Record<string, unknown>,
        ),
      })
      .expect(401);
    expect(code(wrong)).toBe('PASSKEY_INVALID');
    expect((wrong.body as Body).error?.details).toEqual({
      remainingAttempts: 4,
    });

    const loginOpts = await api()
      .post('/api/v1/admin/auth/login/passkey/options')
      .send({ ticket })
      .expect(200);
    const session = await api()
      .post('/api/v1/admin/auth/login/passkey')
      .send({
        ticket,
        challengeId: data(loginOpts).challengeId,
        response: authenticator.get(
          data(loginOpts).options as Record<string, unknown>,
        ),
      })
      .expect(200);
    const auth = {
      Authorization: `Bearer ${data(session).accessToken as string}`,
    };
    expect(data(session).admin).toMatchObject({ email: s.email });
    // The ticket is gone with the session.
    const reused = await api()
      .post('/api/v1/admin/auth/login/passkey/options')
      .send({ ticket })
      .expect(401);
    expect(code(reused)).toBe('ADMIN_TICKET_INVALID');
    const logins = await prisma.auditLog.findMany({
      where: { admin_id: s.userId, action: 'admin.login' },
      orderBy: { created_at: 'asc' },
    });
    expect(
      logins.map((l) => (l.after as { method: string } | null)?.method),
    ).toEqual(['totp_setup', 'passkey']);

    // Step-up with the passkey, then a step-up-gated action succeeds.
    const stillGated = await api()
      .delete(`/api/v1/admin/auth/passkeys/${passkeyId}`)
      .set(auth)
      .expect(403);
    expect(code(stillGated)).toBe('ADMIN_STEP_UP_REQUIRED');
    const suOpts = await api()
      .post('/api/v1/admin/auth/step-up/passkey/options')
      .set(auth)
      .expect(200);
    const su = await api()
      .post('/api/v1/admin/auth/step-up/passkey')
      .set(auth)
      .send({
        challengeId: data(suOpts).challengeId,
        response: authenticator.get(
          data(suOpts).options as Record<string, unknown>,
        ),
      })
      .expect(200);
    expect(data(su)).toEqual({ validForSeconds: 300 });
    await api()
      .delete(`/api/v1/admin/auth/passkeys/${passkeyId}`)
      .set(auth)
      .expect(200);
    const after = await api()
      .get('/api/v1/admin/auth/me')
      .set(auth)
      .expect(200);
    expect(data(after)).toMatchObject({ passkeyCount: 0 });

    // The recovery codes still work (the authenticator setup is untouched).
    const step1b = await api()
      .post('/api/v1/admin/auth/login/password')
      .send({ login: e2eLogin(s.email), password: E2E_ADMIN_PASSWORD })
      .expect(200);
    expect(data(step1b)).toMatchObject({ passkeyAvailable: false });
    await api()
      .post('/api/v1/admin/auth/recovery')
      .send({ ticket: data(step1b).ticket, recoveryCode: s.recoveryCodes[0] })
      .expect(200);
  });
});
