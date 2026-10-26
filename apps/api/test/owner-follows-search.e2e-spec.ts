import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-18: followers / following lists have a search box —
 * `?q=` matches the name in any alphabet («Эмили» = Emily) or @username.
 */
jest.setTimeout(120_000);

describe('Followers / following search (e2e, owner 2026-10-18)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney(first?: string, last?: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: last },
    });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    return { id: u.id, handle };
  }

  async function client(first: string, last: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: last },
    });
    const handle = `cl${randomUUID().slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        username: handle,
        username_lower: handle,
      },
    });
    return { id: u.id, handle };
  }

  it('narrows the followers and following lists by name or @username', async () => {
    const star = await attorney('Star', 'Lawyer');
    const emily = await client('Emily', 'Zvorykina');
    const bob = await client('Bob', 'Stone');
    const anna = await attorney('Anna', 'Petrova');
    await prisma.follow.createMany({
      data: [
        { follower_id: emily.id, followee_id: star.id },
        { follower_id: bob.id, followee_id: star.id },
        { follower_id: anna.id, followee_id: star.id },
      ],
    });
    const viewer = bearer(bob.id, 'client');
    const ids = async (path: string, q?: string) => {
      const res = await api()
        .get(path)
        .query(q === undefined ? {} : { q })
        .set(viewer)
        .expect(200);
      return (
        res.body as {
          data: {
            attorney: { id: string } | null;
            client: { id: string } | null;
          }[];
        }
      ).data
        .map((i) => i.attorney?.id ?? i.client?.id)
        .sort();
    };
    const url = `/api/v1/attorneys/${star.id}/followers`;
    expect(await ids(url)).toEqual([emily.id, bob.id, anna.id].sort());
    // Cyrillic query finds the Latin name; word order does not matter.
    expect(await ids(url, 'Эмили')).toEqual([emily.id]);
    expect(await ids(url, 'zvorykina emily')).toEqual([emily.id]);
    // @username prefix (leading @ ignored), client and attorney alike.
    expect(await ids(url, `@${bob.handle}`)).toEqual([bob.id]);
    expect(await ids(url, anna.handle.slice(0, 6))).toContain(anna.id);
    expect(await ids(url, 'Анна Петрова')).toEqual([anna.id]);
    expect(await ids(url, 'nobody-here')).toEqual([]);

    // The following side: whom Emily follows.
    await prisma.follow.createMany({
      data: [
        { follower_id: star.id, followee_id: anna.id },
        { follower_id: star.id, followee_id: bob.id },
      ],
    });
    const following = `/api/v1/attorneys/${star.id}/following`;
    expect(await ids(following)).toEqual([anna.id, bob.id].sort());
    expect(await ids(following, 'Анна')).toEqual([anna.id]);
    expect(await ids(following, 'Эмили')).toEqual([]);

    // My own following list (attorneys only) takes the same q.
    const mine = await api()
      .get('/api/v1/users/me/following')
      .query({ q: 'Анна' })
      .set(bearer(star.id, 'attorney'))
      .expect(200);
    expect(
      (mine.body as { data: { id: string }[] }).data.map((x) => x.id),
    ).toEqual([anna.id]);

    // Validation.
    await api().get(url).query({ q: ' ' }).set(viewer).expect(400);
    await api()
      .get(url)
      .query({ q: 'x'.repeat(101) })
      .set(viewer)
      .expect(400);
  });
});
