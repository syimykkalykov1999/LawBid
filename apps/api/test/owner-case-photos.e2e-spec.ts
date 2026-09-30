import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner decision 2026-09-30 (docs/OPEN_QUESTIONS.md OQ-031): a case has
 * 0-9 photos. The owner always sees them; an attorney sees them only after
 * THEIR bid was accepted — every other attorney sees just the count.
 */
jest.setTimeout(120_000);

describe('Case photos (e2e, OQ-031)', () => {
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
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_photos_cat' },
      create: {
        code: 'e2e_photos_cat',
        name_en: 'Photos cat',
        i18n_key: 'practice.e2e_photos_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_photos_cat.leaf' },
      create: {
        code: 'e2e_photos_cat.leaf',
        parent_id: cat.id,
        name_en: 'Photos leaf',
        i18n_key: 'practice.e2e_photos_cat.leaf',
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

  /** A clean case_photo file row (the upload pipeline is covered by the
   * files e2e; here only ownership/purpose/scan status matter). */
  async function photo(ownerId: string) {
    const f = await prisma.file.create({
      data: {
        owner_user_id: ownerId,
        purpose: 'case_photo',
        s3_bucket: 'lawbid-documents',
        s3_key: `case-photos/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 1000,
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
      },
    });
    return f.id;
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

  it('owner sees photos; other attorneys only the count; the accepted attorney sees them', async () => {
    const cli = await client();
    const p1 = await photo(cli.id);
    const p2 = await photo(cli.id);
    const created = await postCase(cli.auth, [p1, p2]);
    expect(created.status).toBe(201);
    const caseId = created.body.data.id as string;

    const own = await api()
      .get(`/api/v1/users/me/cases/${caseId}`)
      .set(cli.auth);
    expect(own.status).toBe(200);
    expect(
      (own.body.data.photos as { fileId: string }[]).map((x) => x.fileId),
    ).toEqual([p1, p2]);

    const bidder = await attorney();
    const seen = await api().get(`/api/v1/cases/${caseId}`).set(bidder.auth);
    expect(seen.status).toBe(200);
    expect(seen.body.data.photos).toEqual([]);
    expect(seen.body.data.photosCount).toBe(2);

    // Accept this attorney's bid (raw rows: bids have their own e2e).
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: bidder.id,
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
    const accepted = await api()
      .get(`/api/v1/cases/${caseId}`)
      .set(bidder.auth);
    expect(accepted.status).toBe(200);
    expect(
      (accepted.body.data.photos as { fileId: string }[]).map((x) => x.fileId),
    ).toEqual([p1, p2]);
  });

  it('rejects more than 9 photos, foreign files and other purposes', async () => {
    const cli = await client();
    const ten = await Promise.all(
      Array.from({ length: 10 }, () => photo(cli.id)),
    );
    expect((await postCase(cli.auth, ten)).status).toBe(400);

    const other = await client();
    const foreign = await photo(other.id);
    expect((await postCase(cli.auth, [foreign])).status).toBe(404);

    const avatar = await prisma.file.create({
      data: {
        owner_user_id: cli.id,
        purpose: 'avatar',
        s3_bucket: 'lawbid-media',
        s3_key: `avatars/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        size_bytes: 1000,
        sha256: 'b'.repeat(64),
        scan_status: 'clean',
      },
    });
    const wrong = await postCase(cli.auth, [avatar.id]);
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe('FILE_NOT_ATTACHABLE');

    // Zero photos is fine.
    expect((await postCase(cli.auth, [])).status).toBe(201);
  });
});
