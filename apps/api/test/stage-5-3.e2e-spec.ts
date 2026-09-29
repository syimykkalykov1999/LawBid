import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeedRecoJob } from '../src/modules/feed/feed-reco.job';

/**
 * docs/05 §16 stage 5.3 acceptance: a user without follows gets
 * recommendations; with follows every 4th item is a recommendation; pages
 * have no duplicates; suspended attorneys' posts never appear.
 */
jest.setTimeout(90_000);

describe('Feed (e2e, docs/05 §2.2, stage 5.3)', () => {
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

  async function posts(authorId: string, n: number, likes = 0) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await prisma.post.create({
        data: {
          author_id: authorId,
          body: `Post ${i} by ${authorId.slice(0, 6)}`,
          like_count: likes,
          created_at: new Date(Date.now() - i * 60_000),
        },
      });
      ids.push(p.id);
    }
    return ids;
  }

  const feed = async (auth: Record<string, string>, cursor?: string) => {
    const r = await api()
      .get('/api/v1/feed')
      .query({ limit: 12, ...(cursor ? { cursor } : {}) })
      .set(auth);
    expect(r.status).toBe(200);
    return {
      ids: (r.body.data as { id: string; author: { id: string } }[]).map(
        (p) => p.id,
      ),
      authors: (r.body.data as { author: { id: string } }[]).map(
        (p) => p.author.id,
      ),
      next: r.body.meta?.nextCursor as string | null,
    };
  };

  it('mixes followed posts with every 4th recommendation, without duplicates', async () => {
    const followed = await user('attorney');
    const popular = await user('attorney');
    const suspended = await user('attorney');
    await posts(followed.id, 30);
    await posts(popular.id, 10, 50);
    const hidden = await posts(suspended.id, 5, 500);
    await prisma.attorneyProfile.update({
      where: { user_id: suspended.id },
      data: { verification_status: 'suspended' },
    });
    await app.get(FeedRecoJob).run();

    const reader = await user('client');
    await prisma.follow.create({
      data: { follower_id: reader.id, followee_id: followed.id },
    });

    const all: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const p = await feed(reader.auth, cursor);
      if (page === 0) {
        expect(p.authors[3]).not.toBe(followed.id);
        expect(p.authors.slice(0, 3).every((a) => a === followed.id)).toBe(
          true,
        );
      }
      all.push(...p.ids);
      cursor = p.next ?? undefined;
      if (!cursor) break;
    }
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((id) => hidden.includes(id))).toBe(false);
  });

  it('a user without follows gets recommendations only', async () => {
    const author = await user('attorney');
    const top = await posts(author.id, 3, 1000);
    await app.get(FeedRecoJob).run();
    const reader = await user('client');
    const p = await feed(reader.auth);
    expect(p.ids.length).toBeGreaterThan(0);
    expect(p.ids).toEqual(expect.arrayContaining(top));
  });
});
