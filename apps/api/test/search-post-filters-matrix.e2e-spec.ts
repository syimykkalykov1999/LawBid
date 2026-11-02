import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 2026-11-01 (owner: "filters do not narrow anything"): every post
 * filter alone and combined — with and without text, every sort, paging —
 * and the server answer must equal an oracle computed from the seeded rows.
 */
jest.setTimeout(300_000);

const DAY = 86_400_000;

interface Row {
  id: string;
  authorState: 'NY' | 'CA';
  area: 'fam' | 'imm' | null;
  ageDays: number;
  photo: boolean;
  likes: number;
}

describe('Post filters matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const tok = 'fmxqzvkw';
  const rows: Row[] = [];
  const area: Record<string, { id: string; code: string }> = {};
  const authors: Record<string, string> = {};

  const api = () => request(base);
  const viewer = async () => {
    const u = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
    return {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'client',
        sid: randomUUID(),
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
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

    for (const [code, name] of [
      ['NY', 'New York'],
      ['CA', 'California'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    for (const k of ['fam', 'imm'] as const) {
      const code = `${k}_${tok}`;
      const key = await prisma.i18nKey.upsert({
        where: { key: `practice.${code}` },
        create: { key: `practice.${code}` },
        update: {},
      });
      void key;
      const a = await prisma.practiceArea.create({
        data: {
          code,
          name_en: `Area ${k} ${tok}`,
          i18n_key: `practice.${code}`,
          sort: 1,
        },
      });
      area[k] = { id: a.id, code };
    }
    for (const st of ['NY', 'CA'] as const) {
      const u = await prisma.user.create({
        data: { role: 'attorney', first_name: `A${st}`, last_name: tok },
      });
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `fm_${st.toLowerCase()}_${tok}`,
          username_lower: `fm_${st.toLowerCase()}_${tok}`,
          verification_status: 'verified',
        },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: st,
          bar_number: `T${randomUUID().slice(0, 10)}`,
          license_status: 'verified',
        },
      });
      authors[st] = u.id;
    }

    // Every combination of state x area x age x photo, distinct likes.
    let likes = 1;
    for (const authorState of ['NY', 'CA'] as const) {
      for (const a of ['fam', 'imm', null] as const) {
        for (const ageDays of [0, 3, 20, 60]) {
          for (const photo of [false, true]) {
            const p = await prisma.post.create({
              data: {
                author_id: authors[authorState],
                body: `Filter matrix ${tok} sample ${rows.length}`,
                content_class: 'legal',
                practice_area_id: a ? area[a].id : null,
                like_count: likes,
                created_at: new Date(Date.now() - ageDays * DAY - 60_000),
              },
            });
            if (photo) {
              const fid = randomUUID();
              await prisma.file.create({
                data: {
                  id: fid,
                  owner_user_id: authors[authorState],
                  purpose: 'post_image',
                  s3_bucket: 'lawbid-media',
                  s3_key: `posts/${fid}`,
                  mime: 'image/jpeg',
                  size_bytes: BigInt(1000),
                  sha256: 'a'.repeat(64),
                  scan_status: 'clean',
                  width: 800,
                  height: 600,
                },
              });
              await prisma.postMedia.create({
                data: { post_id: p.id, file_id: fid, position: 0 },
              });
            }
            rows.push({
              id: p.id,
              authorState,
              area: a,
              ageDays,
              photo,
              likes: likes++,
            });
          }
        }
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  type F = {
    practice?: 'fam' | 'imm';
    state?: 'NY' | 'CA';
    period?: '7d' | '30d' | 'all';
    withPhotos?: boolean;
    briefsOnly?: boolean;
    sort?: 'relevance' | 'newest' | 'popular';
  };

  const expected = (f: F): string[] => {
    const span = f.period === '7d' ? 7 : f.period === '30d' ? 30 : null;
    const out = rows.filter(
      (r) =>
        (!f.practice || r.area === f.practice) &&
        (!f.state || r.authorState === f.state) &&
        (span === null || r.ageDays < span) &&
        (!f.withPhotos || r.photo) &&
        (!f.briefsOnly || !r.photo),
    );
    if (f.sort === 'popular') out.sort((a, b) => b.likes - a.likes);
    return out.map((r) => r.id);
  };

  const query = (f: F, text: boolean): string => {
    const p = new URLSearchParams();
    if (text) p.set('q', tok);
    if (f.practice) p.set('practice', area[f.practice].code);
    if (f.state) p.set('state', f.state);
    if (f.period) p.set('period', f.period);
    if (f.withPhotos) p.set('withPhotos', 'true');
    if (f.briefsOnly) p.set('briefsOnly', 'true');
    if (f.sort) p.set('sort', f.sort);
    return p.toString();
  };

  /** All pages of [path]; only this suite's rows (other suites share the DB). */
  const fetchAll = async (path: string, qs: string): Promise<string[]> => {
    const mine = new Set(rows.map((r) => r.id));
    const out: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 30; i++) {
      const r: {
        status: number;
        body: { data: { id: string }[]; meta?: { nextCursor?: string } };
      } = await api()
        .get(
          `/api/v1${path}?${qs}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        .set(await viewer());
      expect(r.status).toBe(200);
      out.push(...r.body.data.map((x) => x.id).filter((id) => mine.has(id)));
      cursor = r.body.meta?.nextCursor ?? null;
      if (!cursor) break;
    }
    return out;
  };

  const practices: (F['practice'] | undefined)[] = [undefined, 'fam', 'imm'];
  const states: (F['state'] | undefined)[] = [undefined, 'NY', 'CA'];
  const periods: (F['period'] | undefined)[] = [undefined, '7d', '30d'];

  it('search/posts with text: each filter alone and every pair, with every sort', async () => {
    const cases: F[] = [];
    for (const sort of ['relevance', 'newest', 'popular'] as const) {
      for (const practice of practices) {
        for (const state of states) {
          for (const period of periods) {
            // alone / pairs / all three; photos & briefs rotate in.
            const flags = [
              {},
              { withPhotos: true },
              { briefsOnly: true },
            ] as F[];
            for (const fl of flags) {
              cases.push({ sort, practice, state, period, ...fl });
            }
          }
        }
      }
    }
    const bad: string[] = [];
    for (const f of cases) {
      const got = await fetchAll('/search/posts', query(f, true));
      const want = expected(f);
      const ok =
        f.sort === 'popular'
          ? JSON.stringify(got) === JSON.stringify(want)
          : f.sort === 'newest'
            ? got.length === want.length &&
              new Set(got).size === got.length &&
              want.every((id) => got.includes(id))
            : got.length === want.length &&
              new Set(got).size === got.length &&
              want.every((id) => got.includes(id));
      if (!ok)
        bad.push(`${JSON.stringify(f)} got ${got.length} want ${want.length}`);
    }
    expect(bad).toEqual([]);
  });

  it('search/posts: newest is newest first', async () => {
    const got = await fetchAll(
      '/search/posts',
      query({ sort: 'newest', state: 'NY' }, true),
    );
    const age = new Map(rows.map((r) => [r.id, r.ageDays]));
    const ages = got.map((id) => age.get(id) ?? 0);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
  });

  it('search/latest-posts (no text): the same filters, paged', async () => {
    const bad: string[] = [];
    for (const practice of practices) {
      for (const state of states) {
        for (const period of periods) {
          for (const fl of [
            {},
            { withPhotos: true },
            { briefsOnly: true },
          ] as F[]) {
            const f: F = { practice, state, period, ...fl };
            const qs = query(f, false);
            const got = await fetchAll('/search/latest-posts', qs);
            const want = expected(f);
            if (
              got.length !== want.length ||
              new Set(got).size !== got.length ||
              !want.every((id) => got.includes(id))
            ) {
              bad.push(
                `${JSON.stringify(f)} got ${got.length} want ${want.length}`,
              );
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
