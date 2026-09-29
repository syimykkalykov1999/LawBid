import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { TrendingTagsJob } from '../src/modules/search/trending-tags.job';

/**
 * docs/05 §16 stage 5.6 acceptance: a client never finds clients;
 * suspended attorneys are hidden; case search never returns a case outside
 * the attorney's licenses/practices; EXPLAIN of the main queries uses the
 * docs/02 §5.3 indexes.
 */
jest.setTimeout(120_000);

describe('Search (e2e, docs/05 §7, stage 5.6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  // Unique per run: the e2e DB is reused.
  const token = `zq${randomUUID().replace(/-/g, '').slice(0, 8)}`;

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
    for (const [code, name] of [
      ['NJ', 'New Jersey'],
      ['NY', 'New York'],
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

  const api = () => request(baseUrl);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function attorney(
    username: string,
    name: [string, string],
    status: 'verified' | 'suspended' = 'verified',
  ) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: name[0], last_name: name[1] },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username.toLowerCase(),
        languages: ['en'],
        verification_status: status,
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function client(first: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Client' },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function leaf(code: string): Promise<string> {
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'search_e2e' },
      create: {
        code: 'search_e2e',
        name_en: 'Search e2e',
        i18n_key: 'practice.search_e2e',
        sort: 0,
      },
      update: {},
    });
    const row = await prisma.practiceArea.upsert({
      where: { code: `search_e2e.${code}` },
      create: {
        code: `search_e2e.${code}`,
        parent_id: parent.id,
        name_en: code,
        i18n_key: `practice.search_e2e.${code}`,
        sort: 0,
      },
      update: {},
    });
    return row.id;
  }

  it('attorneys: clients and suspended attorneys are never found; exact @username first', async () => {
    const exact = await attorney(token, ['Plain', 'Name']);
    const byName = await attorney(`${token}_x`, [token, 'Lawyer']);
    const suspended = await attorney(
      `${token}_s`,
      [token, 'Gone'],
      'suspended',
    );
    const hiddenClient = await client(token);
    const viewer = await client('viewer');

    const r = await api()
      .get('/api/v1/search/attorneys')
      .query({ q: `@${token}` })
      .set(viewer.auth);
    expect(r.status).toBe(200);
    const ids = (r.body.data as { id: string }[]).map((a) => a.id);
    expect(ids[0]).toBe(exact.id);
    expect(ids).toContain(byName.id);
    expect(ids).not.toContain(suspended.id);
    expect(ids).not.toContain(hiddenClient.id);
    expect(r.body.data[0]).toMatchObject({
      username: token,
      isFollowing: false,
      practiceI18nKeys: [],
    });

    const short = await api()
      .get('/api/v1/search/attorneys')
      .query({ q: 'a' })
      .set(viewer.auth);
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('SEARCH_QUERY_TOO_SHORT');
  });

  it('cases: only within the attorney licenses and practices; clients get 403', async () => {
    const mine = await leaf('speeding');
    const other = await leaf('divorce');
    const att = await attorney(`${token}_c`, ['Case', 'Finder']);
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att.id,
        state_code: 'NJ',
        bar_number: `NJ-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: mine },
    });
    const owner = await client('owner');
    const mk = async (area: string, state: string) => {
      const c = await prisma.case.create({
        data: {
          client_id: owner.id,
          title: `Ticket ${token}`,
          description: 'Turnpike speeding ticket',
          practice_area_id: area,
          primary_state_code: state,
          budget_mode: 'clarify_later',
          status: 'open',
        },
      });
      await prisma.caseState.create({
        data: { case_id: c.id, state_code: state, is_primary: true },
      });
      return c.id;
    };
    const visible = await mk(mine, 'NJ');
    const wrongState = await mk(mine, 'NY');
    const wrongPractice = await mk(other, 'NJ');

    const r = await api()
      .get('/api/v1/search/cases')
      .query({ q: token, period: '24h' })
      .set(att.auth);
    expect(r.status).toBe(200);
    const ids = (r.body.data as { id: string }[]).map((c) => c.id);
    expect(ids).toEqual([visible]);
    expect(ids).not.toContain(wrongState);
    expect(ids).not.toContain(wrongPractice);

    const c = await client('nosy');
    const denied = await api()
      .get('/api/v1/search/cases')
      .query({ q: token })
      .set(c.auth);
    expect(denied.status).toBe(403);
  });

  it('posts, tags, tag page and trending tags', async () => {
    const author = await attorney(`${token}_p`, ['Post', 'Author']);
    const tag = `${token}tag`;
    for (const body of [
      `Know your rights at a DUI stop ${token} #${tag}`,
      `Second note ${token} #${tag}`,
    ]) {
      const r = await api()
        .post('/api/v1/posts')
        .set(author.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ body });
      expect(r.status).toBe(201);
    }
    const viewer = await client('reader');

    const posts = await api()
      .get('/api/v1/search/posts')
      .query({ q: token })
      .set(viewer.auth);
    expect(posts.status).toBe(200);
    expect(posts.body.data).toHaveLength(2);

    const tags = await api()
      .get('/api/v1/search/tags')
      .query({ q: `#${tag.slice(0, 6)}` })
      .set(viewer.auth);
    expect((tags.body.data as { tag: string }[]).map((t) => t.tag)).toContain(
      tag,
    );

    for (const sort of ['top', 'new']) {
      const page = await api()
        .get(`/api/v1/tags/${tag}/posts`)
        .query({ sort })
        .set(viewer.auth);
      expect(page.status).toBe(200);
      expect(page.body.data).toHaveLength(2);
    }

    await app.get(TrendingTagsJob).run();
    const trending = await api()
      .get('/api/v1/search/trending-tags')
      .set(viewer.auth);
    expect(trending.body.data).toEqual(
      expect.arrayContaining([{ tag, postsCount: 2 }]),
    );
  });

  it('EXPLAIN: trigram and full-text searches use the docs/02 §5.3 indexes', async () => {
    // Background volume so an index is cheaper than a scan.
    await prisma.$executeRaw`
      INSERT INTO users (role, first_name, last_name, updated_at)
      SELECT 'attorney', 'bg' || g, 'person' || g, now()
      FROM generate_series(1, 2000) AS g`;
    await prisma.$executeRaw`
      INSERT INTO attorney_profiles (user_id, username, username_lower, languages, updated_at)
      SELECT id, 'bg_' || substr(id::STRING, 1, 12), 'bg_' || substr(id::STRING, 1, 12), ARRAY['en'], now()
      FROM users WHERE first_name LIKE 'bg%' AND role = 'attorney'
      ON CONFLICT DO NOTHING`;
    for (const t of ['users', 'attorney_profiles', 'posts']) {
      await prisma.$executeRawUnsafe(`ANALYZE ${t}`);
    }
    const plan = async (sql: string) =>
      (
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL optimizer_use_forecasts = off');
          return tx.$queryRawUnsafe<{ info: string }[]>(`EXPLAIN ${sql}`);
        })
      )
        .map((r) => r.info)
        .join('\n');

    expect(
      await plan(
        `SELECT user_id FROM attorney_profiles WHERE username_lower IS NOT NULL AND username_lower % '${token}'`,
      ),
    ).toContain('attorney_profiles_username_trgm_idx');
    expect(
      await plan(
        `SELECT id FROM users WHERE full_name_lower IS NOT NULL AND full_name_lower % '${token} lawyer'`,
      ),
    ).toContain('users_full_name_trgm_idx');
    expect(
      await plan(
        `SELECT id FROM posts WHERE search_tsv @@ plainto_tsquery('english', '${token}')`,
      ),
    ).toContain('posts_search_tsv_idx');
    expect(
      await plan(
        `SELECT id FROM cases WHERE search_tsv @@ plainto_tsquery('english', '${token}')`,
      ),
    ).toContain('cases_search_tsv_idx');
  });
});
