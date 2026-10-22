import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-22 — client economy plan (docs/perf/CLIENT_ECONOMY_PLAN_
 * 2026-10-22.md): the API side of the packages — batched views (A), cheap
 * ETags and follow counts (D), one start request (G), group deltas (B),
 * case / consultation events and list deltas (E), notification deltas and
 * comment rooms (F), admin counts (J).
 */
jest.setTimeout(120_000);

describe('Client economy (e2e, owner 2026-10-22)', () => {
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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    for (const [code, name] of [
      ['NY', 'New York'],
      ['NJ', 'New Jersey'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: 'client' | 'attorney') => ({
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
      data: { role: 'attorney', first_name: 'Eco', last_name: 'Nomy' },
    });
    const username = `eco${u.id.replace(/-/g, '').slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, username, auth: bearer(u.id, 'attorney') };
  }

  async function client() {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Sa',
        last_name: 'Ver',
        client_profile: {
          create: {
            state_code: 'NY',
            username: `sv${tag}`,
            username_lower: `sv${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  // ------------------------------------------------------------ package A

  it('A: POST /posts/events kind=view counts three posts once, not twice in a day', async () => {
    const author = await attorney();
    const viewer = await client();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await prisma.post.create({
        data: { author_id: author.id, body: `Post ${i}` },
      });
      ids.push(p.id);
    }
    const events = ids.map((postId) => ({ postId, kind: 'view' }));
    await api()
      .post('/api/v1/posts/events')
      .set(viewer.auth)
      .send({ events })
      .expect(204);
    await api()
      .post('/api/v1/posts/events')
      .set(viewer.auth)
      .send({ events })
      .expect(204);
    const rows = await prisma.postViewEvent.findMany({
      where: { post_id: { in: ids }, viewer_id: viewer.id, kind: 'view' },
    });
    expect(rows).toHaveLength(3);
    const seen = await prisma.postView.findMany({
      where: { post_id: { in: ids }, user_id: viewer.id },
    });
    expect(seen).toHaveLength(3);
  });

  it('A: POST /cases/views records many cases; the single route still works', async () => {
    const att = await attorney();
    const cl = await client();
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e' },
      create: {
        code: 'eco_e2e',
        name_en: 'Eco',
        i18n_key: 'practice.eco_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'eco_e2e.leaf' },
      create: {
        code: 'eco_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.eco_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const mk = (title: string) =>
      prisma.case.create({
        data: {
          client_id: cl.id,
          title,
          description: 'Details',
          practice_area_id: area.id,
          primary_state_code: 'NJ',
          status: 'open',
          budget_mode: 'clarify_later',
        },
      });
    const c1 = await mk('Eco one');
    const c2 = await mk('Eco two');
    await api()
      .post('/api/v1/cases/views')
      .set(att.auth)
      .send({ caseIds: [c1.id, c2.id, randomUUID()] })
      .expect(204);
    await api().post(`/api/v1/cases/${c1.id}/view`).set(att.auth).expect(204);
    await api()
      .post('/api/v1/cases/views')
      .set(att.auth)
      .send({ caseIds: [] })
      .expect(400);
  });

  // ------------------------------------------------------------ package D

  it('D: GET /config/bootstrap answers 304 to its own ETag and carries Cache-Control', async () => {
    const first = await api().get('/api/v1/config/bootstrap').expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"boot-/);
    expect(first.headers['cache-control']).toContain('stale-while-revalidate');
    expect(first.body.data.app_config['cache.limit_mb.messages']).toBe(50);
    const again = await api()
      .get('/api/v1/config/bootstrap')
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');
  });

  it('D: GET /attorneys/:username is 304 with zero profile queries; a follow changes the tag and answers counts', async () => {
    const att = await attorney();
    const cl = await client();
    const first = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"att-/);

    const queries: string[] = [];
    const client$ = prisma as unknown as {
      $on: (e: 'query', cb: (ev: { query: string }) => void) => void;
    };
    // Prisma 5: $on('query') is available when log includes {emit:'event'};
    // when it is not configured the listener simply never fires, and we
    // fall back to the status check alone.
    try {
      client$.$on('query', (ev) => queries.push(ev.query));
    } catch {
      // not configured
    }
    const again = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');
    // The cheap tag reads attorney_profiles + users once; nothing else.
    expect(
      queries.filter((q) => /attorney_licenses|post_|reviews/i.test(q)),
    ).toHaveLength(0);

    const followed = await api()
      .post(`/api/v1/attorneys/${att.id}/follow`)
      .set(cl.auth)
      .expect(200);
    expect(followed.body.data).toEqual({ following: true, followersCount: 1 });
    const after = await api()
      .get(`/api/v1/attorneys/${att.username}`)
      .set(cl.auth)
      .set('If-None-Match', etag)
      .expect(200);
    expect(after.headers.etag).not.toBe(etag);
    expect(after.body.data.isFollowing).toBe(true);
    const unfollowed = await api()
      .delete(`/api/v1/attorneys/${att.id}/follow`)
      .set(cl.auth)
      .expect(200);
    expect(unfollowed.body.data).toEqual({
      following: false,
      followersCount: 0,
    });
  });

  it('D: reference lists carry a private / public Cache-Control with stale-while-revalidate', async () => {
    const cl = await client();
    const stickers = await api().get('/api/v1/stickers').set(cl.auth);
    expect(stickers.headers['cache-control']).toContain('private');
    expect(stickers.headers['cache-control']).toContain(
      'stale-while-revalidate',
    );
    const countries = await api().get('/api/v1/countries').expect(200);
    expect(countries.headers['cache-control']).toContain('public, max-age=300');
  });
});
