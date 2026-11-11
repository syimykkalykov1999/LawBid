import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import sharp from 'sharp';
import { briefFileIdOf } from '../src/modules/cases/brief/attorney-brief.service';

/**
 * Sweep A-c1 (owner A-044, 2026-11-09): after a bid is accepted the
 * attorney gets one PDF — client contacts, accepted terms, up to 9 case
 * photos — in the case's Files; the client's list never shows it and the
 * PDF route answers 404 to the client and to strangers. Object store =
 * in-memory fake.
 */
jest.setTimeout(180_000);

class FakeS3 {
  readonly configured = true;
  readonly objects = new Map<string, Buffer>();
  bucket(kind: string): string {
    return `fake-${kind}`;
  }
  // The real service loads its keys and the R2 switch first (R-407).
  ready(): Promise<boolean> {
    return Promise.resolve(true);
  }
  resolveBucket(kind: string): Promise<string> {
    return Promise.resolve(this.bucket(kind));
  }
  // Owner 2026-11-08: where new public media may go (the switch is off here).
  publicStoreState(): Promise<'aws'> {
    return Promise.resolve('aws');
  }
  // The real service answers these for the R2 public-store switch (off here).
  isPublicStoreBucket(): boolean {
    return false;
  }
  awsBucket(kind: string): string {
    return this.bucket(kind);
  }
  put(bucket: string, key: string, body: Buffer): Promise<void> {
    this.objects.set(`${bucket}/${key}`, Buffer.from(body));
    return Promise.resolve();
  }
  read(bucket: string, key: string): Promise<Buffer> {
    const b = this.objects.get(`${bucket}/${key}`);
    if (!b) return Promise.reject(new Error('missing object'));
    return Promise.resolve(b);
  }
  signedGetUrl(bucket: string, key: string): Promise<string> {
    return Promise.resolve(`https://fake.test/${bucket}/${key}`);
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  ensureBuckets(): Promise<void> {
    return Promise.resolve();
  }
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('Attorney case brief (e2e, sweep A-c1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let s3: FakeS3;
  let baseUrl = '';
  let practiceAreaId = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    s3 = new FakeS3();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(S3StorageService)
      .useValue(s3)
      .compile();
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
    redis = app.get<Redis>(REDIS_CLIENT);
    // The plain accept (the deal-record path calls the same acceptInTx).
    await prisma.appConfig.upsert({
      where: { key: 'deal_record.enabled' },
      create: { key: 'deal_record.enabled', value: false },
      update: { value: false },
    });
    await redis.del('config:app_config');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_brief_leaf' },
      create: {
        code: 'e2e_brief_leaf',
        name_en: 'E2E attorney brief',
        i18n_key: 'practice.e2e_brief_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: 'deal_record.enabled' },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
    names: { first: string; last: string | null } = {
      first: role === 'client' ? 'Anna' : 'John',
      last: role === 'client' ? 'Petrova' : 'Smith',
    },
  ) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: names.first,
        last_name: names.last,
        email: `${role}_${randomUUID().slice(0, 8)}@example.com`,
        phone_e164: `+1201${Math.floor(2_000_000 + Math.random() * 7_999_999)}`,
        phone_verified_at: new Date(),
      },
    });
    const handle = `${role.slice(0, 2)}_${u.id.slice(0, 8)}`;
    if (role === 'client') {
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NJ',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    } else {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: handle,
          username_lower: handle,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${u.id.slice(0, 6)}`,
          license_status: 'verified',
        },
      });
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: practiceAreaId },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function kase(clientId: string): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton — штраф (ң ө ү)',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  /** A clean case photo of the client (stored in the fake S3). */
  async function photo(clientId: string, caseId: string, i: number) {
    const id = randomUUID();
    const key = `case_photo/${clientId}/${id}`;
    const png = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 10 * i, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    s3.objects.set(`fake-documents/${key}`, png);
    await prisma.file.create({
      data: {
        id,
        owner_user_id: clientId,
        purpose: 'case_photo',
        s3_bucket: 'fake-documents',
        s3_key: key,
        mime: 'image/jpeg',
        size_bytes: BigInt(png.length),
        sha256: sha256(png),
        scan_status: 'clean',
      },
    });
    await prisma.casePhoto.create({
      data: { case_id: caseId, file_id: id, position: i, source: 'case' },
    });
  }

  async function hired() {
    const client = await user('client');
    const att = await user('attorney');
    const caseId = await kase(client.id);
    for (let i = 0; i < 11; i++) await photo(client.id, caseId, i);
    const bid = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 60_000,
        message: 'I handle NJ speeding tickets every week, happy to help.',
        startAvailability: 'immediately',
      })
      .expect(201);
    const bidId = bid.body.data.id as string;
    return { client, att, caseId, bidId };
  }

  const pdf = (auth: Record<string, string>, caseId: string) =>
    api()
      .get(`/api/v1/cases/${caseId}/attorney-brief.pdf`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  it('before acceptance there is no brief (404 for everyone)', async () => {
    const { client, att, caseId } = await hired();
    expect((await pdf(att.auth, caseId)).status).toBe(404);
    expect((await pdf(client.auth, caseId)).status).toBe(404);
  });

  it('after acceptance: the attorney gets the PDF and sees it in Files; the client and a stranger do not', async () => {
    const { client, att, caseId, bidId } = await hired();
    await api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(client.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const a = await pdf(att.auth, caseId);
    expect(a.status).toBe(200);
    expect(a.headers['content-type']).toContain('application/pdf');
    const bytes = a.body as Buffer;
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    // Stored once, under the bid's name-based id, owned by the attorney.
    const file = await prisma.file.findUnique({
      where: { id: briefFileIdOf(bidId) },
    });
    expect(file?.owner_user_id).toBe(att.id);
    expect(file?.mime).toBe('application/pdf');

    // Bytes stable: the second download is the same file.
    const b = await pdf(att.auth, caseId);
    expect(sha256(b.body as Buffer)).toBe(sha256(bytes));

    // Access: the client and a stranger get 404.
    const stranger = await user('attorney');
    expect((await pdf(client.auth, caseId)).status).toBe(404);
    expect((await pdf(stranger.auth, caseId)).status).toBe(404);

    // Files: the attorney's list carries it (last), the client's never.
    const attFiles = await api()
      .get(`/api/v1/cases/${caseId}/files`)
      .set(att.auth)
      .expect(200);
    const ids = (attFiles.body.data as { fileId: string }[]).map(
      (f) => f.fileId,
    );
    expect(ids[ids.length - 1]).toBe(briefFileIdOf(bidId));
    const clientFiles = await api()
      .get(`/api/v1/cases/${caseId}/files`)
      .set(client.auth)
      .expect(200);
    expect(
      (clientFiles.body.data as { fileId: string }[]).map((f) => f.fileId),
    ).not.toContain(briefFileIdOf(bidId));
    expect(
      await prisma.file.count({ where: { id: briefFileIdOf(bidId) } }),
    ).toBe(1);
  });
});
