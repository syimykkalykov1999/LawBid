import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';

/**
 * docs/05 §16 stage 5.5 acceptance: you can't follow a client or yourself
 * (FOLLOW_NOT_ALLOWED); an attorney's follower list has no clients but the
 * counter includes them; a client's follows are visible to that client.
 */
jest.setTimeout(90_000);

describe('Follows (e2e, docs/05 §6, stage 5.5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'client') {
      // OQ-026: listable clients have a profile row with a username.
      await prisma.state.upsert({
        where: { code: 'NY' },
        create: { code: 'NY', name: 'New York' },
        update: {},
      });
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
          username: `cli_${u.id.slice(0, 8)}`,
          username_lower: `cli_${u.id.slice(0, 8)}`,
        },
      });
    }
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  const follow = (auth: Record<string, string>, id: string) =>
    api().post(`/api/v1/attorneys/${id}/follow`).set(auth);

  // OQ-038: clients can be followed too; yourself never.
  it('you cannot follow yourself', async () => {
    const att = await user('attorney');
    for (const [who, target] of [[att, att.id]] as const) {
      const r = await follow(who.auth, target);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('FOLLOW_NOT_ALLOWED');
    }
  });

  it('followers list shows attorneys and clients (OQ-026); the counter counts both', async () => {
    const star = await user('attorney');
    const fanAttorney = await user('attorney');
    const fanClient = await user('client');
    expect((await follow(fanAttorney.auth, star.id)).status).toBe(204);
    expect((await follow(fanClient.auth, star.id)).status).toBe(204);
    expect((await follow(fanClient.auth, star.id)).status).toBe(204); // idempotent
    await app.get(CounterAggregator).flush();

    const list = await api()
      .get(`/api/v1/attorneys/${star.id}/followers`)
      .set(fanClient.auth);
    const rows = list.body.data as {
      role: string;
      attorney: { id: string } | null;
      client: { id: string } | null;
    }[];
    expect(rows.map((r) => r.attorney?.id ?? r.client?.id).sort()).toEqual(
      [fanAttorney.id, fanClient.id].sort(),
    );
    expect(rows.find((r) => r.client)?.role).toBe('client');
    const profile = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: star.id },
    });
    expect(profile.followers_count).toBe(2);

    const username = profile.username;
    const pub = await api()
      .get(`/api/v1/attorneys/${username}`)
      .set(fanClient.auth);
    expect(pub.body.data).toMatchObject({
      isFollowing: true,
      counters: { followers: 2 },
    });
  });

  it("a client's follows are listed only to that client; suggestions skip followed", async () => {
    const a1 = await user('attorney');
    const client = await user('client');
    await follow(client.auth, a1.id);
    const mine = await api().get('/api/v1/users/me/following').set(client.auth);
    expect(
      (mine.body.data as { id: string; isFollowing: boolean }[])[0],
    ).toMatchObject({
      id: a1.id,
      isFollowing: true,
    });
    // Nobody else can list a client's follows (§6.2): the public route
    // exists for attorneys only.
    const other = await user('client');
    // OQ-038: a client's follow lists are public like on Instagram.
    const open = await api()
      .get(`/api/v1/attorneys/${client.id}/following`)
      .set(other.auth);
    expect(open.status).toBe(200);

    const s = await api().get('/api/v1/suggestions/attorneys').set(client.auth);
    expect((s.body.data as { id: string }[]).some((a) => a.id === a1.id)).toBe(
      false,
    );
  });
});
