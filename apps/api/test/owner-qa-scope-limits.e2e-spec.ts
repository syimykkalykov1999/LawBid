import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { LegalQaSweepJob } from '../src/modules/legal-qa/legal-qa-sweep.job';

/**
 * Owner 2026-10-21: «Вопрос юристу» — the attorney's own feed, at most 10
 * answers, attorneys see only their own answer, close, nightly sweep.
 */
jest.setTimeout(120_000);

describe('Q&A feed scope, answer cap, privacy, close and sweep (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York', is_active: true },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  const leafArea = () =>
    prisma.practiceArea.upsert({
      where: { code: 'e2e_qa_scope_leaf' },
      create: {
        code: 'e2e_qa_scope_leaf',
        name_en: 'E2E qa scope',
        i18n_key: 'practice.e2e_qa_scope_leaf',
        sort: 1,
      },
      update: { is_active: true },
    });
  const bearer = (id: string, role: string | null) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const phone = () =>
    `+1312${2 + Math.floor(Math.random() * 8)}${String(
      Math.floor(Math.random() * 1e6),
    ).padStart(6, '0')}`;

  async function attorney(
    opts: { verified?: boolean; subscribed?: boolean; areaId?: string } = {},
  ) {
    const verified = opts.verified ?? true;
    const a = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Ada',
        last_name: 'Counsel',
        phone_e164: phone(),
        phone_verified_at: new Date(),
        timezone: 'America/New_York',
      },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: a.id,
        username: `bk_${a.id.slice(0, 8)}`,
        username_lower: `bk_${a.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: verified ? 'verified' : 'unverified',
      },
    });
    if (opts.areaId) {
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: a.id, practice_area_id: opts.areaId },
      });
    }
    if (opts.subscribed ?? true) {
      await prisma.subscription.create({
        data: {
          user_id: a.id,
          status: 'active',
          price_cents: 39900,
          plan: 'monthly',
        },
      });
    }
    return { id: a.id, auth: bearer(a.id, 'attorney') };
  }

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Cy',
        last_name: 'Client',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  async function otherArea(code: string) {
    return prisma.practiceArea.upsert({
      where: { code },
      create: { code, name_en: code, i18n_key: `practice.${code}`, sort: 2 },
      update: { is_active: true },
    });
  }

  async function ask(
    cl: { auth: Record<string, string> },
    title: string,
    areaId?: string,
  ) {
    const r = await api()
      .post('/api/v1/questions')
      .set(cl.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title,
        body: `${title} — details of the matter`,
        practiceAreaId: areaId,
      })
      .expect(201);
    return r.body.data.id as string;
  }

  const answer = (a: { auth: Record<string, string> }, id: string) =>
    api()
      .put(`/api/v1/questions/${id}/answer`)
      .set(a.auth)
      .send({ body: `My own advice ${randomUUID().slice(0, 8)}` });

  const ids = (res: { body: { data: { id: string }[] } }) =>
    res.body.data.map((x) => x.id);

  it('an attorney sees at most 10 answers; the 11th gets 409', async () => {
    const cl = await client();
    const id = await ask(cl, 'Cap question title');
    const first = await attorney();
    await answer(first, id).expect(200);
    for (let i = 0; i < 9; i++) await answer(await attorney(), id).expect(200);
    const late = await attorney();
    const res = await answer(late, id).expect(409);
    expect(res.body.error.code).toBe('QA_ANSWERS_ENOUGH');
    // The first attorney can still edit their own answer.
    await answer(first, id).expect(200);
    const q = await api()
      .get(`/api/v1/questions/${id}`)
      .set(cl.auth)
      .expect(200);
    expect(q.body.data).toMatchObject({ answerCount: 10, answersEnough: true });
    const seenByLate = await api()
      .get(`/api/v1/questions/${id}`)
      .set(late.auth)
      .expect(200);
    expect(seenByLate.body.data.canAnswer).toBe(false);
  });

  it('attorneys see only their own answer, clients see all and like', async () => {
    const author = await client();
    const reader = await client();
    const id = await ask(author, 'Privacy question title');
    const a1 = await attorney();
    const a2 = await attorney();
    const r1 = await answer(a1, id).expect(200);
    await answer(a2, id).expect(200);

    const asA1 = await api()
      .get(`/api/v1/questions/${id}`)
      .set(a1.auth)
      .expect(200);
    expect(asA1.body.data.answers).toHaveLength(1);
    expect(asA1.body.data.answers[0].isMine).toBe(true);
    for (const viewer of [author, reader]) {
      const d = await api()
        .get(`/api/v1/questions/${id}`)
        .set(viewer.auth)
        .expect(200);
      expect(d.body.data.answers).toHaveLength(2);
    }
    // Clients like; attorneys cannot.
    await api()
      .put(`/api/v1/questions/${id}/answers/${r1.body.data.id}/like`)
      .set(reader.auth)
      .expect(200);
    await api()
      .put(`/api/v1/questions/${id}/answers/${r1.body.data.id}/like`)
      .set(a2.auth)
      .expect(403);
  });

  it('scope=mine keeps my practice areas (and parents, children) and open ones', async () => {
    const cl = await client();
    const mineArea = await leafArea();
    const other = await otherArea('e2e_qa_scope_other');
    const att = await attorney({ areaId: mineArea.id });
    const bare = await attorney(); // no areas: «mine» equals «all»
    const qMine = await ask(cl, 'Scope mine question', mineArea.id);
    const qOther = await ask(cl, 'Scope other question', other.id);
    const qOpen = await ask(cl, 'Scope open question');

    const mine = await api()
      .get('/api/v1/questions')
      .query({ scope: 'mine' })
      .set(att.auth)
      .expect(200);
    expect(ids(mine)).toEqual(expect.arrayContaining([qMine, qOpen]));
    expect(ids(mine)).not.toContain(qOther);
    const all = await api()
      .get('/api/v1/questions')
      .query({ scope: 'all' })
      .set(att.auth)
      .expect(200);
    expect(ids(all)).toEqual(expect.arrayContaining([qMine, qOther, qOpen]));
    const none = await api()
      .get('/api/v1/questions')
      .query({ scope: 'mine' })
      .set(bare.auth)
      .expect(200);
    expect(ids(none)).toContain(qOther);
    // A client is never narrowed.
    const asClient = await api()
      .get('/api/v1/questions')
      .query({ scope: 'mine' })
      .set(cl.auth)
      .expect(200);
    expect(ids(asClient)).toContain(qOther);

    // A parent area of mine also matches.
    const parent = await otherArea('e2e_qa_scope_parent');
    await prisma.practiceArea.update({
      where: { id: mineArea.id },
      data: { parent_id: parent.id },
    });
    const qParent = await ask(cl, 'Scope parent question', parent.id);
    const withParent = await api()
      .get('/api/v1/questions')
      .query({ scope: 'mine' })
      .set(att.auth)
      .expect(200);
    expect(ids(withParent)).toContain(qParent);
    await prisma.practiceArea.update({
      where: { id: mineArea.id },
      data: { parent_id: null },
    });
  });

  it('close hides a question from attorneys; the sweep closes and purges', async () => {
    const cl = await client();
    const att = await attorney();
    const id = await ask(cl, 'Close question title');
    await api().put(`/api/v1/questions/${id}/close`).set(att.auth).expect(404);
    await api().put(`/api/v1/questions/${id}/close`).set(cl.auth).expect(204);
    const feed = await api().get('/api/v1/questions').set(att.auth).expect(200);
    expect(ids(feed)).not.toContain(id);
    const own = await api().get('/api/v1/questions').set(cl.auth).expect(200);
    expect(ids(own)).toContain(id);
    const res = await answer(att, id).expect(409);
    expect(res.body.error.code).toBe('QA_QUESTION_CLOSED');

    const job = app.get(LegalQaSweepJob);
    const old = new Date(Date.now() - 31 * 86_400_000);
    const stale = await ask(cl, 'Stale unanswered title');
    await prisma.legalQuestion.update({
      where: { id: stale },
      data: { created_at: old },
    });
    const gone = await ask(cl, 'Deleted long ago title');
    await api().delete(`/api/v1/questions/${gone}`).set(cl.auth).expect(204);
    await prisma.legalQuestion.update({
      where: { id: gone },
      data: { deleted_at: new Date(Date.now() - 91 * 86_400_000) },
    });
    const r = await job.run();
    expect(r.closed).toBeGreaterThanOrEqual(1);
    expect(r.purged).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.legalQuestion.findUniqueOrThrow({ where: { id: stale } }))
        .closed_at,
    ).not.toBeNull();
    expect(
      await prisma.legalQuestion.findUnique({ where: { id: gone } }),
    ).toBeNull();
  });
});
