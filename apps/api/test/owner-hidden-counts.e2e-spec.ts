import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-15: the author hides the like / view counter, others see 0
 * and a "hidden" flag, the author still sees the real numbers. */
jest.setTimeout(120_000);

describe('Hidden counters (e2e)', () => {
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

  it('hides likes and views from others, not from the author', async () => {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Hid', last_name: 'Den' },
    });
    const username = `hd${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const author = auth(u.id, 'attorney');
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const v = auth(viewer.id, 'client');
    const made = await api()
      .post('/api/v1/posts')
      .set(author)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'T', practiceCode: 'family_law', body: 'Counters test' });
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;
    await prisma.post.update({
      where: { id },
      data: { like_count: 41, view_count: 99 },
    });

    const open = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(open.body.data).toMatchObject({
      likeCount: 41,
      viewCount: 99,
      likesHidden: false,
      viewsHidden: false,
    });

    const patched = await api()
      .patch(`/api/v1/posts/${id}/counters`)
      .set(author)
      .send({ hideLikes: true, hideViews: true });
    expect(patched.status).toBe(200);

    const hidden = await api().get(`/api/v1/posts/${id}`).set(v);
    expect(hidden.body.data).toMatchObject({
      likeCount: 0,
      viewCount: 0,
      likesHidden: true,
      viewsHidden: true,
    });
    const mine = await api().get(`/api/v1/posts/${id}`).set(author);
    expect(mine.body.data).toMatchObject({
      likeCount: 41,
      viewCount: 99,
      likesHidden: true,
    });

    // The viewer's own setting is stored on the account.
    const me = await api()
      .patch('/api/v1/users/me')
      .set(v)
      .send({ hideLikeCounts: true });
    expect(me.status).toBe(200);
    expect(me.body.data.hideLikeCounts).toBe(true);
  });
});
