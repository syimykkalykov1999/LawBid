import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner decision 2026-09-30 (docs/OPEN_QUESTIONS.md OQ-034): comments under
 * cases (like post comments), the case feed's category filter, case
 * documents next to the photos.
 */
jest.setTimeout(120_000);

describe('Case comments, category filter, documents (e2e, OQ-034)', () => {
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
      where: { code: 'e2e_cc_cat' },
      create: {
        code: 'e2e_cc_cat',
        name_en: 'Comments cat',
        i18n_key: 'practice.e2e_cc_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_cc_cat.leaf' },
      create: {
        code: 'e2e_cc_cat.leaf',
        parent_id: cat.id,
        name_en: 'Comments leaf',
        i18n_key: 'practice.e2e_cc_cat.leaf',
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

  it('owner and visible attorneys comment; strangers cannot; contacts are refused', async () => {
    const cli = await client();
    const created = await postCase(cli.auth);
    expect(created.status).toBe(201);
    const caseId = created.body.data.id as string;
    const att = await attorney();

    const c1 = await api()
      .post(`/api/v1/cases/${caseId}/comments`)
      .set(att.auth)
      .send({ body: 'Do you have the police report from that day?' });
    expect(c1.status).toBe(201);
    expect(c1.body.data.author.kind).toBe('attorney');
    expect(c1.body.data.byCaseOwner).toBe(false);

    // The owner answers; the client stays anonymous to attorneys.
    const reply = await api()
      .post(`/api/v1/cases/${caseId}/comments`)
      .set(cli.auth)
      .send({ body: 'Yes, I have it.', parentCommentId: c1.body.data.id });
    expect(reply.status).toBe(201);
    expect(reply.body.data.parentCommentId).toBe(c1.body.data.id);
    expect(reply.body.data.author.displayName).toBe('Client');
    expect(reply.body.data.byCaseOwner).toBe(true);

    const leak = await api()
      .post(`/api/v1/cases/${caseId}/comments`)
      .set(att.auth)
      .send({ body: 'Call me at 212 555 0199' });
    expect(leak.status).toBe(400);
    expect(leak.body.error.code).toBe('CASE_CONTAINS_CONTACT_INFO');

    const stranger = await client();
    const denied = await api()
      .get(`/api/v1/cases/${caseId}/comments`)
      .set(stranger.auth);
    expect(denied.status).toBe(404);

    const list = await api()
      .get(`/api/v1/cases/${caseId}/comments`)
      .set(att.auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].replyCount).toBe(1);

    const replies = await api()
      .get(`/api/v1/case-comments/${c1.body.data.id}/replies`)
      .set(att.auth);
    expect(replies.status).toBe(200);
    expect(replies.body.data).toHaveLength(1);

    // Like / unlike are idempotent.
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await api()
            .post(`/api/v1/case-comments/${reply.body.data.id}/like`)
            .set(att.auth)
        ).status,
      ).toBe(204);
    }
    const liked = await api()
      .get(`/api/v1/case-comments/${c1.body.data.id}/replies`)
      .set(att.auth);
    expect(liked.body.data[0].likeCount).toBe(1);
    expect(liked.body.data[0].likedByMe).toBe(true);
    expect(
      (
        await api()
          .delete(`/api/v1/case-comments/${reply.body.data.id}/like`)
          .set(att.auth)
      ).status,
    ).toBe(204);

    // The case owner may delete an attorney's comment (and its replies).
    const del = await api()
      .delete(`/api/v1/case-comments/${c1.body.data.id}`)
      .set(cli.auth);
    expect(del.status).toBe(200);
    const after = await api()
      .get(`/api/v1/cases/${caseId}/comments`)
      .set(att.auth);
    expect(after.body.data).toHaveLength(0);

    // Case comments are reportable.
    const c2 = await api()
      .post(`/api/v1/cases/${caseId}/comments`)
      .set(att.auth)
      .send({ body: 'Happy to review the documents.' });
    const report = await api().post('/api/v1/reports').set(cli.auth).send({
      targetType: 'case_comment',
      targetId: c2.body.data.id,
      reason: 'spam',
    });
    expect([200, 201, 204]).toContain(report.status);
  });

  it('feed items carry commentCount and isSaved; the category filter narrows', async () => {
    const cli = await client();
    const caseId = (await postCase(cli.auth)).body.data.id as string;
    const att = await attorney();
    await prisma.savedItem.create({
      data: { user_id: att.id, item_type: 'case', item_id: caseId },
    });
    const feed = await api()
      .get('/api/v1/cases?practiceCategory=e2e_cc_cat')
      .set(att.auth);
    expect(feed.status).toBe(200);
    const item = (
      feed.body.data as { id: string; isSaved: boolean; commentCount: number }[]
    ).find((x) => x.id === caseId);
    expect(item?.isSaved).toBe(true);
    expect(item?.commentCount).toBe(0);

    const other = await api()
      .get('/api/v1/cases?practiceCategory=family_law')
      .set(att.auth);
    expect(other.status).toBe(200);
    expect(
      (other.body.data as { id: string }[]).some((x) => x.id === caseId),
    ).toBe(false);
  });

  it('a case takes documents (PDF) next to photos, private like photos', async () => {
    const cli = await client();
    const pdf = await prisma.file.create({
      data: {
        owner_user_id: cli.id,
        purpose: 'case_attachment',
        s3_bucket: 'lawbid-documents',
        s3_key: `case-attachments/${randomUUID()}.pdf`,
        mime: 'application/pdf',
        size_bytes: 2048,
        sha256: 'c'.repeat(64),
        scan_status: 'clean',
      },
    });
    const created = await postCase(cli.auth, [pdf.id]);
    expect(created.status).toBe(201);
    const caseId = created.body.data.id as string;
    const att = await attorney();
    const seen = await api().get(`/api/v1/cases/${caseId}`).set(att.auth);
    expect(seen.body.data.photos).toEqual([]);
    expect(seen.body.data.photosCount).toBe(1);
  });

  it('shares are counted on posts and cases (OQ-037)', async () => {
    const cli = await client();
    const caseId = (await postCase(cli.auth)).body.data.id as string;
    const att = await attorney();
    for (let i = 0; i < 2; i++) {
      expect(
        (await api().post(`/api/v1/cases/${caseId}/share`).set(att.auth))
          .status,
      ).toBe(204);
    }
    const seen = await api().get(`/api/v1/cases/${caseId}`).set(att.auth);
    expect(seen.body.data.shareCount).toBe(2);
    const stranger = await client();
    expect(
      (await api().post(`/api/v1/cases/${caseId}/share`).set(stranger.auth))
        .status,
    ).toBe(404);

    const post = await api()
      .post('/api/v1/posts')
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'Know your rights at a traffic stop #traffic',
      });
    expect(post.status).toBe(201);
    const postId = post.body.data.id as string;
    expect(
      (await api().post(`/api/v1/posts/${postId}/share`).set(cli.auth)).status,
    ).toBe(204);
    const read = await api().get(`/api/v1/posts/${postId}`).set(cli.auth);
    expect(read.body.data.shareCount).toBe(1);
  });
});
