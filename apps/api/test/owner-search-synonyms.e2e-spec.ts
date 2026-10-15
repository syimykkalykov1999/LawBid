import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { SearchLogService } from '../src/modules/search/search-log.service';
import { SearchSynonymsService } from '../src/modules/search/search-synonyms.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-15: search that understands everyday words. An admin adds
 * a group of words, a query naming any of them finds cases and attorneys
 * of the topic; what found nothing is listed; clicks teach the search.
 */
jest.setTimeout(120_000);

describe('Search synonyms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const tag = randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 6);
  const code = `syn${tag}`;
  let areaId = '';
  let caseId = '';
  let attorneyId = '';

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
    const area = await prisma.practiceArea.create({
      data: {
        code,
        name_en: `Synonym topic ${tag}`,
        i18n_key: `practice.${code}`,
        sort: 1,
      },
    });
    areaId = area.id;
    const owner = await prisma.user.create({ data: { role: 'client' } });
    const c = await prisma.case.create({
      data: {
        client_id: owner.id,
        title: 'Мне нужна помощь срочно',
        description: 'Подробности ситуации без нужного слова',
        practice_area_id: areaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    caseId = c.id;
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Syn', last_name: 'Onym' },
    });
    attorneyId = att.id;
    const username = `sy${att.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: att.id,
        username,
        username_lower: username,
        languages: ['ru'],
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att.id,
        state_code: 'NJ',
        bar_number: `S${randomUUID().slice(0, 10)}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: areaId },
    });
  });

  afterAll(async () => {
    await prisma.searchSynonymGroup.deleteMany({
      where: { key: { startsWith: `e2e-${tag}` } },
    });
    await app.close();
  });

  const api = () => request(base);
  const as = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const casesFor = async (q: string) => {
    const r = await api()
      .get('/api/v1/search/cases')
      .query({ q })
      .set(as(attorneyId, 'attorney'));
    expect(r.status).toBe(200);
    return (r.body.data as { id: string }[]).map((x) => x.id);
  };
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i += 1) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  it('an admin adds words; they find cases and attorneys of the topic at once', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const word = `хлопокшар${tag}`;
    expect(await casesFor(word)).not.toContain(caseId);

    const created = await api()
      .post('/api/v1/admin/search/synonyms')
      .set(admin.auth)
      .send({
        key: `e2e-${tag}-a`,
        practiceCode: code,
        terms: [
          { lang: 'ru', term: word },
          { lang: 'en', term: `cotton ball dispute ${tag}` },
        ],
      })
      .expect(201);
    expect(created.body.data.practiceCode).toBe(code);

    // The same group answers in the other language, and for people.
    expect(await casesFor(word)).toContain(caseId);
    expect(await casesFor(`cotton ball dispute ${tag}`)).toContain(caseId);
    const client = await prisma.user.create({ data: { role: 'client' } });
    const people = await api()
      .get('/api/v1/search/people')
      .query({ q: word })
      .set(as(client.id, 'client'));
    expect(people.status).toBe(200);
    const found = people.body.data as { attorney: { id: string } | null }[];
    expect(found.map((p) => p.attorney?.id)).toContain(attorneyId);

    const test = await api()
      .get('/api/v1/admin/search/synonyms/test')
      .query({ q: `мне нужен ${word} срочно` })
      .set(admin.auth)
      .expect(200);
    expect(test.body.data.groupKeys).toContain(`e2e-${tag}-a`);
    expect(test.body.data.practiceCodes).toContain(code);

    // Off means off, at once.
    await api()
      .patch(`/api/v1/admin/search/synonyms/${created.body.data.id}`)
      .set(admin.auth)
      .send({ enabled: false })
      .expect(200);
    expect(await casesFor(`${word} выключено`)).not.toContain(caseId);
  });

  it('what found nothing is listed; a new phrase fixes it', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const q = `нетакогослова${tag}`;
    expect(await casesFor(q)).toEqual([]);
    const listed = await waitFor(async () => {
      const r = await api()
        .get('/api/v1/admin/search/no-results')
        .set(admin.auth)
        .expect(200);
      return (r.body.data as { q: string }[]).some((x) => x.q === q);
    });
    expect(listed).toBe(true);

    const group = await api()
      .post('/api/v1/admin/search/synonyms')
      .set(admin.auth)
      .send({
        key: `e2e-${tag}-b`,
        practiceCode: code,
        terms: [{ lang: 'ru', term: 'другое слово' }],
      })
      .expect(201);
    await api()
      .post(`/api/v1/admin/search/synonyms/${group.body.data.id}/terms`)
      .set(admin.auth)
      .send({ lang: 'ru', term: `  Нетакогослова${tag} ` })
      .expect(200);
    // Another spelling of the same query: the first answer was cached.
    expect(await casesFor(`нетакогослова${tag} срочно`)).toContain(caseId);
  });

  it('opened results teach the search: people, not clicks, count', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const q = `странныйзапрос${tag}`;
    const open = async (userId: string, times: number) => {
      for (let i = 0; i < times; i += 1) {
        await api()
          .post('/api/v1/search/clicks')
          .set(as(userId, 'attorney'))
          .send({ q, targetType: 'case', targetId: caseId })
          .expect(204);
      }
    };
    const a = await prisma.user.create({ data: { role: 'attorney' } });
    const b = await prisma.user.create({ data: { role: 'attorney' } });
    const c = await prisma.user.create({ data: { role: 'attorney' } });
    await open(a.id, 3); // one person, however many times
    await app.get(SearchLogService).learn();
    expect(await prisma.searchLearnedLink.count({ where: { q } })).toBe(0);

    await open(b.id, 1);
    await open(c.id, 1);
    await app.get(SearchLogService).learn();
    expect(
      await prisma.searchLearnedLink.findFirst({
        where: { q, practice_area_id: areaId },
      }),
    ).toMatchObject({ score: 3 });

    const learned = await api()
      .get('/api/v1/admin/search/learned')
      .set(admin.auth)
      .expect(200);
    expect(
      (learned.body.data as { q: string; practiceCode: string }[]).some(
        (l) => l.q === q && l.practiceCode === code,
      ),
    ).toBe(true);

    app.get(SearchSynonymsService).invalidate();
    expect(await casesFor(q)).toContain(caseId);
  });

  it('import adds groups and phrases; a section the admin has no right to looks absent', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const r = await api()
      .post('/api/v1/admin/search/synonyms/import')
      .set(admin.auth)
      .send({
        groups: [
          {
            key: `e2e-${tag}-c`,
            practice: code,
            terms: { ru: [`импорт${tag}`], ne: [`आयात${tag}`] },
          },
          { key: `e2e-${tag}-d`, practice: 'no_such_practice', terms: {} },
        ],
      })
      .expect(200);
    expect(r.body.data).toMatchObject({
      groupsCreated: 2,
      termsAdded: 2,
      unknownPractices: ['no_such_practice'],
    });
    expect(await casesFor(`आयात${tag}`)).toContain(caseId);

    const support = await adminSession(base, prisma, 'support');
    await api()
      .get('/api/v1/admin/search/synonyms')
      .set(support.auth)
      .expect(404);
    const list = await api()
      .get('/api/v1/admin/search/synonyms')
      .query({ q: `импорт${tag}` })
      .set(admin.auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBeGreaterThan(0);
  });

  it('a case filed under "not sure" is found by the topic its own words name', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const generic = await prisma.practiceArea.upsert({
      where: { code: 'general_practice.not_sure_or_other' },
      create: {
        code: 'general_practice.not_sure_or_other',
        name_en: 'Not sure / other',
        i18n_key: 'practice.general_practice.not_sure_or_other',
        sort: 999,
      },
      update: {},
    });
    // "Not sure / other" cases are listed for general-practice attorneys.
    const general = await prisma.practiceArea.upsert({
      where: { code: 'general_practice.general_practice' },
      create: {
        code: 'general_practice.general_practice',
        name_en: 'General Practice',
        i18n_key: 'practice.general_practice.general_practice',
        sort: 998,
      },
      update: {},
    });
    await prisma.attorneyPracticeArea.upsert({
      where: {
        attorney_id_practice_area_id: {
          attorney_id: attorneyId,
          practice_area_id: general.id,
        },
      },
      create: { attorney_id: attorneyId, practice_area_id: general.id },
      update: {},
    });
    const phrase = `особыйспор${tag}`;
    await api()
      .post('/api/v1/admin/search/synonyms')
      .set(admin.auth)
      .send({
        key: `e2e-${tag}-e`,
        practiceCode: code,
        terms: [
          { lang: 'ru', term: phrase },
          { lang: 'en', term: `unusual quarrel ${tag}` },
        ],
      })
      .expect(201);
    const owner = await prisma.user.create({ data: { role: 'client' } });
    const c = await prisma.case.create({
      data: {
        client_id: owner.id,
        title: 'Помогите разобраться',
        description: `У меня ${phrase} с соседом`,
        practice_area_id: generic.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    expect(await casesFor(`особыйспор${tag} сосед`)).toContain(c.id);
    // Before the job: only the exact word finds it, the other language not.
    expect(await casesFor(`unusual quarrel ${tag} x`)).not.toContain(c.id);
    const tagged = await app.get(SearchSynonymsService).tagRecent(50);
    expect(tagged.cases).toBeGreaterThan(0);
    const row = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.inferred_practice_id).toBe(areaId);
    expect(await casesFor(`unusual quarrel ${tag}`)).toContain(c.id);
  });
});
