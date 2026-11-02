import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 2026-11-01: Q&A search and filters (text, state, topic, answered /
 * solved) alone and combined, with paging — the answer must equal an oracle
 * computed from the seeded questions.
 */
jest.setTimeout(180_000);

interface Q {
  id: string;
  word: 'alpha' | 'beta';
  state: 'NY' | 'CA';
  area: 'a' | 'b';
  answers: number;
  solved: boolean;
}

describe('Q&A search and filters matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const tok = 'qamxzvkw';
  const qs: Q[] = [];
  const area: Record<string, string> = {};

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
    for (const k of ['a', 'b']) {
      const code = `qa${k}_${tok}`;
      await prisma.i18nKey.upsert({
        where: { key: `practice.${code}` },
        create: { key: `practice.${code}` },
        update: {},
      });
      area[k] = (
        await prisma.practiceArea.create({
          data: {
            code,
            name_en: `QA area ${k} ${tok}`,
            i18n_key: `practice.${code}`,
            sort: 1,
          },
        })
      ).id;
    }
    const author = (
      await prisma.user.create({
        data: { role: 'client', phone_verified_at: new Date() },
      })
    ).id;
    const attorney = (await prisma.user.create({ data: { role: 'attorney' } }))
      .id;
    let n = 0;
    for (const word of ['alpha', 'beta'] as const) {
      for (const state of ['NY', 'CA'] as const) {
        for (const a of ['a', 'b'] as const) {
          for (const kind of ['open', 'answered', 'solved']) {
            // two of each so paging (limit 5) has several pages
            for (let i = 0; i < 2; i++) {
              const q = await prisma.legalQuestion.create({
                data: {
                  author_id: author,
                  title: `${word}${tok} question ${n}`,
                  body: `Please explain ${word}${tok} in my situation, number ${n}.`,
                  state_code: state,
                  practice_area_id: area[a],
                  answer_count: kind === 'open' ? 0 : 1,
                  created_at: new Date(Date.now() - n * 1000),
                },
              });
              if (kind !== 'open') {
                const ans = await prisma.legalAnswer.create({
                  data: {
                    question_id: q.id,
                    attorney_id: attorney,
                    body: `Answer number ${n} with enough text`,
                  },
                });
                if (kind === 'solved') {
                  await prisma.legalQuestion.update({
                    where: { id: q.id },
                    data: { best_answer_id: ans.id },
                  });
                }
              }
              qs.push({
                id: q.id,
                word,
                state,
                area: a,
                answers: kind === 'open' ? 0 : 1,
                solved: kind === 'solved',
              });
              n++;
            }
          }
        }
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  type F = {
    q?: 'alpha' | 'beta';
    state?: 'NY' | 'CA';
    area?: 'a' | 'b';
    filter?: 'all' | 'unanswered' | 'solved';
  };

  const expected = (f: F) =>
    qs
      .filter(
        (x) =>
          (!f.q || x.word === f.q) &&
          (!f.state || x.state === f.state) &&
          (!f.area || x.area === f.area) &&
          (f.filter !== 'unanswered' || x.answers === 0) &&
          (f.filter !== 'solved' || x.solved),
      )
      .map((x) => x.id);

  const fetchAll = async (f: F): Promise<string[]> => {
    const mine = new Set(qs.map((x) => x.id));
    const out: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      const p = new URLSearchParams({ limit: '5' });
      if (f.q) p.set('q', `${f.q}${tok}`);
      if (f.state) p.set('stateCode', f.state);
      if (f.area) p.set('practiceAreaId', area[f.area]);
      if (f.filter) p.set('filter', f.filter);
      if (cursor) p.set('cursor', cursor);
      const r: {
        status: number;
        body: { data: { id: string }[]; meta?: { nextCursor?: string } };
      } = await request(base)
        .get(`/api/v1/questions?${p.toString()}`)
        .set(await viewer());
      expect(r.status).toBe(200);
      out.push(...r.body.data.map((x) => x.id).filter((id) => mine.has(id)));
      cursor = r.body.meta?.nextCursor ?? null;
      if (!cursor) break;
    }
    return out;
  };

  it('every filter alone and combined, with and without text, paged', async () => {
    const bad: string[] = [];
    for (const q of [undefined, 'alpha', 'beta'] as const) {
      for (const state of [undefined, 'NY', 'CA'] as const) {
        for (const a of [undefined, 'a', 'b'] as const) {
          for (const filter of [undefined, 'unanswered', 'solved'] as const) {
            const f: F = { q, state, area: a, filter };
            const got = await fetchAll(f);
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
