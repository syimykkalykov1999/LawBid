import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-15: search works like a search engine: a word in the title
 * outranks one in the text, the last word is a prefix, accents don't matter,
 * a typo still finds the case, and the field suggests while typing.
 */
jest.setTimeout(120_000);

describe('Search engine behaviour (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  // A unique word per run (the e2e DB is reused); letters only so it is a
  // single token.
  const w = `zorb${randomUUID()
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
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string, role: 'client' | 'attorney') => ({
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
      data: { role: 'attorney', first_name: 'Eng', last_name: 'Ine' },
    });
    const username = `eng${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NJ',
        bar_number: `E${randomUUID().slice(0, 10)}`,
        license_status: 'verified',
      },
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'search_engine_e2e' },
      create: {
        code: 'search_engine_e2e',
        name_en: 'Search engine e2e',
        i18n_key: 'practice.search_engine_e2e',
        sort: 1,
      },
      update: {},
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: area.id },
    });
    return {
      id: u.id,
      username,
      areaId: area.id,
      auth: auth(u.id, 'attorney'),
    };
  }

  async function kase(
    areaId: string,
    title: string,
    description: string,
  ): Promise<string> {
    const owner = await prisma.user.create({ data: { role: 'client' } });
    const c = await prisma.case.create({
      data: {
        client_id: owner.id,
        title,
        description,
        practice_area_id: areaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  const ids = (body: { data: { id: string }[] }) => body.data.map((x) => x.id);

  it('cases: a word in the title outranks a word in the text; the last word is a prefix', async () => {
    const att = await attorney();
    const inText = await kase(
      att.areaId,
      'A plain speeding matter',
      `They mention ${w} only in the description of this case, nothing else.`,
    );
    const inTitle = await kase(
      att.areaId,
      `${w} deposit dispute`,
      'The title carries the word.',
    );
    const r = await api()
      .get('/api/v1/search/cases')
      .query({ q: w })
      .set(att.auth);
    expect(r.status).toBe(200);
    expect(ids(r.body)).toEqual([inTitle, inText]);

    const prefix = await api()
      .get('/api/v1/search/cases')
      .query({ q: w.slice(0, w.length - 2) })
      .set(att.auth);
    expect(ids(prefix.body)).toEqual(expect.arrayContaining([inTitle, inText]));
  });

  it('cases and posts: accents are ignored and a typo still finds the title', async () => {
    const att = await attorney();
    const accent = await kase(att.areaId, `Café ${w}x contract`, 'Some text.');
    const r = await api()
      .get('/api/v1/search/cases')
      .query({ q: `cafe ${w}x` })
      .set(att.auth);
    expect(ids(r.body)).toContain(accent);

    const typoCase = await kase(
      att.areaId,
      `Immigration visa ${w}y lawyer needed`,
      'Plain.',
    );
    const typo = await api()
      .get('/api/v1/search/cases')
      .query({ q: `imigration vsa ${w}y` })
      .set(att.auth);
    expect(ids(typo.body)).toContain(typoCase);

    const post = await prisma.post.create({
      data: {
        author_id: att.id,
        title: `Divorce checklist ${w}z`,
        body: 'Steps before you file.',
      },
    });
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const found = await api()
      .get('/api/v1/search/posts')
      .query({ q: `divorse checklist ${w}z` })
      .set(auth(viewer.id, 'client'));
    expect(found.status).toBe(200);
    expect(ids(found.body)).toContain(post.id);
  });

  it('suggest: topics, handles and practices by prefix', async () => {
    const att = await attorney();
    const r = await api()
      .get('/api/v1/search/suggest')
      .query({ q: att.username.slice(0, 7) })
      .set(att.auth);
    expect(r.status).toBe(200);
    const items = r.body.data as { kind: string; text: string }[];
    expect(items).toEqual(
      expect.arrayContaining([{ kind: 'person', text: att.username }]),
    );
  });
});
