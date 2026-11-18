import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

const GOOGLE_AUDIENCE = '123456789012-e2etest.apps.googleusercontent.com';

/**
 * Detective R2B-12 and R2B-9 (14.11), real PostgreSQL + Redis:
 *  - the data-export link needs a fresh X-Reauth-Token, but only from the
 *    app version in `security.export_reauth_min_app_version` on (empty =
 *    today's behaviour); the status is readable without it;
 *  - Google sign-in takes a nonce from POST /auth/social/nonce (once), and
 *    a self-made one only from an app below
 *    `security.google_nonce_min_app_version` (empty = everyone).
 * Only Google's JWKS signature check is faked.
 */
describe('R2B-12 export reauth + R2B-9 server nonce (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let flags: FeatureFlagsService;
  let googlePayload: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_CLIENT_IDS = GOOGLE_AUDIENCE;
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(
      () =>
        Promise.resolve({
          getPayload: () => googlePayload,
        } as unknown as LoginTicket) as never,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokens = app.get(TokenService);
    flags = app.get(FeatureFlagsService);
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const api = () => request(app.getHttpServer());

  async function setSetting(key: string, value: string): Promise<void> {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await dropAppConfigCache(redis);
  }

  // -------------------------------------------------------------------
  describe('data-export link behind reauth (R2B-12)', () => {
    const KEY = 'security.export_reauth_min_app_version';
    let auth: Record<string, string> = {};
    let reauth: () => Record<string, string> = () => ({});
    let exportId = '';

    beforeAll(async () => {
      const tag = randomUUID().slice(0, 8);
      const u = await prisma.user.create({
        data: {
          role: 'client',
          first_name: 'Dana',
          last_name: 'Export',
          email: `export_${tag}@lawbid-e2e.test`,
          email_verified_at: new Date(),
        },
      });
      const sid = randomUUID();
      auth = {
        Authorization: `Bearer ${tokens.signAccessToken({
          sub: u.id,
          role: 'client',
          sid,
          verified: false,
          subscriptionStatus: 'none',
        })}`,
      };
      reauth = () => ({
        'X-Reauth-Token': tokens.signReauthToken({ sub: u.id, sid }),
      });
      const file = await prisma.file.create({
        data: {
          owner_user_id: u.id,
          purpose: 'data_export',
          s3_bucket: 'e2e-exports',
          s3_key: `exports/${u.id}/${tag}.zip`,
          mime: 'application/zip',
          size_bytes: BigInt(22),
          sha256: 'a'.repeat(64),
        },
      });
      exportId = (
        await prisma.dataExportJob.create({
          data: {
            user_id: u.id,
            type: 'user_data',
            status: 'ready',
            file_id: file.id,
            expires_at: new Date(Date.now() + 86_400_000),
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.appConfig.deleteMany({ where: { key: KEY } });
      await dropAppConfigCache(redis);
    });

    const read = (headers: Record<string, string>) =>
      api()
        .get(`/api/v1/users/me/data-export/${exportId}`)
        .set(auth)
        .set(headers);

    it('setting empty: today’s app gets the link without a token', async () => {
      await setSetting(KEY, '');
      const res = await read({ 'X-App-Version': '1.0.0', 'X-Platform': 'ios' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.url).toEqual(
        expect.stringContaining('X-Amz-Signature='),
      );
    });

    it('setting on: an older build still gets it, the new build does not', async () => {
      await setSetting(KEY, '1.1.0');
      const old = await read({ 'X-App-Version': '1.0.0', 'X-Platform': 'ios' });
      expect(old.body.data.url).toEqual(expect.any(String));

      const fresh = await read({
        'X-App-Version': '1.1.0',
        'X-Platform': 'android',
      });
      expect(fresh.status).toBe(200);
      expect(fresh.body.data.status).toBe('ready');
      expect(fresh.body.data.url).toBeNull();

      // No version at all (curl with a stolen access token): no link.
      const bare = await read({});
      expect(bare.body.data.url).toBeNull();
    });

    it('setting on: a fresh reauth token brings the link back, a bad one is 401', async () => {
      await setSetting(KEY, '1.1.0');
      const ok = await read({ 'X-App-Version': '1.1.0', ...reauth() });
      expect(ok.status).toBe(200);
      expect(ok.body.data.url).toEqual(
        expect.stringContaining('X-Amz-Signature='),
      );
      // Not consumed by the read: the same token reads again.
      const token = reauth();
      await read(token).expect(200);
      const again = await read(token);
      expect(again.body.data.url).toEqual(expect.any(String));

      const bad = await read({ 'X-Reauth-Token': 'test-not-a-reauth-token' });
      expect(bad.status).toBe(401);
      expect(bad.body.error.code).toBe('REAUTH_INVALID');
    });
  });

  // -------------------------------------------------------------------
  describe('server-issued Google nonce (R2B-9)', () => {
    const KEY = 'security.google_nonce_min_app_version';

    beforeAll(async () => {
      await prisma.featureFlag.upsert({
        where: { key: 'google_login' },
        create: { key: 'google_login', enabled: true },
        update: { enabled: true },
      });
      await flags.invalidate();
    });

    afterAll(async () => {
      await prisma.appConfig.deleteMany({ where: { key: KEY } });
      await dropAppConfigCache(redis);
    });

    const signIn = (nonce: string, version: string | null) => {
      googlePayload = {
        sub: `google-nonce-${randomUUID()}`,
        nonce,
        email_verified: false,
      };
      const r = api()
        .post('/api/v1/auth/social')
        .send({
          provider: 'google',
          idToken: 'header.payload.sig',
          nonce,
          deviceInfo: { deviceId: `dev-${randomUUID()}` },
        });
      return version ? r.set('X-App-Version', version) : r;
    };

    it('issues a nonce that signs in once, with the rule on', async () => {
      await setSetting(KEY, '1.1.0');
      const issued = await api().post('/api/v1/auth/social/nonce').send();
      expect(issued.status).toBe(200);
      const nonce = issued.body.data.nonce as string;
      expect(nonce.length).toBeGreaterThanOrEqual(43);
      expect(Date.parse(issued.body.data.expiresAt)).toBeGreaterThan(
        Date.now(),
      );

      const first = await signIn(nonce, '1.1.0');
      expect(first.status).toBe(201);
      // The same nonce again (a replayed token + nonce): refused.
      const replay = await signIn(nonce, '1.1.0');
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('AUTH_SOCIAL_TOKEN_INVALID');
    });

    it('a self-made nonce: fine while the setting is empty', async () => {
      await setSetting(KEY, '');
      const res = await signIn(`self-made-${randomUUID()}`, '1.1.0');
      expect(res.status).toBe(201);
    });

    it('a self-made nonce with the rule on: an older build yes, the new one and no version no', async () => {
      await setSetting(KEY, '1.1.0');
      expect((await signIn(`self-made-${randomUUID()}`, '1.0.0')).status).toBe(
        201,
      );
      const fresh = await signIn(`self-made-${randomUUID()}`, '1.1.0');
      expect(fresh.status).toBe(401);
      expect(fresh.body.error.code).toBe('AUTH_SOCIAL_TOKEN_INVALID');
      expect((await signIn(`self-made-${randomUUID()}`, null)).status).toBe(
        401,
      );
    });
  });
});
