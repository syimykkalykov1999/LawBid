import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostsService } from '../src/modules/posts/posts.service';
import { type RequestUser } from '../src/modules/auth/decorators/current-user.decorator';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-18: the "Family law" filter found nothing because posts
 * carry `practice_area_id` (a leaf, e.g. family_law.divorce) but not always
 * the hidden `~family_law` tags. A category must match its leaves, a leaf
 * only itself — in search, the explore grid and reels.
 */
jest.setTimeout(120_000);

describe('Posts / people filters: category -> leaf matching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';
  let leaf2Id = '';

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
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_pf_cat' },
      create: {
        code: 'e2e_pf_cat',
        name_en: 'Filters cat',
        i18n_key: 'practice.e2e_pf_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_pf_cat.leaf' },
      create: {
        code: 'e2e_pf_cat.leaf',
        parent_id: cat.id,
        name_en: 'Filters leaf',
        i18n_key: 'practice.e2e_pf_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
    const leaf2 = await prisma.practiceArea.upsert({
      where: { code: 'e2e_pf_cat.other' },
      create: {
        code: 'e2e_pf_cat.other',
        parent_id: cat.id,
        name_en: 'Filters other',
        i18n_key: 'practice.e2e_pf_cat.other',
        sort: 2,
      },
      update: {},
    });
    leaf2Id = leaf2.id;
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
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function viewer() {
    const u = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
    return Object.assign(auth(u.id, 'client'), { id: u.id });
  }

  async function author() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `pf${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    return { id: u.id, handle };
  }

  it('posts: a category matches its leaves, a leaf only itself (no hidden tags needed)', async () => {
    const a = await author();
    const word = `zq${randomUUID().slice(0, 8)}`;
    const mk = (practice: string | null, title: string) =>
      prisma.post.create({
        data: {
          author_id: a.id,
          body: `Post about ${word} ${title}`,
          title,
          practice_area_id: practice,
          content_class: 'legal',
        },
      });
    const inLeaf = await mk(leafId, 'in leaf');
    const inOther = await mk(leaf2Id, 'in other');
    const none = await mk(null, 'no qualification');
    const v = await viewer();
    const ids = async (path: string) =>
      (
        (await api().get(`/api/v1${path}`).set(v)).body.data as {
          id: string;
        }[]
      ).map((x) => x.id);
    const sorted = (xs: string[]) => [...xs].sort();

    // text search
    expect(sorted(await ids(`/search/posts?q=${word}`))).toEqual(
      sorted([inLeaf.id, inOther.id, none.id]),
    );
    expect(
      sorted(await ids(`/search/posts?q=${word}&practice=e2e_pf_cat`)),
    ).toEqual(sorted([inLeaf.id, inOther.id]));
    expect(
      await ids(`/search/posts?q=${word}&practice=e2e_pf_cat.leaf`),
    ).toEqual([inLeaf.id]);
    expect(
      await ids(`/search/posts?q=${word}&practice=e2e_pf_cat.other`),
    ).toEqual([inOther.id]);
    expect(await ids(`/search/posts?q=${word}&practice=nope_cat`)).toEqual([]);
    // combined with state + period + briefs + sort
    expect(
      sorted(
        await ids(
          `/search/posts?q=${word}&practice=e2e_pf_cat&state=NY&period=24h&briefsOnly=true&sort=newest`,
        ),
      ),
    ).toEqual(sorted([inLeaf.id, inOther.id]));
    expect(
      await ids(`/search/posts?q=${word}&practice=e2e_pf_cat&state=CA`),
    ).toEqual([]);
    expect(
      await ids(`/search/posts?q=${word}&practice=e2e_pf_cat&withPhotos=true`),
    ).toEqual([]);

    // explore grid (empty query + filter)
    const latest = `/search/latest-posts?state=NY`;
    for (const sort of ['newest', 'popular', 'for_you']) {
      const got = await ids(`${latest}&practice=e2e_pf_cat&sort=${sort}`);
      expect(got).toEqual(expect.arrayContaining([inLeaf.id, inOther.id]));
      expect(got).not.toContain(none.id);
      const leafOnly = await ids(
        `${latest}&practice=e2e_pf_cat.leaf&sort=${sort}`,
      );
      expect(leafOnly).toContain(inLeaf.id);
      expect(leafOnly).not.toContain(inOther.id);
    }
    const multi = await ids(`${latest}&practices=e2e_pf_cat.other,nope_cat`);
    expect(multi).toContain(inOther.id);
    expect(multi).not.toContain(inLeaf.id);
    expect(await ids(`${latest}&practice=e2e_pf_cat&period=7d`)).toEqual(
      expect.arrayContaining([inLeaf.id]),
    );
  });

  it('explore / feed topic filters: news, general, my topics, cursor, reels', async () => {
    const a = await author();
    const mk = (data: Record<string, unknown>) =>
      prisma.post.create({
        data: {
          author_id: a.id,
          body: 'Topic filters audit post',
          content_class: 'legal',
          ...data,
        } as never,
      });
    const leafPosts = [];
    for (let i = 0; i < 3; i++) {
      leafPosts.push(await mk({ practice_area_id: leafId }));
    }
    const news = await mk({ practice_area_id: leaf2Id, kind: 'news' });
    const general = await mk({
      practice_area_id: null,
      content_class: 'general',
    });
    const video = await prisma.videoAsset.create({
      data: {
        owner_user_id: a.id,
        library_id: 'e2e',
        external_id: `e2e-${randomUUID()}`,
        status: 'ready',
        upload_expires_at: new Date(),
        ready_at: new Date(),
      },
    });
    const reel = await mk({
      practice_area_id: leafId,
      video_asset_id: video.id,
    });
    const v = await viewer();
    const get = async (path: string) =>
      (await api().get(`/api/v1${path}`).set(v)).body as {
        data: { id: string }[];
        meta: { nextCursor: string | null };
      };
    const ids = async (path: string) => (await get(path)).data.map((x) => x.id);

    // kind=news + category
    expect(
      await ids('/search/latest-posts?kind=news&practice=e2e_pf_cat'),
    ).toEqual([news.id]);
    // general posts (the "Posts" topic)
    expect(await ids('/search/latest-posts?contentClass=general')).toContain(
      general.id,
    );
    expect(await ids('/search/latest-posts?contentClass=legal')).not.toContain(
      general.id,
    );
    // my topics: several categories / leaves
    const mine = await ids(
      '/search/latest-posts?practices=e2e_pf_cat.other,nope_cat',
    );
    expect(mine).toContain(news.id);
    expect(mine).not.toContain(leafPosts[0].id);
    // cursor: 2 pages of the category (newest) never repeat or lose a post
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 6; page++) {
      const r = await get(
        `/search/latest-posts?practice=e2e_pf_cat${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      seen.push(...r.data.map((x) => x.id));
      cursor = r.meta.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const p of [...leafPosts, news, reel]) expect(seen).toContain(p.id);
    // reels (HTTP route is behind the video switch): service level
    const reels = async (practice: string) =>
      (
        await app
          .get(PostsService)
          .listReels({ sub: v.id, role: 'client' } as RequestUser, { practice })
      ).items.map((x) => x.id);
    expect(await reels('e2e_pf_cat')).toContain(reel.id);
    expect(await reels('e2e_pf_cat.leaf')).toContain(reel.id);
    expect(await reels('e2e_pf_cat.other')).not.toContain(reel.id);
  });

  it('people: category practice id matches attorneys of its leaves', async () => {
    const a = await author();
    const cat = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'e2e_pf_cat' },
    });
    const v = await viewer();
    const byCat = await api()
      .get(
        `/api/v1/search/people?q=${a.handle}&role=attorney&practiceAreaId=${cat.id}`,
      )
      .set(v);
    expect(byCat.body.data).toHaveLength(1);
    const byOther = await api()
      .get(
        `/api/v1/search/people?q=${a.handle}&role=attorney&practiceAreaId=${leaf2Id}`,
      )
      .set(v);
    expect(byOther.body.data).toHaveLength(0);
  });

  it('seeded dev data: a Family law post is found by the category filter', async () => {
    const fam = await prisma.post.findFirst({
      where: {
        practice_area: { code: { startsWith: 'family_law.' } },
        status: 'published',
      },
    });
    if (!fam) return; // clean database: nothing seeded
    const v = await viewer();
    const res = await api()
      .get('/api/v1/search/latest-posts?practice=family_law&contentClass=legal')
      .set(v);
    expect(res.status).toBe(200);
    const all = await api()
      .get('/api/v1/search/latest-posts?practice=family_law')
      .set(v);
    expect(all.body.data.length).toBeGreaterThan(0);
  });
});
