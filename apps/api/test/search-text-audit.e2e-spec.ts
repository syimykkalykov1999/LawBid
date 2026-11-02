import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 2026-10-18: what people TYPE into every Search tab and into "My
 * cases" finds what that screen holds — title / text / hashtag / topic name
 * in RU and EN / prefix / typo / case / ranking / paging, people by name in
 * any order and @username, cases by words, topic, state and city.
 */
jest.setTimeout(180_000);

describe('Search text audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  // Owner 2026-10-22 (audit #4 §10): a FIXED token (letters only, one word
  // in every language). A random one made the run flaky: with typo-tolerant
  // search, two random tokens sometimes landed close enough to match each
  // other's "no match" probes. The e2e database is emptied per run, and no
  // other suite uses these letters.
  const tok = 'qkzvwxjb';
  const cyr = [...tok]
    .map((ch) => 'бвгджзклмнпрст'[ch.charCodeAt(0) % 13])
    .join('');
  const topicEn = `Quokka${tok}`;
  const topicRu = `Квокка${cyr}`;
  const city = `Zarkville${tok}`;
  let areaId = '';
  let attorneyId = '';
  let clientId = '';

  const api = () => request(base);
  const as = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    })}`,
  });
  // Every call is a fresh viewer: the per-minute search budget is per user.
  const viewer = async () => {
    const u = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
    return { id: u.id, h: as(u.id, 'client') };
  };
  /** Every result id over all pages (a shared CI database holds many
   * attorneys of the same practice / state, so the first page may not). */
  const allIds = async (path: string, q: string) => {
    const v = await viewer();
    const out: (string | undefined)[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 30; page++) {
      const r: {
        status: number;
        body: { data: unknown; meta?: { nextCursor?: string | null } };
      } = await api()
        .get(
          `/api/v1${path}?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        .set(v.h);
      expect(r.status).toBe(200);
      for (const x of r.body.data as {
        id?: string;
        attorney?: { id: string };
        client?: { id: string };
      }[]) {
        out.push(x.id ?? x.attorney?.id ?? x.client?.id);
      }
      cursor = r.body.meta?.nextCursor ?? null;
      if (!cursor) break;
    }
    return out;
  };

  const ids = async (path: string, q: string, extra = '') => {
    const v = await viewer();
    const r = await api()
      .get(`/api/v1${path}?q=${encodeURIComponent(q)}${extra}`)
      .set(v.h);
    expect(r.status).toBe(200);
    return (
      r.body.data as {
        id?: string;
        attorney?: { id: string };
        client?: { id: string };
      }[]
    ).map((x) => x.id ?? x.attorney?.id ?? x.client?.id);
  };

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
    const m = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = m.createNestApplication();
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
    await setKey(`practice.ta_${tok}`, { en: topicEn, ru: topicRu });
    const area = await prisma.practiceArea.create({
      data: {
        code: `ta_${tok}`,
        name_en: topicEn,
        i18n_key: `practice.ta_${tok}`,
        sort: 1,
      },
    });
    areaId = area.id;
    const att = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: `Alfa${tok}`,
        last_name: `Bravo${tok}`,
      },
    });
    attorneyId = att.id;
    await prisma.attorneyProfile.create({
      data: {
        user_id: att.id,
        username: `lex.${tok}`,
        username_lower: `lex.${tok}`,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att.id,
        state_code: 'NJ',
        bar_number: `T${randomUUID().slice(0, 10)}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: areaId },
    });
    const cl = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
    clientId = cl.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (data: {
    title?: string;
    body: string;
    practice?: string;
    at?: Date;
  }) =>
    prisma.post.create({
      data: {
        author_id: attorneyId,
        title: data.title,
        body: data.body,
        practice_area_id: data.practice,
        content_class: 'legal',
        ...(data.at ? { created_at: data.at } : {}),
      },
    });

  it('posts: title only, text only, hashtag with and without #, case-insensitive, ranking', async () => {
    const w = `titleword${tok}`;
    const t = `bodyword${tok}`;
    const old = new Date(Date.now() - 3600_000);
    // The body match is newer: only the weights can put the title first.
    const byTitle = await post({ title: `About ${w}`, body: 'plain', at: old });
    const byText = await post({ body: `About ${t} here` });
    const byBodyAsTitle = await post({ body: `About ${w} in the text` });
    expect(await ids('/search/posts', w)).toEqual([
      byTitle.id,
      byBodyAsTitle.id,
    ]);
    expect(await ids('/search/posts', t)).toEqual([byText.id]);
    expect(await ids('/search/posts', t.toUpperCase())).toEqual([byText.id]);
    const tagged = await post({ body: `Tips #famlaw${tok} today` });
    expect(await ids('/search/posts', `#famlaw${tok}`)).toEqual([tagged.id]);
    expect(await ids('/search/posts', `famlaw${tok}`)).toEqual([tagged.id]);
    // Prefix and Cyrillic.
    expect(await ids('/search/posts', `titlew`)).toContain(byTitle.id);
    const ru = await post({ title: `Заголовок ${cyr}`, body: 'текст' });
    expect(await ids('/search/posts', `заголовок ${cyr}`)).toEqual([ru.id]);
    expect(await ids('/search/posts', `ЗАГОЛОВОК`)).toContain(ru.id);
  });

  it('posts: a topic name in RU and EN finds its posts even when the word is not in them; empty result', async () => {
    const p = await post({ body: 'Nothing about it here', practice: areaId });
    for (const q of [
      topicEn,
      topicEn.toLowerCase(),
      topicRu,
      topicRu.toLowerCase(),
    ]) {
      expect(await ids('/search/posts', q)).toContain(p.id);
    }
    // Prefix of the topic name.
    expect(await ids('/search/posts', topicEn.slice(0, 8))).toContain(p.id);
    expect(await ids('/search/posts', 'yxplughnomatchzz')).toEqual([]);
  });

  it('posts: a small typo in a title still finds it', async () => {
    const p = await post({ title: `Certification${tok} checklist`, body: 'x' });
    expect(
      await ids('/search/posts', `Certificaton${tok} checklist`),
    ).toContain(p.id);
  });

  it('posts: paging with a query (20 per page, then the rest)', async () => {
    const w = `pagedword${tok}`;
    for (let i = 0; i < 23; i++) {
      await post({
        body: `${w} number ${i}`,
        at: new Date(Date.now() - i * 1000),
      });
    }
    const v = await viewer();
    const first = await api().get(`/api/v1/search/posts?q=${w}`).set(v.h);
    expect(first.body.data).toHaveLength(20);
    const cursor = first.body.meta.nextCursor as string;
    expect(cursor).toBeTruthy();
    const second = await api()
      .get(`/api/v1/search/posts?q=${w}&cursor=${cursor}`)
      .set(v.h);
    expect(second.body.data).toHaveLength(3);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('people: first name, last name, both orders, @username with/without @, partial, case', async () => {
    for (const q of [
      `Alfa${tok}`,
      `bravo${tok}`,
      `Alfa${tok} Bravo${tok}`,
      `Bravo${tok} Alfa${tok}`,
      `@lex.${tok}`,
      `lex.${tok}`,
      `@LEX.${tok.slice(0, 5)}`,
      `lex.${tok.slice(0, 5)}`,
    ]) {
      expect(await ids('/search/people', q)).toContain(attorneyId);
    }
    expect(await ids('/search/people', 'yxplughnobodyzz')).toEqual([]);
  });

  it('people: attorneys by practice name in RU and EN, by state name; blocked users hidden', async () => {
    for (const q of [topicEn, topicRu, 'new jersey']) {
      expect(await allIds('/search/people', q)).toContain(attorneyId);
    }
    const v = await viewer();
    await prisma.userBlock.create({
      data: { blocker_id: v.id, blocked_id: attorneyId },
    });
    const r = await api().get(`/api/v1/search/people?q=Alfa${tok}`).set(v.h);
    expect(
      (r.body.data as { attorney: { id: string } }[]).map((x) => x.attorney.id),
    ).not.toContain(attorneyId);
  });

  it('cases (attorney search): title, description, topic RU/EN, state code and name, city', async () => {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: `Dispute over ${tok}fence`,
        description: `Neighbour ${tok}hedge problem`,
        city,
        practice_area_id: areaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const search = async (q: string) => {
      const r = await api()
        .get(`/api/v1/search/cases?q=${encodeURIComponent(q)}`)
        .set(as(attorneyId, 'attorney'));
      expect(r.status).toBe(200);
      return (r.body.data as { id: string }[]).map((x) => x.id);
    };
    // One attorney, many queries: wait out the per-minute budget by using
    // fresh sessions is not possible, so a few queries are chained.
    for (const q of [
      `${tok}fence`,
      `${tok}hedge`,
      topicEn,
      topicRu,
      'NJ',
      'New Jersey',
      city,
      city.slice(0, 7),
    ]) {
      expect(await search(q)).toContain(c.id);
    }
    expect(await search('yxplughnomatchzz')).toEqual([]);
    // Owner 2026-10-28: each word may name the text, the topic or the
    // place («развод бруклин», «dui texas»); every word must match one.
    for (const q of [
      `${tok}fence new jersey`,
      `${topicEn} nj`,
      `${topicRu} в ${city}`,
      `${tok}hedge ${city}`,
    ]) {
      expect(await search(q)).toContain(c.id);
    }
    expect(await search(`${topicEn} yxplughnomatchzz`)).toEqual([]);
  });

  it('"My cases": description, city, state, topic RU/EN; the segment is respected', async () => {
    const mine = async (filter: string, q: string) => {
      const r = await api()
        .get(
          `/api/v1/users/me/cases?filter=${filter}&q=${encodeURIComponent(q)}`,
        )
        .set(as(clientId, 'client'));
      expect(r.status).toBe(200);
      return (r.body.data as { id: string; title: string }[]).map(
        (x) => x.title,
      );
    };
    const closed = await prisma.case.create({
      data: {
        client_id: clientId,
        title: `Finished matter ${tok}`,
        description: 'old',
        city,
        practice_area_id: areaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'closed',
      },
    });
    await prisma.caseState.create({
      data: { case_id: closed.id, state_code: 'NJ', is_primary: true },
    });
    for (const q of [`${tok}hedge`, city, 'new jersey', topicEn, topicRu]) {
      expect(await mine('active', q)).toContain(`Dispute over ${tok}fence`);
      // Active segment never returns the closed case, closed never active.
      expect(await mine('active', q)).not.toContain(`Finished matter ${tok}`);
    }
    expect(await mine('closed', topicRu)).toEqual([`Finished matter ${tok}`]);
    expect(await mine('active', 'yxplughnomatchzz')).toEqual([]);
  });
});
