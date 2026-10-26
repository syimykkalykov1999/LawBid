import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-26: the profile post counter must follow deletes (it kept
 * the old number, and later additions counted on top of it). */
jest.setTimeout(120_000);

describe('Profile post counter (e2e)', () => {
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
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Cnt', last_name: 'Fix' },
    });
    const username = `cf${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, h: auth(u.id, 'attorney') };
  }
  const mkPost = async (h: Record<string, string>) => {
    const r = await api()
      .post('/api/v1/posts')
      .set(h)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'T',
        practiceCode: 'family_law',
        body: `Counter test ${randomUUID()}`,
      });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('published');
    return r.body.data.id as string;
  };
  const shown = async (h: Record<string, string>) =>
    (await api().get('/api/v1/attorneys/me/profile').set(h)).body.data.counters
      .posts as number;

  it('3 posts, delete 1 -> 2; add one more -> 3 (not 4)', async () => {
    const a = await attorney();
    const ids = [await mkPost(a.h), await mkPost(a.h), await mkPost(a.h)];
    expect(await shown(a.h)).toBe(3);
    const del = await api().delete(`/api/v1/posts/${ids[0]}`).set(a.h);
    expect(del.status).toBe(200);
    expect(await shown(a.h)).toBe(2);
    await mkPost(a.h);
    expect(await shown(a.h)).toBe(3);
    // after the flush into the table the number is the same
    await app.get(CounterAggregator).flush();
    expect(await shown(a.h)).toBe(3);
  });

  it('drift sweep repairs a counter that was already wrong', async () => {
    const a = await attorney();
    await mkPost(a.h);
    await mkPost(a.h);
    await app.get(CounterAggregator).flush();
    await prisma.attorneyProfile.update({
      where: { user_id: a.id },
      data: { posts_count: 9 },
    });
    expect(await shown(a.h)).toBe(9);
    const r = await app.get(CounterAggregator).driftSweep(100_000);
    expect(r.fixed).toBeGreaterThanOrEqual(1);
    expect(await shown(a.h)).toBe(2);
  });
});
