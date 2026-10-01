import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClientReviewsService } from '../src/modules/client-reviews/client-reviews.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner decision 2026-09-30 (docs/OPEN_QUESTIONS.md OQ-038). */
jest.setTimeout(120_000);

describe('Client profile: posts, follows, attorney reviews (e2e, OQ-038)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_cp_cat' },
      create: {
        code: 'e2e_cp_cat',
        name_en: 'Client cat',
        i18n_key: 'practice.e2e_cp_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_cp_cat.leaf' },
      create: {
        code: 'e2e_cp_cat.leaf',
        parent_id: cat.id,
        name_en: 'Client leaf',
        i18n_key: 'practice.e2e_cp_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function client() {
    const now = new Date();
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: now,
        email_verified_at: now,
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: u.id, completed_at: now },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  function postCase(a: Record<string, string>, photoFileIds?: string[]) {
    return api()
      .post('/api/v1/cases')
      .set(a)
      .set('Idempotency-Key', randomUUID())
      .send({
        practiceAreaId: leafId,
        title: 'Car accident on the highway',
        description:
          'Another driver hit my car at a red light and the insurer refuses to pay for repairs.',
        primaryStateCode: 'NY',
        budgetMode: 'clarify_later',
        clientContactSharingConsent: true,
        ...(photoFileIds ? { photoFileIds } : {}),
      });
  }

  async function withProfile(id: string) {
    const handle = `cl${randomUUID().slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: id,
        state_code: 'NY',
        preferred_languages: ['en'],
        username: handle,
        username_lower: handle,
      },
    });
    return handle;
  }

  it('a client posts, is followed, and the counters move', async () => {
    const cli = await client();
    const handle = await withProfile(cli.id);
    const post = await api()
      .post('/api/v1/posts')
      .set(cli.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'How I found a great lawyer here #familylaw',
      });
    expect(post.status).toBe(201);
    expect(post.body.data.author.role).toBe('client');
    expect(post.body.data.author.username).toBe(handle);

    const att = await attorney();
    expect(
      (await api().post(`/api/v1/attorneys/${cli.id}/follow`).set(att.auth))
        .status,
    ).toBe(204);
    const followers = await api()
      .get(`/api/v1/attorneys/${cli.id}/followers`)
      .set(att.auth);
    expect(followers.status).toBe(200);
    expect(followers.body.data).toHaveLength(1);

    const profile = await api().get(`/api/v1/clients/${handle}`).set(att.auth);
    expect(profile.status).toBe(200);
    expect(profile.body.data.isFollowing).toBe(true);
    expect(profile.body.data.canSeeReviews).toBe(true);

    const posts = await api()
      .get(`/api/v1/attorneys/${cli.id}/posts`)
      .set(att.auth);
    expect(posts.status).toBe(200);
    expect(posts.body.data).toHaveLength(1);
  });

  it('the hired attorney reviews the client from the case; everyone reads', async () => {
    const cli = await client();
    const handle = await withProfile(cli.id);
    const caseId = (await postCase(cli.auth)).body.data.id as string;
    const att = await attorney();
    const early = await api()
      .put(`/api/v1/cases/${caseId}/client-review`)
      .set(att.auth)
      .send({ rating: 5 });
    expect(early.status).toBe(403);

    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: att.id,
        fee_type: 'fixed',
        amount_cents: 50000,
        message: 'I handle these every week and can start today.',
        start_availability: 'immediately',
        turn: 'client',
        status: 'accepted',
        decided_at: new Date(),
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { accepted_bid_id: bid.id, status: 'in_progress' },
    });
    const ok = await api()
      .put(`/api/v1/cases/${caseId}/client-review`)
      .set(att.auth)
      .send({ rating: 4, body: 'Clear, on time, answered fast.' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.rating).toBe(4);

    const byAttorney = await api()
      .get(`/api/v1/clients/${cli.id}/reviews`)
      .set((await attorney()).auth);
    expect(byAttorney.status).toBe(200);
    expect(byAttorney.body.data).toHaveLength(1);
    const bySelf = await api()
      .get(`/api/v1/clients/${cli.id}/reviews`)
      .set(cli.auth);
    expect(bySelf.status).toBe(200);
    // Owner 2026-09-30: other clients read client reviews too.
    const other = await client();
    expect(
      (await api().get(`/api/v1/clients/${cli.id}/reviews`).set(other.auth))
        .status,
    ).toBe(200);
    const seenByClient = await api()
      .get(`/api/v1/clients/${handle}`)
      .set(other.auth);
    expect(seenByClient.body.data.canSeeReviews).toBe(true);
    expect(seenByClient.body.data.ratingAvg).toBe(4);
    const seenByAttorney = await api()
      .get(`/api/v1/clients/${handle}`)
      .set(att.auth);
    expect(seenByAttorney.body.data.ratingAvg).toBe(4);
    expect(seenByAttorney.body.data.ratingCount).toBe(1);

    // Reviews tab summary + star filter, like the attorney's (owner).
    const summary = await api()
      .get(`/api/v1/clients/${cli.id}/reviews/summary`)
      .set(cli.auth);
    expect(summary.status).toBe(200);
    expect(summary.body.data.ratingAvg).toBe(4);
    expect(summary.body.data.distribution).toEqual([
      { stars: 5, count: 0 },
      { stars: 4, count: 1 },
      { stars: 3, count: 0 },
      { stars: 2, count: 0 },
      { stars: 1, count: 0 },
    ]);
    expect(
      (
        await api()
          .get(`/api/v1/clients/${cli.id}/reviews/summary`)
          .set(other.auth)
      ).status,
    ).toBe(200);
    const fours = await api()
      .get(`/api/v1/clients/${cli.id}/reviews?rating=4&sort=oldest`)
      .set(cli.auth);
    expect(fours.body.data).toHaveLength(1);
    const ones = await api()
      .get(`/api/v1/clients/${cli.id}/reviews?rating=1`)
      .set(cli.auth);
    expect(ones.body.data).toHaveLength(0);
  });

  it('anyone reviews a client once; the author deletes; the client appeals', async () => {
    const cli = await client();
    await withProfile(cli.id);
    const author = await client();
    await prisma.user.update({
      where: { id: author.id },
      data: { phone_verified_at: new Date() },
    });
    const att = await attorney();

    const self = await api()
      .put(`/api/v1/clients/${cli.id}/reviews/mine`)
      .set(cli.auth)
      .send({ rating: 5 });
    expect(self.status).toBe(403);

    const byClient = await api()
      .put(`/api/v1/clients/${cli.id}/reviews/mine`)
      .set(author.auth)
      .send({ rating: 1, body: 'Did not pay for the work we agreed on.' });
    expect(byClient.status).toBe(200);
    expect(byClient.body.data.caseId).toBeNull();
    expect(byClient.body.data.attorney.role).toBe('client');
    // An edit replaces it — still one review.
    const again = await api()
      .put(`/api/v1/clients/${cli.id}/reviews/mine`)
      .set(author.auth)
      .send({ rating: 2 });
    expect(again.body.data.id).toBe(byClient.body.data.id);
    const byAttorney = await api()
      .put(`/api/v1/clients/${cli.id}/reviews/mine`)
      .set(att.auth)
      .send({ rating: 3 });
    expect(byAttorney.status).toBe(200);

    const list = await api()
      .get(`/api/v1/clients/${cli.id}/reviews`)
      .set(cli.auth);
    expect(list.body.data).toHaveLength(2);
    const mine = (list.body.data as { id: string; canAppeal: boolean }[]).find(
      (r) => r.id === byClient.body.data.id,
    );
    expect(mine?.canAppeal).toBe(true);

    // The reviewed client appeals once.
    const appeal = await api()
      .post(`/api/v1/client-reviews/${byClient.body.data.id}/appeal`)
      .set(cli.auth)
      .send({ reason: 'I paid in full, here is why this is wrong.' });
    expect(appeal.status).toBe(200);
    expect(appeal.body.data.appealStatus).toBe('pending');
    expect(appeal.body.data.canAppeal).toBe(false);
    const twice = await api()
      .post(`/api/v1/client-reviews/${byClient.body.data.id}/appeal`)
      .set(cli.auth)
      .send({ reason: 'again' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('REVIEW_APPEAL_EXISTS');
    // Someone else cannot appeal it.
    expect(
      (
        await api()
          .post(`/api/v1/client-reviews/${byAttorney.body.data.id}/appeal`)
          .set(author.auth)
          .send({ reason: 'not mine' })
      ).status,
    ).toBe(404);

    // Admins accept in bulk → the review goes; undecided ones expire.
    const reviews = app.get(ClientReviewsService);
    const pending = await reviews.listAppeals('pending');
    const ours = pending.items.filter((a) => a.clientId === cli.id);
    expect(ours).toHaveLength(1);
    expect(
      await reviews.decideAppeals(randomUUID(), {
        ids: ours.map((a) => a.id),
        decision: 'accept',
      }),
    ).toEqual({ decided: 1 });
    const afterAccept = await api()
      .get(`/api/v1/clients/${cli.id}/reviews`)
      .set(cli.auth);
    expect(afterAccept.body.data).toHaveLength(1);

    const appeal2 = await api()
      .post(`/api/v1/client-reviews/${byAttorney.body.data.id}/appeal`)
      .set(cli.auth)
      .send({ reason: 'Never worked with this attorney.' });
    expect(appeal2.status).toBe(200);
    const future = new Date(Date.now() + 31 * 24 * 3600 * 1000);
    expect(await reviews.sweepAppeals(future)).toBeGreaterThanOrEqual(1);
    const afterSweep = await api()
      .get(`/api/v1/clients/${cli.id}/reviews`)
      .set(cli.auth);
    expect(afterSweep.body.data).toHaveLength(0);

    // The author deletes their own review at any time.
    const third = await api()
      .put(`/api/v1/clients/${cli.id}/reviews/mine`)
      .set(author.auth)
      .send({ rating: 4 });
    expect(third.status).toBe(200);
    expect(
      (
        await api()
          .delete(`/api/v1/client-reviews/${third.body.data.id}`)
          .set(cli.auth)
      ).status,
    ).toBe(404);
    expect(
      (
        await api()
          .delete(`/api/v1/client-reviews/${third.body.data.id}`)
          .set(author.auth)
      ).status,
    ).toBe(204);
  });
});
