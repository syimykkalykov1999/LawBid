import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresSearchProvider } from '../src/modules/search/postgres-search.provider';
import { PERSON_TIER } from '../src/common/search/name-match.sql';

/**
 * Owner 2026-10-28 (phone test on prod): Search → «Люди», «jah» showed
 * «Syimyk Kalykov» as the only result — he practises criminal law, whose
 * Indonesian name «Kejahatan» contains «jah». People search now ranks like
 * Instagram / Telegram: exact → prefix → word start → contains (3+ letters)
 * → other alphabet → typo (4+ letters) → topic/state, and a short text never
 * goes through the loose arms. Real SQL on the real schema (name_skel /
 * name_cons trigger, pg_trgm), against a fixture of names.
 */
jest.setTimeout(120_000);

describe('People search relevance (e2e, owner 2026-10-28)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let search: PostgresSearchProvider;
  const tag = `rel${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const code = `crim${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 6)}`;
  const ids: Record<string, string> = {};

  async function attorney(
    key: string,
    first: string,
    last: string,
    followers = 0,
  ): Promise<string> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: last },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: `${tag}.${key}`,
        username_lower: `${tag}.${key}`,
        languages: ['en'],
        verification_status: 'verified',
        followers_count: followers,
      },
    });
    ids[key] = u.id;
    return u.id;
  }

  async function client(key: string, first: string, last: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: last },
    });
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        preferred_languages: ['en'],
        username: `${tag}.${key}`,
        username_lower: `${tag}.${key}`,
      },
    });
    ids[key] = u.id;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    search = app.get(PostgresSearchProvider);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });

    // A criminal-law practice with its Indonesian name, like production.
    const k = await prisma.i18nKey.upsert({
      where: { key: `practice.${code}` },
      create: { key: `practice.${code}` },
      update: {},
    });
    for (const [lang, value] of Object.entries({
      en: 'Felony Defense',
      id: 'Kejahatan Berat',
    })) {
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
    const area = await prisma.practiceArea.create({
      data: {
        code,
        name_en: 'Felony Defense',
        i18n_key: `practice.${code}`,
        sort: 1,
      },
    });

    const kalykov = await attorney('sk', 'Syimyk', 'Kalykov', 50);
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: kalykov, practice_area_id: area.id },
    });
    await attorney('jk', 'Jahongir', 'Karimov');
    await attorney('pn', 'Pascal', 'Nikolov');
    await attorney('am', 'Aidana', 'Mamytova');
    await client('kmo', 'Kalinda', 'Moore');
    await client('esh', 'Ekaterina', 'Shkalova');
    await client('mal', 'Maria', 'Alieva');
  });

  afterAll(async () => {
    await app.close();
  });

  const all = () => Object.values(ids);
  const keyOf = (id: string) =>
    Object.entries(ids).find(([, v]) => v === id)?.[0] ?? id;

  /** Ranked fixture rows (engine-style "among" path: only the fixture). */
  const among = async (q: string) =>
    (await search.searchPeopleAmong(q, {}, 50, all())).map((r) => ({
      key: keyOf(r.id),
      tier: r.tier,
    }));
  /** The plain Postgres path (candidates from the indexes). */
  const full = async (q: string) =>
    (await search.searchPeople(q, {}, 200)).map((r) => keyOf(r.id));

  it('«jah» → «Jahongir», never «Syimyk Kalykov» (not his name, not his practice)', async () => {
    for (const rows of [await among('jah')]) {
      expect(rows.map((r) => r.key)).toEqual(['jk']);
      expect(rows[0].tier).toBe(PERSON_TIER.prefix);
    }
    const plain = await full('jah');
    expect(plain).toContain('jk');
    expect(plain).not.toContain('sk');
  });

  it('«kal» → Kalykov first (verified, followers), then «Kalinda», then «Shkalova» (inside a word); not «Pascal»', async () => {
    const rows = await among('kal');
    expect(rows.map((r) => r.key)).toEqual(['sk', 'kmo', 'esh']);
    expect(rows.map((r) => r.tier)).toEqual([
      PERSON_TIER.prefix,
      PERSON_TIER.prefix,
      PERSON_TIER.contains,
    ]);
    const plain = await full('kal');
    expect(plain.indexOf('sk')).toBeGreaterThanOrEqual(0);
    expect(plain).not.toContain('pn');
  });

  it('«калык» (Cyrillic) → Kalykov through the spelling skeleton', async () => {
    const rows = await among('калык');
    expect(rows[0]).toEqual({ key: 'sk', tier: PERSON_TIER.translit });
    // Anything else is only a close spelling («Kalinda»), ranked after.
    for (const r of rows.slice(1)) expect(r.tier).toBe(PERSON_TIER.fuzzy);
    expect(await full('калык')).toContain('sk');
  });

  it('a typo of 4+ letters still finds him: «kalikov», «kalykob»', async () => {
    expect((await among('kalikov')).map((r) => r.key)).toEqual(['sk']);
    const typo = await among('kalykob');
    expect(typo).toEqual([{ key: 'sk', tier: PERSON_TIER.fuzzy }]);
    expect(await full('kalykob')).toContain('sk');
  });

  it('«syi» → Syimyk; any word order is a word-start match', async () => {
    expect((await among('syi')).map((r) => r.key)).toEqual(['sk']);
    expect(await among('kalykov syimyk')).toEqual([
      { key: 'sk', tier: PERSON_TIER.wordStart },
    ]);
    expect((await among(`${tag}.sk`))[0]).toEqual({
      key: 'sk',
      tier: PERSON_TIER.exact,
    });
  });

  it('1–2 letters: only exact / prefix / word start — no «inside a word», no typo', async () => {
    for (const q of ['ka', 'al', 'ia']) {
      const rows = await among(q);
      for (const r of rows) {
        expect(r.tier).toBeLessThanOrEqual(PERSON_TIER.wordStart);
      }
    }
    // «al»: «Alieva» starts a word; «Kalykov», «Shkalova», «Pascal» do not.
    expect((await among('al')).map((r) => r.key)).toEqual(['mal']);
    expect(await full('al')).not.toContain('sk');
  });

  it('a 3-letter text never goes through the loose arms (consonants, skeleton inside a word)', async () => {
    // «klk» = Kalykov's consonants; «ali» sits in his skeleton "kalikov".
    expect((await among('klk')).map((r) => r.key)).toEqual([]);
    // «ali»: «Alieva» starts a word, «Kalinda» has it inside; Kalykov's
    // plain name has no «ali».
    expect(await among('ali')).toEqual([
      { key: 'mal', tier: PERSON_TIER.prefix },
      { key: 'kmo', tier: PERSON_TIER.contains },
    ]);
  });

  it('a practice still finds its attorneys, by a word start of its name, after the name matches', async () => {
    expect(await among('felony')).toEqual([
      { key: 'sk', tier: PERSON_TIER.topic },
    ]);
    expect(await among('kejahatan')).toEqual([
      { key: 'sk', tier: PERSON_TIER.topic },
    ]);
    expect(await full('felony')).toContain('sk');
  });

  it('«sima kalykov»: every word by its start; the typo match «Syimyk» only when nothing matched strongly', async () => {
    await attorney('sima', 'Sima', 'Kalykov');
    expect(await among('sima kalykov')).toEqual([
      { key: 'sima', tier: PERSON_TIER.exact },
    ]);
    expect((await among('sima')).map((r) => r.key)).toEqual(['sima']);
    expect((await among('syimyk kalykov')).map((r) => r.key)).toEqual(['sk']);
    // «syimyl»: nobody starts with it — the close spelling is the answer.
    expect(await among('syimyl')).toEqual([
      { key: 'sk', tier: PERSON_TIER.fuzzy },
    ]);
  });
});
