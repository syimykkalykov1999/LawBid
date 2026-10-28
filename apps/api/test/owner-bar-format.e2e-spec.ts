import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { DEFAULT_BAR_FORMATS } from '../src/modules/verification/bar-number-format';

/**
 * Owner 2026-10-14 / 2026-10-18: a bar number must have its state's shape (a
 * number that does not fit is refused, the format is never shown), and wrong
 * ones cool down in steps (5 wrong → 1 h, then 12 h, then 24 h), never a
 * permanent block. A real attorney sends a refused number for manual review
 * with the bar card, also while locked.
 */
jest.setTimeout(120_000);

describe('Bar number format and stepped cooldown (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let tokens: TokenService;

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
    base = `http://127.0.0.1:${(app.getHttpServer() as Server).address() ? ((app.getHttpServer() as Server).address() as AddressInfo).port : 0}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'MI' },
      create: { code: 'MI', name: 'Michigan', is_active: true },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York', is_active: true },
      update: {},
    });
    // The real table for this suite (the global setup loosens it).
    await prisma.appConfig.deleteMany({
      where: { key: 'verification.bar_formats' },
    });
    // This suite tests bar numbers, not ID + selfie (required by default since
    // owner 2026-10-28; covered in verification.e2e-spec).
    await prisma.appConfig.upsert({
      where: { key: 'verification.require_identity' },
      create: { key: 'verification.require_identity', value: false },
      update: { value: false },
    });
    await redis.del('config:app_config');
  });

  afterAll(async () => {
    // Back to the loose table the other suites rely on.
    const loose = Object.fromEntries(
      Object.keys(DEFAULT_BAR_FORMATS).map((state) => [
        state,
        { pattern: '^[A-Z0-9]{3,32}$', example: 'ABC123' },
      ]),
    );
    await prisma.appConfig.upsert({
      where: { key: 'verification.bar_formats' },
      create: { key: 'verification.bar_formats', value: JSON.stringify(loose) },
      update: { value: JSON.stringify(loose) },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `bf_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
      },
    });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'attorney',
        sid: randomUUID(),
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
    const draft = await request(base)
      .post('/api/v1/verification/requests')
      .set(auth)
      .expect(201);
    return { id: u.id, auth, requestId: draft.body.data.id as string };
  }

  const add = (
    a: { auth: Record<string, string>; requestId: string },
    stateCode: string,
    barNumber: string,
    manualReview?: boolean,
  ) =>
    request(base)
      .post(`/api/v1/verification/requests/${a.requestId}/licenses`)
      .set(a.auth)
      .send({ stateCode, barNumber, ...(manualReview && { manualReview }) });

  async function cleanFile(ownerId: string): Promise<string> {
    const id = randomUUID();
    await prisma.file.create({
      data: {
        id,
        owner_user_id: ownerId,
        purpose: 'verification_document',
        s3_bucket: process.env.S3_BUCKET_DOCUMENTS ?? 'lawbid-documents',
        s3_key: `verification_document/${ownerId}/${id}`,
        mime: 'image/jpeg',
        size_bytes: BigInt(1234),
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
      },
    });
    return id;
  }

  const clearCooldown = (userId: string) =>
    redis.del(
      `bar:cool:u:${userId}`,
      'bar:cool:ip:127.0.0.1',
      'bar:cool:ip:::ffff:127.0.0.1',
    );

  /** Owner 2026-10-18: no response ever shows the state's format. */
  function expectNoExample(body: unknown, state: string) {
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/example|pattern/i);
    expect(text).not.toContain(DEFAULT_BAR_FORMATS[state].example);
  }

  it("a number must fit the state's shape; a good one is stored without separators", async () => {
    await redis.flushdb();
    const a = await attorney();
    const bad = await add(a, 'MI', 'ABC');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAR_NUMBER_FORMAT_INVALID');
    // Owner 2026-10-14: the shape is never revealed to the client.
    expect(bad.body.error.details).toEqual({ stateCode: 'MI' });
    expectNoExample(bad.body, 'MI');
    const ok = await add(a, 'MI', 'p-12345');
    expect(ok.status).toBe(201);
    const row = await prisma.attorneyLicense.findFirstOrThrow({
      where: { attorney_id: a.id },
    });
    expect(row.bar_number).toBe('P12345');
    await redis.flushdb();
  });

  // Owner 2026-10-18: a number that does not fit is REFUSED (generic text,
  // no example), counts as a failed attempt, and its shape is logged.
  it('a non-fitting number is refused, never added, and its shape is logged', async () => {
    await redis.flushdb();
    const a = await attorney();
    const res = await add(a, 'NY', 'A1B2C3');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAR_NUMBER_FORMAT_INVALID');
    expect(res.body.error.details).toEqual({ stateCode: 'NY' });
    expectNoExample(res.body, 'NY');
    expect(
      await prisma.attorneyLicense.count({ where: { attorney_id: a.id } }),
    ).toBe(0);
    const miss = await prisma.barFormatMiss.findUniqueOrThrow({
      where: { state_code_shape: { state_code: 'NY', shape: 'A9A9A9' } },
    });
    expect(miss.hits).toBeGreaterThanOrEqual(1);
    expect(await redis.get(`bar:fails:u:${a.id}`)).toBe('1');
    await redis.flushdb();
  });

  it('five failed attempts → locked for exactly 1 hour (retryAfterSeconds); later locks step up', async () => {
    await redis.flushdb();
    const a = await attorney();
    for (let i = 0; i < 4; i += 1) {
      const r = await add(a, 'NY', i % 2 ? 'ABC' : 'A1B2C3');
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('BAR_NUMBER_FORMAT_INVALID');
    }
    const fifth = await add(a, 'NY', 'A1B2C3');
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('BAR_ATTEMPTS_COOLDOWN');
    expect(fifth.body.error.details.retryAfterSeconds).toBe(3600);
    expectNoExample(fifth.body, 'NY');
    // Even a right number waits out the lock.
    const right = await add(a, 'NY', '1234567');
    expect(right.status).toBe(429);
    expect(right.body.error.details.retryAfterSeconds).toBeGreaterThan(3500);
    // The app learns the lock up front.
    const me = await request(base)
      .get('/api/v1/verification/me')
      .set(a.auth)
      .expect(200);
    expect(me.body.data.barAttemptsRetryAfterSeconds).toBeGreaterThan(3500);
    // Time passes (the lock key ends), the counter stays: the next five → 12 h.
    await clearCooldown(a.id);
    for (let i = 0; i < 4; i += 1) await add(a, 'NY', 'ABC');
    const tenth = await add(a, 'NY', 'ABC');
    expect(tenth.body.error.details.retryAfterSeconds).toBe(12 * 3600);
    await clearCooldown(a.id);
    for (let i = 0; i < 4; i += 1) await add(a, 'NY', 'ABC');
    const fifteenth = await add(a, 'NY', 'ABC');
    expect(fifteenth.body.error.details.retryAfterSeconds).toBe(24 * 3600);
    await redis.flushdb();
  });

  // Owner 2026-10-18: «Мой номер верный — отправить на проверку» — the real
  // attorney's path, open while locked: the number, the state and the bar
  // card (with an optional note) go to a person.
  it('manual review is accepted while locked; the bar card is required and the note reaches the admin', async () => {
    await redis.flushdb();
    const a = await attorney();
    for (let i = 0; i < 5; i += 1) await add(a, 'NY', 'A1B2C3');
    expect((await add(a, 'NY', 'A1B2C3')).status).toBe(429);
    const manual = await add(a, 'NY', 'a1b2c3', true);
    expect(manual.status).toBe(201);
    expectNoExample(manual.body, 'NY');
    const licenses = (
      manual.body as {
        data: {
          licenses: {
            state: { code: string };
            manualReview: boolean;
            barNumber: string;
          }[];
        };
      }
    ).data.licenses;
    const lic = licenses.find((l) => l.state.code === 'NY');
    expect(lic?.manualReview).toBe(true);
    expect(lic?.barNumber).toBe('A1B2C3');
    const row = await prisma.attorneyLicense.findFirstOrThrow({
      where: { attorney_id: a.id },
    });
    expect(row.registry_flag).toBe('format_unusual');
    expect(row.license_status).toBe('pending');
    // The manual path does not count as another failed attempt.
    expect(await redis.get(`bar:fails:u:${a.id}`)).toBe('5');
    // No card → not submittable.
    const incomplete = await request(base)
      .post(`/api/v1/verification/requests/${a.requestId}/submit`)
      .set(a.auth)
      .send({ attestation: true });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.details.missing).toContain('bar_license:NY');
    await request(base)
      .post(`/api/v1/verification/requests/${a.requestId}/documents`)
      .set(a.auth)
      .send({
        fileId: await cleanFile(a.id),
        docType: 'bar_license',
        stateCode: 'NY',
        note: '  Issued 1998, old format  ',
      })
      .expect(201);
    const doc = await prisma.verificationDocument.findFirstOrThrow({
      where: { request_id: a.requestId, doc_type: 'bar_license' },
    });
    expect(doc.notes).toBe('Issued 1998, old format');
    const sent = await request(base)
      .post(`/api/v1/verification/requests/${a.requestId}/submit`)
      .set(a.auth)
      .send({ attestation: true });
    expect(sent.status).toBe(200);
    // Junk is refused even on the manual path (and is not counted there).
    const b = await attorney();
    const junk = await add(b, 'NY', 'ABC', true);
    expect(junk.status).toBe(400);
    expect(junk.body.error.code).toBe('BAR_NUMBER_FORMAT_INVALID');
    await redis.flushdb();
  });
});
