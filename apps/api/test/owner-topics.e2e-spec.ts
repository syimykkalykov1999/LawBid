import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { TrendingTagsJob } from '../src/modules/search/trending-tags.job';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-15: topics (hashtags) gather their posts: #Tag / #tag are one
 * topic, the count is the real count of what the topic page lists, a new
 * post is inside at once ("New"), a deleted one leaves, and a topic knows
 * the practice it mostly belongs to (its cover).
 */
jest.setTimeout(120_000);

describe('Topics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const tag = `tpc${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 6)}`;

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
      data: { role: 'attorney', first_name: 'Top', last_name: 'Ic' },
    });
    const username = `tp${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  const publish = (a: { auth: Record<string, string> }, body: string) =>
    api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'T', practiceCode: 'family_law', body });

  it('one topic whatever the case; counts and pages agree; new in, deleted out; cover from its practice', async () => {
    const a = await attorney();
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const v = auth(viewer.id, 'client');
    const p1 = await publish(a, `First #${tag.toUpperCase()} note`);
    const p2 = await publish(a, `Second #${tag} note`);
    const p3 = await publish(
      a,
      `Third #${tag[0].toUpperCase()}${tag.slice(1)}`,
    );
    expect([p1.status, p2.status, p3.status]).toEqual([201, 201, 201]);

    const page = await api()
      .get(`/api/v1/tags/${tag}/posts`)
      .query({ sort: 'new' })
      .set(v);
    expect(page.body.data).toHaveLength(3);

    const found = await api()
      .get('/api/v1/search/tags')
      .query({ q: tag.slice(0, 5) })
      .set(v);
    const row = (
      found.body.data as {
        tag: string;
        postsCount: number;
        categoryCode: string | null;
      }[]
    ).find((t) => t.tag === tag);
    // One tag, three posts, covered by the practice they were written in.
    expect(row?.postsCount).toBe(3);
    expect(row?.categoryCode).toBe('family_law');

    await app.get(TrendingTagsJob).run();
    const trending = await api().get('/api/v1/search/trending-tags').set(v);
    const t = (
      trending.body.data as {
        tag: string;
        postsCount: number;
        categoryCode: string | null;
      }[]
    ).find((x) => x.tag === tag);
    expect(t?.postsCount).toBe(3);
    expect(t?.categoryCode).toBe('family_law');

    // A new post is inside at once ("New"); a deleted one leaves.
    const p4 = await publish(a, `Fourth #${tag}`);
    const after = await api()
      .get(`/api/v1/tags/${tag}/posts`)
      .query({ sort: 'new' })
      .set(v);
    expect(after.body.data).toHaveLength(4);
    expect(after.body.data[0].id).toBe(p4.body.data.id);
    await api().delete(`/api/v1/posts/${p4.body.data.id}`).set(a.auth);
    const gone = await api()
      .get(`/api/v1/tags/${tag}/posts`)
      .query({ sort: 'new' })
      .set(v);
    expect(gone.body.data).toHaveLength(3);
  });
});
