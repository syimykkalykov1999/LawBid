import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-11-01 ("I type one word and get something else"): a generic
 * topic word, a 3-letter "typo", a topic plus a text word, Chinese and
 * Japanese without spaces, hashtag type-ahead order.
 */
jest.setTimeout(180_000);

describe('Search quality audit 2026-11-01 (e2e)', () => {
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
  let attorneyId = '';

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
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Pavel', last_name: 'Ivanov' },
    });
    attorneyId = att.id;
    await prisma.attorneyProfile.create({
      data: {
        user_id: att.id,
        username: `pavel.ivanov.${tok}`,
        username_lower: `pavel.ivanov.${tok}`,
        verification_status: 'verified',
      },
    });
    const area = async (code: string, names: Record<string, string>) => {
      await setKey(`practice.${code}`, names);
      return (
        await prisma.practiceArea.create({
          data: {
            code,
            name_en: names.en,
            i18n_key: `practice.${code}`,
            sort: 1,
          },
        })
      ).id;
    };
    const fam = await area(`family_${tok}`, {
      en: 'Family law',
      ru: 'Семейное право',
      id: 'Hukum keluarga',
    });
    const crim = await area(`criminal_${tok}`, {
      en: 'Criminal law',
      ru: 'Уголовное право',
      id: 'Hukum Kejahatan',
    });
    const imm = await area(`immigration_${tok}`, {
      en: 'Immigration',
      ru: 'Иммиграция',
      zh: '移民',
    });
    await area(`tax_${tok}`, { en: 'Tax law', ru: 'Налоговое право' });
    const post = (title: string, body: string, practice?: string) =>
      prisma.post.create({
        data: {
          author_id: attorneyId,
          title,
          body,
          practice_area_id: practice,
          content_class: 'legal',
        },
      });
    await post(
      'Green card interview tips',
      'How to prepare for the green card interview.',
      imm,
    );
    await post(
      'Visa extension',
      'Extending your visa while the application is pending.',
      imm,
    );
    await post(
      'Divorce settlement',
      'A fair divorce settlement and custody.',
      fam,
    );
    await post('Drunk driving defense', 'What to do after a DUI arrest.', crim);
    await post(
      'Contract review',
      'Always read the contract before signing it.',
    );
    await post('我们提供移民咨询服务', '欢迎联系我们办理绿卡和签证。', imm);
    await post('離婚の手続き', '日本での離婚手続きについて説明します。', fam);
    await post(
      'Про трудовой договор',
      'Как правильно расторгнуть трудовой договор.',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const titles = async (q: string) => {
    const v = await viewer();
    const r = await api()
      .get(`/api/v1/search/posts?q=${encodeURIComponent(q)}`)
      .set(v.h);
    expect(r.status).toBe(200);
    return (r.body.data as { title?: string }[]).map((p) => p.title);
  };

  it('a generic word of many topic names ("law") does not return every post of those topics', async () => {
    const got = await titles('law');
    for (const t of [
      'Divorce settlement',
      'Drunk driving defense',
      '離婚の手続き',
    ]) {
      expect(got).not.toContain(t);
    }
  });

  it('a 3-letter word is not a typo of a different word ("cat" is not "card")', async () => {
    expect(await titles('cat')).not.toContain('Green card interview tips');
    // From 4 letters a typo is still forgiven.
    expect(await titles('intervew')).toEqual(['Green card interview tips']);
  });

  it('a topic word and a text word together ("immigration visa") narrow to the topic\'s post with that word', async () => {
    const got = await titles('immigration visa');
    expect(got).toContain('Visa extension');
    expect(got).not.toContain('Green card interview tips');
  });

  it('Chinese and Japanese are found inside a sentence without spaces', async () => {
    expect(await titles('移民')).toEqual(['我们提供移民咨询服务']);
    expect(await titles('咨询')).toEqual(['我们提供移民咨询服务']);
    // 3+ characters take the trigram index (posts_text_trgm_idx).
    expect(await titles('移民咨询')).toEqual(['我们提供移民咨询服务']);
    expect(await titles('离婚')).toEqual([]);
    expect(await titles('手続き')).toEqual(['離婚の手続き']);
  });

  it('a different word returns nothing instead of something unrelated', async () => {
    expect(await titles('xyzzy')).toEqual([]);
    expect(await titles('договор трудовой')).toEqual(['Про трудовой договор']);
  });

  it('hashtag type-ahead puts the most used tag first, not the alphabetically first', async () => {
    const mk = async (tag: string, posts: number) => {
      const t = await prisma.tag.create({ data: { tag_lower: tag } });
      for (let i = 0; i < posts; i++) {
        const p = await prisma.post.create({
          data: {
            author_id: attorneyId,
            body: `body ${tag} ${i}`,
            content_class: 'legal',
          },
        });
        await prisma.postTag.create({ data: { post_id: p.id, tag_id: t.id } });
      }
    };
    await mk(`${tok}aaa_unused`, 0);
    await mk(`${tok}mmm_small`, 1);
    await mk(`${tok}zzz_popular`, 3);
    const v = await viewer();
    const r = await api().get(`/api/v1/search/tags?q=${tok}`).set(v.h);
    expect(r.status).toBe(200);
    expect((r.body.data as { tag: string }[]).map((t) => t.tag)).toEqual([
      `${tok}zzz_popular`,
      `${tok}mmm_small`,
      `${tok}aaa_unused`,
    ]);
    const s = await api().get(`/api/v1/search/suggest?q=${tok}`).set(v.h);
    expect(
      (s.body.data as { kind: string; text: string }[]).filter(
        (x) => x.kind === 'tag',
      )[0].text,
    ).toBe(`${tok}zzz_popular`);
  });
});
