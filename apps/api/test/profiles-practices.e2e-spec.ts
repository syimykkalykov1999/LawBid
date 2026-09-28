import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { LicenseExpiryJob } from '../src/jobs/handlers/license-expiry.job';
import { PRACTICE_TREE_CACHE_KEY } from '../src/modules/profiles/services/practice-areas.service';

/**
 * docs/03_VERIFICATION_PROFILES.md stages 3.5 (practices, license
 * expiry) and 3.6 (profiles API), against real CockroachDB + Redis.
 *
 * Acceptance 3.5: practices before `verified` -> ATTORNEY_NOT_VERIFIED;
 * the last license expiring makes the profile `unverified`; the §5.4
 * cases query (canonical shape: db-roles-indexes.e2e-spec.ts) stops
 * returning the expired license's states.
 * Acceptance 3.6: someone else's client profile is unavailable (404);
 * the public profile has no bar number and no files; a username change
 * more often than once per 30 days is rejected.
 */
jest.setTimeout(60_000);

describe('Profiles and practices (e2e) — docs/03 stages 3.5–3.6', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';
  let phoneSeq = 0;
  const DAY = 24 * 60 * 60 * 1000;

  let leafA: string;
  let leafB: string;
  let leafInactive: string;
  let categoryId: string;
  const tag = randomUUID().slice(0, 8);

  const api = () => request(baseUrl);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);

    for (const [code, name] of [
      ['NY', 'New York'],
      ['NJ', 'New Jersey'],
      ['CA', 'California'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    const cat = await prisma.practiceArea.create({
      data: {
        code: `e2e_${tag}`,
        name_en: `E2E ${tag}`,
        i18n_key: `practice.e2e_${tag}`,
        sort: 999,
      },
    });
    categoryId = cat.id;
    const leaf = async (name: string, active = true) =>
      (
        await prisma.practiceArea.create({
          data: {
            code: `e2e_${tag}.${name}`,
            parent_id: cat.id,
            name_en: name,
            i18n_key: `practice.e2e_${tag}.${name}`,
            sort: 0,
            is_active: active,
          },
        })
      ).id;
    leafA = await leaf('a');
    leafB = await leaf('b');
    leafInactive = await leaf('off', false);
    await app.get<Redis>(REDIS_CLIENT).del(PRACTICE_TREE_CACHE_KEY);
  });

  afterAll(async () => {
    await app.close();
  });

  // The whole suite talks from 127.0.0.1; the global 100 req/min per-IP
  // throttler is not under test here (isolated e2e Redis DB).
  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = await redis.keys('throttle*');
    if (keys.length > 0) await redis.del(...keys);
  });

  function nextPhone(): string {
    phoneSeq += 1;
    return `+1202555${String(8300 + phoneSeq).padStart(4, '0')}`;
  }

  /** Signs a fresh user in via OTP (fixed test code). */
  async function signIn(): Promise<{
    auth: Record<string, string>;
    userId: string;
  }> {
    const phone = nextPhone();
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: phone,
        code: '000000',
        deviceInfo: { deviceId: 'profiles-practices-e2e' },
      })
      .expect(201);
    const auth = {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    return { auth, userId: (me.body as { data: { id: string } }).data.id };
  }

  async function attorney(
    opts: {
      status?: 'unverified' | 'verified' | 'pending' | 'suspended';
      licenses?: {
        state: string;
        status?: 'verified' | 'pending';
        expires?: Date;
      }[];
      first?: string;
    } = {},
  ) {
    const { auth, userId } = await signIn();
    const username = `att_${randomUUID().slice(0, 8)}`;
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'attorney',
        first_name: opts.first ?? 'Saul',
        last_name: 'Goodman',
      },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: userId,
        username,
        username_lower: username.toLowerCase(),
        verification_status: opts.status ?? 'unverified',
        bio: 'Traffic lawyer',
        languages: ['en'],
      },
    });
    const barNumbers: string[] = [];
    for (const l of opts.licenses ?? []) {
      const bar = `BAR-${randomUUID()}`;
      barNumbers.push(bar);
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: userId,
          state_code: l.state,
          bar_number: bar,
          license_status: l.status ?? 'verified',
          expires_at: l.expires ?? null,
        },
      });
    }
    return { auth, userId, username, barNumbers };
  }

  async function client() {
    const { auth, userId } = await signIn();
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'client', first_name: 'Anna', last_name: 'Kim' },
    });
    await prisma.clientProfile.create({
      data: { user_id: userId, state_code: 'NY', preferred_languages: ['en'] },
    });
    return { auth, userId };
  }

  const code = (res: request.Response) =>
    (res.body as { error?: { code: string } }).error?.code;

  // ---------------------------------------------------------------- 3.5

  describe('stage 3.5 — practices', () => {
    it('GET /practice-areas is public: active leaves under categories, ETag/304', async () => {
      const res = await api().get('/api/v1/practice-areas').expect(200);
      const cats = (
        res.body as { data: { id: string; children: { id: string }[] }[] }
      ).data;
      const ours = cats.find((c) => c.id === categoryId);
      expect(ours?.children.map((c) => c.id).sort()).toEqual(
        [leafA, leafB].sort(),
      );
      expect(JSON.stringify(cats)).not.toContain(leafInactive);
      const etag = res.headers.etag;
      expect(etag).toMatch(/^"pa-/);
      await api()
        .get('/api/v1/practice-areas')
        .set('If-None-Match', etag)
        .expect(304);
    });

    it('saving practices before verified -> 403 ATTORNEY_NOT_VERIFIED', async () => {
      for (const status of ['unverified', 'pending'] as const) {
        const a = await attorney({ status });
        const res = await api()
          .put('/api/v1/attorneys/me/practice-areas')
          .set(a.auth)
          .send({ practiceAreaIds: [leafA] })
          .expect(403);
        expect(code(res)).toBe('ATTORNEY_NOT_VERIFIED');
        expect(
          await prisma.attorneyPracticeArea.count({
            where: { attorney_id: a.userId },
          }),
        ).toBe(0);
      }
    });

    it('a client cannot use attorney practice endpoints', async () => {
      const c = await client();
      const res = await api()
        .put('/api/v1/attorneys/me/practice-areas')
        .set(c.auth)
        .send({ practiceAreaIds: [leafA] })
        .expect(403);
      expect(code(res)).toBe('FORBIDDEN');
    });

    it('verified: rejects categories and inactive leaves, replaces the set, audits', async () => {
      const a = await attorney({
        status: 'verified',
        licenses: [{ state: 'NY' }],
      });
      for (const bad of [categoryId, leafInactive]) {
        const res = await api()
          .put('/api/v1/attorneys/me/practice-areas')
          .set(a.auth)
          .send({ practiceAreaIds: [leafA, bad] })
          .expect(400);
        expect(code(res)).toBe('VALIDATION_ERROR');
        expect(
          (res.body as { error: { details: { invalidIds: string[] } } }).error
            .details.invalidIds,
        ).toEqual([bad]);
      }
      await api()
        .put('/api/v1/attorneys/me/practice-areas')
        .set(a.auth)
        .send({ practiceAreaIds: [leafA] })
        .expect(200);
      const res = await api()
        .put('/api/v1/attorneys/me/practice-areas')
        .set(a.auth)
        .send({ practiceAreaIds: [leafB] })
        .expect(200);
      expect(
        (res.body as { data: { id: string; categoryId: string }[] }).data,
      ).toEqual([expect.objectContaining({ id: leafB, categoryId })]);
      const mine = await api()
        .get('/api/v1/attorneys/me/practice-areas')
        .set(a.auth)
        .expect(200);
      expect(
        (mine.body as { data: { id: string }[] }).data.map((p) => p.id),
      ).toEqual([leafB]);
      const audits = await prisma.auditLog.findMany({
        where: {
          target_id: a.userId,
          action: 'attorney.practice_areas.replace',
        },
        orderBy: { created_at: 'asc' },
      });
      expect(audits).toHaveLength(2);
      expect(audits[1].before).toEqual({ practiceAreaIds: [leafA] });
      expect(audits[1].after).toEqual({ practiceAreaIds: [leafB] });
    });

    describe('nightly license expiry', () => {
      const today = new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate(),
        ),
      );
      let clientId: string;

      async function newCase(state: string): Promise<string> {
        const c = await prisma.case.create({
          data: {
            client_id: clientId,
            title: `Case in ${state}`,
            description: 'details',
            practice_area_id: leafA,
            primary_state_code: state,
            budget_mode: 'clarify_later',
            status: 'open',
          },
        });
        await prisma.caseState.create({
          data: { case_id: c.id, state_code: state, is_primary: true },
        });
        return c.id;
      }

      // docs/02 §5.4, canonical shape of db-roles-indexes.e2e-spec.ts.
      const visible = async (attorneyId: string) =>
        (
          await prisma.$queryRawUnsafe<{ id: string }[]>(`
          SELECT id FROM (
            SELECT c.id, c.created_at FROM cases c
            WHERE c.status = 'open' AND c.deleted_at IS NULL
              AND (c.primary_state_code, c.practice_area_id) IN (
                SELECT l.state_code, ap.practice_area_id
                FROM attorney_licenses l
                JOIN attorney_practice_areas ap ON ap.attorney_id = l.attorney_id
                WHERE l.attorney_id = '${attorneyId}' AND l.license_status = 'verified')
            UNION
            SELECT c.id, c.created_at FROM case_states cs
            JOIN cases c ON c.id = cs.case_id
            WHERE NOT cs.is_primary
              AND cs.state_code IN (
                SELECT state_code FROM attorney_licenses
                WHERE attorney_id = '${attorneyId}' AND license_status = 'verified')
              AND c.status = 'open' AND c.deleted_at IS NULL
              AND c.practice_area_id IN (
                SELECT practice_area_id FROM attorney_practice_areas
                WHERE attorney_id = '${attorneyId}')
          ) v ORDER BY created_at DESC LIMIT 50`)
        ).map((r) => r.id);

      beforeAll(async () => {
        clientId = (await prisma.user.create({ data: { role: 'client' } })).id;
      });

      it('expired license leaves the cases query; the last one makes the profile unverified', async () => {
        const a = await attorney({
          status: 'verified',
          licenses: [
            { state: 'NJ', expires: today },
            { state: 'NY', expires: new Date(today.getTime() + 100 * DAY) },
          ],
        });
        await api()
          .put('/api/v1/attorneys/me/practice-areas')
          .set(a.auth)
          .send({ practiceAreaIds: [leafA] })
          .expect(200);
        const njCase = await newCase('NJ');
        const nyCase = await newCase('NY');
        expect(await visible(a.userId)).toEqual(
          expect.arrayContaining([njCase, nyCase]),
        );

        const job = app.get(LicenseExpiryJob);
        const first = await job.run();
        expect(first.expired).toBeGreaterThanOrEqual(1);

        const licenses = await prisma.attorneyLicense.findMany({
          where: { attorney_id: a.userId },
          orderBy: { state_code: 'asc' },
        });
        expect(licenses.map((l) => [l.state_code, l.license_status])).toEqual([
          ['NJ', 'expired'],
          ['NY', 'verified'],
        ]);
        let ids = await visible(a.userId);
        expect(ids).not.toContain(njCase);
        expect(ids).toContain(nyCase);
        let profile = await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: a.userId },
        });
        expect(profile.verification_status).toBe('verified');

        // Last verified license expires -> unverified + notification.
        await prisma.attorneyLicense.updateMany({
          where: { attorney_id: a.userId, state_code: 'NY' },
          data: { expires_at: new Date(today.getTime() - DAY) },
        });
        await job.run();
        profile = await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: a.userId },
        });
        expect(profile.verification_status).toBe('unverified');
        ids = await visible(a.userId);
        expect(ids).not.toContain(nyCase);
        expect(ids).not.toContain(njCase);

        const kinds = (
          await prisma.notification.findMany({
            where: { user_id: a.userId, type: 'verification_update' },
          })
        )
          .map((n) => (n.payload as { kind: string }).kind)
          .sort();
        expect(kinds).toEqual([
          'license_expired',
          'license_expired',
          'profile_unverified',
        ]);

        // Public profile: no blue check any more; practices now blocked.
        const pub = await api()
          .get(`/api/v1/attorneys/${a.username}`)
          .set(a.auth)
          .expect(200);
        expect(
          (pub.body as { data: { verifiedBadge: boolean } }).data.verifiedBadge,
        ).toBe(false);
        const blocked = await api()
          .put('/api/v1/attorneys/me/practice-areas')
          .set(a.auth)
          .send({ practiceAreaIds: [leafB] })
          .expect(403);
        expect(code(blocked)).toBe('ATTORNEY_NOT_VERIFIED');
      });

      it('sends the 7-day reminder once, and nothing for a far expiry', async () => {
        const a = await attorney({
          status: 'verified',
          licenses: [
            { state: 'CA', expires: new Date(today.getTime() + 7 * DAY) },
          ],
        });
        const b = await attorney({
          status: 'verified',
          licenses: [
            { state: 'CA', expires: new Date(today.getTime() + 60 * DAY) },
          ],
        });
        const job = app.get(LicenseExpiryJob);
        await job.run();
        await job.run();
        const forA = await prisma.notification.findMany({
          where: { user_id: a.userId },
        });
        expect(forA).toHaveLength(1);
        expect(forA[0].payload).toMatchObject({
          kind: 'license_expiring',
          daysLeft: 7,
          thresholdDays: 7,
        });
        expect(forA[0].category).toBe('system');
        expect(
          await prisma.notification.count({ where: { user_id: b.userId } }),
        ).toBe(0);
      });
    });
  });

  // ---------------------------------------------------------------- 3.6

  describe('stage 3.6 — profiles', () => {
    it("someone else's client profile is unavailable (404), own is readable", async () => {
      const c = await client();
      const other = await client();
      const a = await attorney({ status: 'verified' });

      const own = await api()
        .get('/api/v1/users/me/profile')
        .set(c.auth)
        .expect(200);
      expect(own.body.data).toMatchObject({
        id: c.userId,
        firstName: 'Anna',
        state: { code: 'NY', name: 'New York' },
      });
      // No route reads a client by id or name; attorney-profile lookups
      // never resolve a client.
      for (const viewer of [a.auth, other.auth]) {
        for (const path of [
          `/api/v1/attorneys/${c.userId}`,
          '/api/v1/attorneys/anna.kim',
          '/api/v1/attorneys/Anna',
        ]) {
          const res = await api().get(path).set(viewer).expect(404);
          expect(code(res)).toBe('NOT_FOUND');
        }
      }
      // An attorney has no client profile.
      expect(
        code(
          await api().get('/api/v1/users/me/profile').set(a.auth).expect(404),
        ),
      ).toBe('NOT_FOUND');
    });

    it('client edits profile and contact preferences', async () => {
      const c = await client();
      const res = await api()
        .patch('/api/v1/users/me/profile')
        .set(c.auth)
        .send({ firstName: 'Ann', stateCode: 'nj', languages: ['EN', 'es'] })
        .expect(200);
      expect(res.body.data).toMatchObject({
        firstName: 'Ann',
        state: { code: 'NJ' },
        languages: ['en', 'es'],
      });
      const prefs = await api()
        .patch('/api/v1/users/me/contact-preferences')
        .set(c.auth)
        .send({ contactMethod: 'sms', contactNote: 'after 6pm' })
        .expect(200);
      expect(prefs.body.data).toMatchObject({
        contactMethod: 'sms',
        contactNote: 'after 6pm',
      });
      await api()
        .patch('/api/v1/users/me/contact-preferences')
        .set(c.auth)
        .send({ stateCode: 'CA' })
        .expect(400);
    });

    it('public profile: no bar number, no files; verified states only; suspended -> 404', async () => {
      const a = await attorney({
        status: 'verified',
        licenses: [{ state: 'NY' }, { state: 'CA', status: 'pending' }],
      });
      await api()
        .put('/api/v1/attorneys/me/practice-areas')
        .set(a.auth)
        .send({ practiceAreaIds: [leafA] })
        .expect(200);
      const viewer = await client();
      const res = await api()
        .get(`/api/v1/attorneys/${a.username.toUpperCase()}`)
        .set(viewer.auth)
        .expect(200);
      const body = JSON.stringify(res.body);
      for (const bar of a.barNumbers) expect(body).not.toContain(bar);
      expect(body).not.toMatch(/bar_?number|document|file_?id|phone|email/i);
      expect(res.body.data).toMatchObject({
        id: a.userId,
        username: a.username,
        verifiedBadge: true,
        licensedStates: [{ code: 'NY', name: 'New York' }],
        practiceAreas: [expect.objectContaining({ id: leafA })],
        isSelf: false,
      });

      // The owner sees their own bar numbers on /me/profile.
      const own = await api()
        .get('/api/v1/attorneys/me/profile')
        .set(a.auth)
        .expect(200);
      expect(
        (own.body.data as { licenses: { barNumber: string }[] }).licenses
          .map((l) => l.barNumber)
          .sort(),
      ).toEqual([...a.barNumbers].sort());

      await prisma.attorneyProfile.update({
        where: { user_id: a.userId },
        data: { verification_status: 'suspended' },
      });
      await api()
        .get(`/api/v1/attorneys/${a.username}`)
        .set(viewer.auth)
        .expect(404);
    });

    it('username: first change ok, second within 30 days rejected, reserved/taken/invalid', async () => {
      const a = await attorney();
      const b = await attorney();
      const newName = `New.${tag}`;
      const first = await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(a.auth)
        .send({
          username: newName,
          bio: 'Updated bio',
          firmName: 'Goodman LLP',
        })
        .expect(200);
      expect(first.body.data).toMatchObject({
        username: newName,
        bio: 'Updated bio',
        firmName: 'Goodman LLP',
      });
      expect(first.body.data.usernameNextChangeAt).not.toBeNull();

      const second = await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(a.auth)
        .send({ username: `again_${tag}` })
        .expect(409);
      expect(code(second)).toBe('USERNAME_CHANGE_TOO_SOON');

      // 31 days later it is allowed again.
      await prisma.attorneyProfile.update({
        where: { user_id: a.userId },
        data: { username_changed_at: new Date(Date.now() - 31 * DAY) },
      });
      await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(a.auth)
        .send({ username: `again_${tag}` })
        .expect(200);

      // b: taken (case-insensitive), reserved, invalid format.
      const taken = await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(b.auth)
        .send({ username: `AGAIN_${tag}` })
        .expect(409);
      expect(code(taken)).toBe('USERNAME_TAKEN');
      const reserved = await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(b.auth)
        .send({ username: 'Support' })
        .expect(400);
      expect(code(reserved)).toBe('USERNAME_RESERVED');
      for (const bad of ['ab', 'bad..name', '_x_y', 'имя']) {
        const res = await api()
          .patch('/api/v1/attorneys/me/profile')
          .set(b.auth)
          .send({ username: bad })
          .expect(400);
        expect(code(res)).toBe('VALIDATION_ERROR');
      }
      await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(b.auth)
        .send({ bio: 'x'.repeat(301) })
        .expect(400);
    });

    it('username-available reports taken / reserved / invalid / free', async () => {
      const a = await attorney();
      const b = await attorney();
      const check = async (u: string) =>
        (
          await api()
            .get('/api/v1/attorneys/username-available')
            .query({ u })
            .set(b.auth)
            .expect(200)
        ).body.data as { available: boolean; reason: string | null };
      expect(await check(a.username.toUpperCase())).toEqual(
        expect.objectContaining({ available: false, reason: 'taken' }),
      );
      expect(await check(b.username)).toEqual(
        expect.objectContaining({ available: true, reason: null }),
      );
      expect(await check('admin')).toEqual(
        expect.objectContaining({ available: false, reason: 'reserved' }),
      );
      expect(await check('x')).toEqual(
        expect.objectContaining({ available: false, reason: 'invalid' }),
      );
      expect(await check(`free_${tag}`)).toEqual(
        expect.objectContaining({ available: true }),
      );
    });

    it("a verified attorney's name change sends the profile to re-check (pending)", async () => {
      const a = await attorney({
        status: 'verified',
        licenses: [{ state: 'NY' }],
      });
      const res = await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(a.auth)
        .send({ lastName: 'McGill' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        lastName: 'McGill',
        verificationStatus: 'pending',
        verifiedBadge: false,
      });
      const requests = await prisma.verificationRequest.findMany({
        where: { attorney_id: a.userId },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].status).toBe('submitted');
      expect(requests[0].admin_note).toContain('Saul Goodman');
      expect(requests[0].admin_note).toContain('Saul McGill');

      // The same rule applies through PATCH /users/me.
      const b = await attorney({
        status: 'verified',
        licenses: [{ state: 'NY' }],
      });
      await api()
        .patch('/api/v1/users/me')
        .set(b.auth)
        .send({ firstName: 'Jimmy' })
        .expect(200);
      expect(
        (
          await prisma.attorneyProfile.findUniqueOrThrow({
            where: { user_id: b.userId },
          })
        ).verification_status,
      ).toBe('pending');

      // Bio-only edits of a verified attorney don't.
      const c = await attorney({
        status: 'verified',
        licenses: [{ state: 'NY' }],
      });
      await api()
        .patch('/api/v1/attorneys/me/profile')
        .set(c.auth)
        .send({ bio: 'New bio', languages: ['en', 'ru'] })
        .expect(200);
      expect(
        (
          await prisma.attorneyProfile.findUniqueOrThrow({
            where: { user_id: c.userId },
          })
        ).verification_status,
      ).toBe('verified');
    });

    it('a client cannot read or edit an attorney own profile', async () => {
      const c = await client();
      expect(
        code(
          await api()
            .get('/api/v1/attorneys/me/profile')
            .set(c.auth)
            .expect(403),
        ),
      ).toBe('FORBIDDEN');
    });
  });
});
