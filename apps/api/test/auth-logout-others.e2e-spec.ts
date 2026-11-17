import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { phoneSignIn } from './support/password-login';

/**
 * R2-A #9 (14.11), expand/contract:
 * - `POST /auth/logout-others` (the new app's «Sign out of other devices»,
 *   Telegram «Terminate all other sessions»): every other session ends, the
 *   caller stays signed in and keeps its web cookie.
 * - `POST /auth/logout-all` keeps its old meaning for the apps already in
 *   the stores: every session ends, the caller's own included.
 */
describe('logout-others / logout-all (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Signs [phone] in on its phone and on the website (one of each may be
   * signed in at a time, owner 2026-10-01); the two access tokens. */
  async function phoneAndWeb(phone: string): Promise<string[]> {
    const out: string[] = [];
    for (const platform of ['ios', 'web']) {
      const res = await phoneSignIn(app, app.getHttpServer(), phone, {
        deviceId: `${platform}-${phone}`,
        platform,
      });
      expect(res.status).toBe(201);
      out.push(res.body.data.accessToken as string);
    }
    return out;
  }

  const userId = async (phone: string) =>
    (
      await prisma.user.findFirstOrThrow({
        where: { phone_e164: phone },
        select: { id: true },
      })
    ).id;

  const live = async (phone: string) =>
    prisma.session.count({
      where: { user_id: await userId(phone), revoked_at: null },
    });

  it('logout-others: the website is signed out, this phone stays', async () => {
    const phone = '+12025558811';
    const [a, b] = await phoneAndWeb(phone);
    expect(await live(phone)).toBe(2);

    const res = await api()
      .post('/api/v1/auth/logout-others')
      .set(bearer(a))
      .expect(200);
    expect(res.body.data).toEqual({ loggedOut: true });
    // This device keeps its session, so no cookie-clearing header.
    expect(String(res.headers['set-cookie'] ?? '')).not.toMatch(
      /Max-Age=0|Expires=Thu, 01 Jan 1970/,
    );

    const list = await api()
      .get('/api/v1/auth/sessions')
      .set(bearer(a))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ isCurrent: true });
    await api().get('/api/v1/auth/sessions').set(bearer(b)).expect(401);
    expect(await live(phone)).toBe(1);
  });

  it('logout-all (old meaning): the website and this phone are both signed out', async () => {
    const phone = '+12025558812';
    const [a, b] = await phoneAndWeb(phone);
    expect(await live(phone)).toBe(2);

    await api().post('/api/v1/auth/logout-all').set(bearer(a)).expect(200);

    for (const t of [a, b]) {
      await api().get('/api/v1/auth/sessions').set(bearer(t)).expect(401);
    }
    expect(await live(phone)).toBe(0);
  });

  it('both need a signed-in caller', async () => {
    await api().post('/api/v1/auth/logout-others').expect(401);
    await api().post('/api/v1/auth/logout-all').expect(401);
  });
});
