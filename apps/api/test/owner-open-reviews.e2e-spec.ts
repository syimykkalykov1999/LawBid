import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-06: an attorney is reviewed only by a client who completed
 * a case with them (one review per client, tied to that case); clients and
 * assistants are still reviewed by anyone (owner 2026-10-01). Removal: the
 * author deletes; the reviewed attorney appeals (admin decides).
 */
jest.setTimeout(120_000);

describe('Reviews by who worked together (e2e, owner 2026-10-06)', () => {
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

  let practiceAreaId = '';
  /** A closed case of [clientId] with [attorneyId]'s bid accepted. */
  async function completedCase(
    clientId: string,
    attorneyId: string,
    status: 'closed' | 'in_progress' = 'closed',
  ): Promise<string> {
    if (!practiceAreaId) {
      await prisma.state.upsert({
        where: { code: 'NY' },
        create: { code: 'NY', name: 'New York', is_active: true },
        update: {},
      });
      const area = await prisma.practiceArea.upsert({
        where: { code: 'e2e_open_reviews_leaf' },
        create: {
          code: 'e2e_open_reviews_leaf',
          name_en: 'E2E open reviews',
          i18n_key: 'practice.e2e_open_reviews_leaf',
          sort: 1,
        },
        update: {},
      });
      practiceAreaId = area.id;
    }
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Lease review',
        description: 'Review my apartment lease.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status,
        closed_at: status === 'closed' ? new Date() : null,
      },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: attorneyId,
        status: 'accepted',
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'I can help.',
        start_availability: 'immediately',
        turn: 'client',
        decided_at: new Date(),
      },
    });
    await prisma.case.update({
      where: { id: c.id },
      data: { accepted_bid_id: bid.id },
    });
    return c.id;
  }

  it('only clients who completed a case review an attorney', async () => {
    const a = await attorney();
    const b = await attorney();
    const c = await person('client');
    const c2 = await person('client');
    const c3 = await person('client');
    const stranger = await person('client');
    const ongoing = await person('client');
    const caseId = await completedCase(c, a);
    await completedCase(c2, a);
    await completedCase(c3, a);
    await completedCase(ongoing, a, 'in_progress');
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

    // Owner 2026-10-01 (Google Maps-style): photos in the review.
    const photo = await prisma.file.create({
      data: {
        owner_user_id: c,
        purpose: 'review_photo',
        s3_bucket: 'media',
        s3_key: `review/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 1000n,
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
        is_public: true,
      },
    });
    const foreign = await prisma.file.create({
      data: {
        owner_user_id: c,
        purpose: 'post_image',
        s3_bucket: 'media',
        s3_key: `post/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 1000n,
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
        is_public: true,
      },
    });
    await api()
      .put(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(c, 'client'))
      .send({ rating: 5, photoIds: [foreign.id] })
      .expect(409); // FILE_NOT_ATTACHABLE: not a review photo
    const r1 = await api()
      .put(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(c, 'client'))
      .send({ rating: 5, body: 'Explained everything', photoIds: [photo.id] })
      .expect(200);
    expect(r1.body.data.photos).toHaveLength(1);
    expect(r1.body.data.photos[0].fileId).toBe(photo.id);
    expect(r1.body.data.authorReviewCount).toBe(1);
    expect(r1.body.data).toMatchObject({
      caseId,
      fromCase: true,
      authorRole: 'client',
    });
    // One review per client and attorney: a second PUT edits it.
    await put(c, 'client', 4, 'Still great').expect(200);
    await put(c2, 'client', 2).expect(200);
    await put(c3, 'client', 3).expect(200);
    // Never worked together (or not finished yet) → 403, with the reason
    // already on GET .../mine so the app hides the button.
    for (const [who, role] of [
      [stranger, 'client'],
      [ongoing, 'client'],
      [b, 'attorney'],
      [otherAssistant, 'assistant'],
      [ownAssistant, 'assistant'],
    ] as const) {
      const res = await put(who, role, 5).expect(403);
      expect(res.body.error.code).toBe('REVIEW_CASE_NOT_CLOSED');
    }
    const why = await api()
      .get(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(stranger, 'client'))
      .expect(403);
    expect(why.body.error.code).toBe('REVIEW_CASE_NOT_CLOSED');
    await api()
      .put(`/api/v1/attorneys/${a}/reviews/mine`)
      .set(bearer(a, 'attorney'))
      .send({ rating: 5 })
      .expect(403);

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
      rating: number;
      isMine: boolean;
    }[];
    const byB = items.find((x) => x.rating === 2)!;

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
      .set(bearer(c2, 'client'))
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
