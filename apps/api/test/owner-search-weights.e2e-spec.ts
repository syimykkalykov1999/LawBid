import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-15: the search ranking weights are editable in the admin
 * panel. People: priority / verified / rating add up to one score; with the
 * defaults a verified attorney beats a better-rated unverified one, and a
 * heavier rating weight flips that.
 */
jest.setTimeout(60_000);

describe('Search ranking weights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'search.weight_' } },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  const as = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  it('a heavier rating weight puts the better-rated attorney first', async () => {
    // Start from the defaults whatever an earlier suite left behind.
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'search.weight_' } },
    });
    await redis.del('config:app_config');
    // The stem uses the letters a-f only and the two names end in y / z: the
    // trigram similarity that is compared before the weights is then the
    // same for both (a suffix letter that also sits in the stem made one
    // name a little closer to the query, and the test flaked on a random
    // stem).
    const stem = `wgt${randomUUID()
      .replace(/[^a-f]/g, '')
      .slice(0, 5)}`;
    const make = async (
      suffix: string,
      verified: boolean,
      rating: number,
    ): Promise<string> => {
      const u = await prisma.user.create({ data: { role: 'attorney' } });
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `${stem}${suffix}`,
          username_lower: `${stem}${suffix}`,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'pending',
          rating_avg: rating,
        },
      });
      return u.id;
    };
    const verifiedId = await make('y', true, 0);
    const ratedId = await make('z', false, 5);
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const order = async (minRating?: number) => {
      const r = await request(base)
        .get('/api/v1/search/attorneys')
        .query({ q: stem, minRating })
        .set(as(viewer.id, 'client'));
      expect(r.status).toBe(200);
      return (r.body.data as { id: string }[]).map((x) => x.id);
    };

    // Defaults: verified 100 beats 5 stars x 10 = 50.
    expect((await order()).indexOf(verifiedId)).toBeLessThan(
      (await order()).indexOf(ratedId),
    );

    await prisma.appConfig.upsert({
      where: { key: 'search.weight_rating' },
      create: { key: 'search.weight_rating', value: 100 },
      update: { value: 100 },
    });
    await redis.del('config:app_config');
    // (A ranked list is cached per query: another filter = a fresh list.)
    const flipped = await order(0);
    expect(flipped.indexOf(ratedId)).toBeLessThan(flipped.indexOf(verifiedId));
  });
});
