import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-15: a topic is found by its name in any language and by
 * everyday keywords ("уволили"), and a case filed under it is found by a
 * query in another language (a Russian case by an English or a Kyrgyz word).
 */
jest.setTimeout(120_000);

describe('Practice search in any language (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const code = `kwe2e${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 6)}`;
  let areaId = '';

  const setKey = async (key: string, values: Record<string, string>) => {
    const k = await prisma.i18nKey.upsert({
      where: { key },
      create: { key },
      update: {},
    });
    for (const [lang, value] of Object.entries(values)) {
      await prisma.i18nLanguage.upsert({
        where: { code: lang },
        create: { code: lang, name_native: lang, is_active: true, sort: 999 },
        update: {},
      });
      await prisma.i18nTranslation.upsert({
        where: { key_id_lang: { key_id: k.id, lang } },
        create: { key_id: k.id, lang, value, version: 1 },
        update: { value },
      });
    }
  };

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
    await setKey(`practice.${code}`, {
      en: 'Zebra Separation',
      ru: 'Зебрарасстание',
      ky: 'Зебражырашуу',
    });
    await setKey(`practice.${code}.kw`, {
      en: 'zebra split, leaving my zebra',
      ru: 'зебра ушла, бросила зебра',
    });
    const area = await prisma.practiceArea.create({
      data: {
        code,
        name_en: 'Zebra Separation',
        i18n_key: `practice.${code}`,
        sort: 1,
      },
    });
    areaId = area.id;
  });

  afterAll(async () => {
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

  const matches = async (q: string) => {
    const u = await prisma.user.create({ data: { role: 'client' } });
    const r = await api()
      .get('/api/v1/search/practices')
      .query({ q })
      .set(as(u.id, 'client'));
    expect(r.status).toBe(200);
    return (r.body.data as { code: string; hit: string | null }[]).map(
      (m) => m.code,
    );
  };

  it('a topic is found by its name in English, Russian and Kyrgyz', async () => {
    expect(await matches('Zebra')).toContain(code);
    expect(await matches('зебрарасс')).toContain(code);
    expect(await matches('зебражыр')).toContain(code);
  });

  it('a topic is found by everyday keywords, several words together', async () => {
    expect(await matches('бросила')).toContain(code);
    expect(await matches('leaving my')).toContain(code);
    expect(await matches('nothing like this xyz')).not.toContain(code);
  });

  it('a case filed under the topic is found by a word in another language', async () => {
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
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `kw${att.id.slice(0, 8)}`;
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
        bar_number: `K${randomUUID().slice(0, 10)}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: areaId },
    });
    for (const q of ['Zebra', 'зебражыр']) {
      const r = await api()
        .get('/api/v1/search/cases')
        .query({ q })
        .set(as(att.id, 'attorney'));
      expect(r.status).toBe(200);
      expect((r.body.data as { id: string }[]).map((x) => x.id)).toContain(
        c.id,
      );
    }
  });
});
