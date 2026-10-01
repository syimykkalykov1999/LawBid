import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-01: anyone reviews anyone — clients, attorneys and
 * assistants review attorneys without a shared case (one open review per
 * author), and clients / assistants are reviewed too. Removal: the author
 * deletes; the reviewed attorney appeals (admin decides, 30 days → gone).
 */
jest.setTimeout(120_000);

describe('Open reviews (e2e, owner 2026-10-01)', () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: `s-${id}`,
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Ada', last_name: 'Counsel' },
    });
    const username = `or_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return u.id;
  }
  async function person(role: 'client' | 'assistant') {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: role === 'client' ? 'Cy' : 'Sam',
        last_name: 'Doe',
        phone_e164: `+1312${2 + Math.floor(Math.random() * 8)}${String(
          Math.floor(Math.random() * 1e6),
        ).padStart(6, '0')}`,
        phone_verified_at: new Date(),
      },
    });
    return u.id;
  }

  it('anyone reviews an attorney; appeal and delete work', async () => {
    const a = await attorney();
    const b = await attorney();
    const c = await person('client');
    const ownAssistant = await person('assistant');
    const otherAssistant = await person('assistant');
    await prisma.assistantMembership.create({
      data: {
        attorney_id: a,
        assistant_user_id: ownAssistant,
        phone_e164: `+1312555${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`,
        status: 'active',
        approval: 'attorney_added',
        duties: [],
      },
    });
    const put = (who: string, role: string, rating: number, body?: string) =>
      api()
        .put(`/api/v1/attorneys/${a}/reviews/mine`)
        .set(bearer(who, role))
        .send({ rating, body });

    const r1 = await put(c, 'client', 5, 'Explained everything').expect(200);
    expect(r1.body.data).toMatchObject({
      caseId: null,
      fromCase: false,
      authorRole: 'client',
    });
    // One open review per author: a second PUT edits it.
    await put(c, 'client', 4, 'Still great').expect(200);
    await put(b, 'attorney', 2).expect(200);
    const r3 = await put(otherAssistant, 'assistant', 3).expect(200);
    expect(r3.body.data.authorRole).toBe('assistant');
    // Not yourself, not an assistant about their own attorney.
    await api()
      .put(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(a, 'attorney'))
      .send({ rating: 5 })
      .expect(403);
    await put(ownAssistant, 'assistant', 5).expect(403);

    const summary = await api()
      .get(`/api/v1/attorneys/${a}/reviews/summary`)
      .set(bearer(b, 'attorney'))
      .expect(200);
    expect(summary.body.data).toMatchObject({ ratingCount: 3, ratingAvg: 3 });
    const list = await api()
      .get(`/api/v1/attorneys/${a}/reviews`)
      .set(bearer(c, 'client'))
      .expect(200);
    expect(list.body.data).toHaveLength(3);
    const items = list.body.data as {
      id: string;
      authorRole: string;
      isMine: boolean;
    }[];
    const byB = items.find((x) => x.authorRole === 'attorney')!;

    // Google-style: the attorney can't delete it — they reply publicly.
    await api()
      .delete(`/api/v1/reviews/${byB.id}`)
      .set(bearer(a, 'attorney'))
      .expect(404);
    const replied = await api()
      .put(`/api/v1/reviews/${byB.id}/reply`)
      .set(bearer(a, 'attorney'))
      .send({ body: 'We have never worked together — happy to talk.' })
      .expect(200);
    expect(replied.body.data.reply).toContain('never worked');
    expect(replied.body.data.replyAt).toBeTruthy();

    // "Helpful": anyone but the author and the attorney; sort by helpful.
    await api()
      .post(`/api/v1/reviews/${byB.id}/helpful`)
      .set(bearer(c, 'client'))
      .send({ helpful: true })
      .expect(200);
    const voted = await api()
      .post(`/api/v1/reviews/${byB.id}/helpful`)
      .set(bearer(otherAssistant, 'assistant'))
      .send({ helpful: true })
      .expect(200);
    expect(voted.body.data).toMatchObject({
      helpfulCount: 2,
      helpfulByMe: true,
    });
    await api()
      .post(`/api/v1/reviews/${byB.id}/helpful`)
      .set(bearer(a, 'attorney'))
      .send({ helpful: true })
      .expect(403);
    const helpfulFirst = await api()
      .get(`/api/v1/attorneys/${a}/reviews?sort=helpful`)
      .set(bearer(c, 'client'))
      .expect(200);
    expect(helpfulFirst.body.data[0].id).toBe(byB.id);
    const lowest = await api()
      .get(`/api/v1/attorneys/${a}/reviews?sort=lowest`)
      .set(bearer(c, 'client'))
      .expect(200);
    expect(lowest.body.data[0].rating).toBe(2);

    // Anyone flags it against the policy → the moderation queue.
    await api()
      .post(`/api/v1/reviews/${byB.id}/report`)
      .set(bearer(c, 'client'))
      .send({ reason: 'conflict_of_interest' })
      .expect(201);
    await api()
      .post(`/api/v1/reviews/${byB.id}/report`)
      .set(bearer(b, 'attorney'))
      .send({ reason: 'spam' })
      .expect(403); // the author edits or deletes instead
    expect(
      await prisma.report.count({
        where: { target_type: 'review', target_id: byB.id, status: 'open' },
      }),
    ).toBe(1);

    // The author edits any time and deletes their own review.
    const own = await api()
      .get(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(c, 'client'))
      .expect(200);
    expect(own.body.data).toMatchObject({ isMine: true, editable: true });
    await api()
      .delete(`/api/v1/reviews/${own.body.data.id}`)
      .set(bearer(c, 'client'))
      .expect(204);
    const after = await api()
      .get(`/api/v1/attorneys/${a}/reviews/summary`)
      .set(bearer(b, 'attorney'))
      .expect(200);
    expect(after.body.data).toMatchObject({ ratingCount: 2, ratingAvg: 2.5 });
  });

  it('assistants are reviewed and review people too', async () => {
    const b = await attorney();
    const s = await person('assistant');
    const c = await person('client');
    const r = await api()
      .put(`/api/v1/clients/${s}/reviews/mine`)
      .set(bearer(b, 'attorney'))
      .send({ rating: 5, body: 'Fast and precise' })
      .expect(200);
    expect(r.body.data.rating).toBe(5);
    const byAssistant = await api()
      .put(`/api/v1/clients/${c}/reviews/mine`)
      .set(bearer(s, 'assistant'))
      .send({ rating: 4 })
      .expect(200);
    expect(byAssistant.body.data.attorney.role).toBe('assistant');
    const list = await api()
      .get(`/api/v1/clients/${s}/reviews`)
      .set(bearer(c, 'client'))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    // The assistant replies to the review about them; others flag it.
    const rid = list.body.data[0].id as string;
    const reply = await api()
      .put(`/api/v1/client-reviews/${rid}/reply`)
      .set(bearer(s, 'assistant'))
      .send({ body: 'Thank you!' })
      .expect(200);
    expect(reply.body.data).toMatchObject({
      reply: 'Thank you!',
      canReply: true,
    });
    await api()
      .post(`/api/v1/client-reviews/${rid}/helpful`)
      .set(bearer(c, 'client'))
      .send({ helpful: true })
      .expect(200);
    await api()
      .post(`/api/v1/client-reviews/${rid}/report`)
      .set(bearer(c, 'client'))
      .send({ reason: 'off_topic' })
      .expect(201);
    expect(
      await prisma.report.count({
        where: { target_type: 'client_review', target_id: rid },
      }),
    ).toBe(1);
    void randomUUID;
  });
});
