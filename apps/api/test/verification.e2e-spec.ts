import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import type Redis from 'ioredis';
import request from 'supertest';
import type { AdminRole, FilePurpose, ScanStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';

/**
 * docs/03_VERIFICATION_PROFILES.md stages 3.3 (verification request API)
 * and 3.4 (checks + verifier admin API), against real CockroachDB + Redis.
 *
 * 3.3 acceptance: two open requests are impossible; a request can't be
 * submitted without identity document / selfie / license; the same bar
 * number in the same state by another attorney → LICENSE_ALREADY_REGISTERED.
 * 3.4 acceptance: with no flags a request passes fully by hand; every
 * document view and decision is in audit_log; a role without verifier
 * permission gets 403; suspend removes the profile from search (public
 * profile 404) and moves active bids to withdrawn.
 */
jest.setTimeout(90_000);

type Body = {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
};

describe('Verification (e2e) — docs/03 stages 3.3–3.4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';
  let phoneSeq = 0;
  let practiceAreaId = '';
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
        code: `e2e_v_${tag}`,
        name_en: `E2E ${tag}`,
        i18n_key: `practice.e2e_v_${tag}`,
        sort: 999,
      },
    });
    practiceAreaId = (
      await prisma.practiceArea.create({
        data: {
          code: `e2e_v_${tag}.leaf`,
          parent_id: cat.id,
          name_en: 'leaf',
          i18n_key: `practice.e2e_v_${tag}.leaf`,
          sort: 0,
        },
      })
    ).id;
    await setFlag('stripe_identity', false);
  });

  afterAll(async () => {
    await setFlag('stripe_identity', false);
    await app.close();
  });

  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = await redis.keys('throttle*');
    if (keys.length > 0) await redis.del(...keys);
  });

  async function setFlag(key: string, enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description: key },
      update: { enabled },
    });
    await app.get(FeatureFlagsService).invalidate();
  }

  function nextPhone(): string {
    phoneSeq += 1;
    return `+1202555${String(8600 + phoneSeq).padStart(4, '0')}`;
  }

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
        deviceInfo: { deviceId: 'verification-e2e' },
      })
      .expect(201);
    const auth = {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    return { auth, userId: (me.body as { data: { id: string } }).data.id };
  }

  async function attorney(
    status: 'unverified' | 'verified' = 'unverified',
  ): Promise<{
    auth: Record<string, string>;
    userId: string;
    username: string;
  }> {
    const { auth, userId } = await signIn();
    const username = `vatt_${randomUUID().slice(0, 8)}`;
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'attorney', first_name: 'Kim', last_name: 'Wexler' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: userId,
        username,
        username_lower: username.toLowerCase(),
        verification_status: status,
        languages: ['en'],
      },
    });
    return { auth, userId, username };
  }

  async function admin(
    role: AdminRole | null,
  ): Promise<{ auth: Record<string, string>; userId: string }> {
    const { auth, userId } = await signIn();
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });
    if (role) {
      await prisma.adminProfile.create({
        data: { user_id: userId, admin_role: role },
      });
    }
    return { auth, userId };
  }

  async function file(
    ownerId: string,
    purpose: FilePurpose = 'verification_document',
    scan: ScanStatus = 'clean',
  ): Promise<string> {
    const id = randomUUID();
    await prisma.file.create({
      data: {
        id,
        owner_user_id: ownerId,
        purpose,
        s3_bucket: process.env.S3_BUCKET_DOCUMENTS ?? 'lawbid-documents',
        s3_key: `${purpose}/${ownerId}/${id}`,
        mime: 'image/jpeg',
        size_bytes: BigInt(1234),
        sha256: 'a'.repeat(64),
        scan_status: scan,
      },
    });
    return id;
  }

  const barNumber = () => `B${randomUUID().slice(0, 10).toUpperCase()}`;

  async function createDraft(auth: Record<string, string>): Promise<string> {
    const res = await api()
      .post('/api/v1/verification/requests')
      .set(auth)
      .expect(201);
    return (res.body as Body).data.id as string;
  }

  /** Draft with an NY license + all documents, submitted. */
  async function submittedRequest(a: {
    auth: Record<string, string>;
    userId: string;
  }): Promise<{ requestId: string; licenseId: string; bar: string }> {
    const requestId = await createDraft(a.auth);
    const bar = barNumber();
    const withLicense = await api()
      .post(`/api/v1/verification/requests/${requestId}/licenses`)
      .set(a.auth)
      .send({ stateCode: 'NY', barNumber: bar })
      .expect(201);
    const licenseId = (
      (withLicense.body as Body).data.licenses as { id: string }[]
    )[0].id;
    for (const doc of [
      { docType: 'bar_license', stateCode: 'NY' },
      { docType: 'passport', side: 'front' },
    ]) {
      await api()
        .post(`/api/v1/verification/requests/${requestId}/documents`)
        .set(a.auth)
        .send({ fileId: await file(a.userId), ...doc })
        .expect(201);
    }
    await api()
      .post(`/api/v1/verification/requests/${requestId}/documents`)
      .set(a.auth)
      .send({
        fileId: await file(a.userId, 'verification_selfie'),
        docType: 'selfie',
      })
      .expect(201);
    await api()
      .post(`/api/v1/verification/requests/${requestId}/submit`)
      .set(a.auth)
      .send({})
      .expect(200);
    return { requestId, licenseId, bar };
  }

  const profileStatus = async (userId: string) =>
    (
      await prisma.attorneyProfile.findUniqueOrThrow({
        where: { user_id: userId },
      })
    ).verification_status;

  const auditActions = async (adminId: string) =>
    (
      await prisma.auditLog.findMany({
        where: { admin_id: adminId },
        orderBy: { created_at: 'asc' },
      })
    ).map((r) => r.action);

  // ---------------------------------------------------------------- 3.3

  describe('stage 3.3 — attorney requests', () => {
    it('allows only one open request (VERIFICATION_ALREADY_PENDING)', async () => {
      const a = await attorney();
      const id = await createDraft(a.auth);
      const second = await api()
        .post('/api/v1/verification/requests')
        .set(a.auth)
        .expect(409);
      expect((second.body as Body).error?.code).toBe(
        'VERIFICATION_ALREADY_PENDING',
      );
      expect((second.body as Body).error?.details?.requestId).toBe(id);
      const me = await api()
        .get('/api/v1/verification/me')
        .set(a.auth)
        .expect(200);
      const data = (me.body as Body).data;
      expect(data.verificationStatus).toBe('unverified');
      expect((data.request as { id: string }).id).toBe(id);
      expect(data.identityRequired).toBe(true);
    });

    it('rejects clients and hides other attorneys requests', async () => {
      const a = await attorney();
      const id = await createDraft(a.auth);
      const other = await attorney();
      await api()
        .get(`/api/v1/verification/requests/${id}`)
        .set(other.auth)
        .expect(404);
      const { auth, userId } = await signIn();
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'client' },
      });
      await api().post('/api/v1/verification/requests').set(auth).expect(403);
    });

    it('cannot submit without license, identity document and selfie', async () => {
      const a = await attorney();
      const id = await createDraft(a.auth);
      const empty = await api()
        .post(`/api/v1/verification/requests/${id}/submit`)
        .set(a.auth)
        .send({})
        .expect(400);
      expect((empty.body as Body).error?.code).toBe('VERIFICATION_INCOMPLETE');
      expect((empty.body as Body).error?.details?.missing).toEqual(
        expect.arrayContaining(['license', 'identity_document', 'selfie']),
      );

      await api()
        .post(`/api/v1/verification/requests/${id}/licenses`)
        .set(a.auth)
        .send({ stateCode: 'NJ', barNumber: barNumber() })
        .expect(201);
      // A driver license needs both sides.
      await api()
        .post(`/api/v1/verification/requests/${id}/documents`)
        .set(a.auth)
        .send({
          fileId: await file(a.userId),
          docType: 'drivers_license',
          side: 'front',
        })
        .expect(201);
      const partial = await api()
        .post(`/api/v1/verification/requests/${id}/submit`)
        .set(a.auth)
        .send({})
        .expect(400);
      expect((partial.body as Body).error?.details?.missing).toEqual(
        expect.arrayContaining([
          'bar_license:NJ',
          'identity_document_back',
          'selfie',
        ]),
      );
      expect(await profileStatus(a.userId)).toBe('unverified');
    });

    it('only clean files of the right purpose can be attached', async () => {
      const a = await attorney();
      const id = await createDraft(a.auth);
      for (const [fileId, docType] of [
        [await file(a.userId, 'verification_document', 'pending'), 'passport'],
        [await file(a.userId, 'verification_document', 'infected'), 'passport'],
        [await file(a.userId, 'verification_document'), 'selfie'],
      ] as const) {
        const res = await api()
          .post(`/api/v1/verification/requests/${id}/documents`)
          .set(a.auth)
          .send({
            fileId,
            docType,
            ...(docType === 'passport' && { side: 'front' }),
          })
          .expect(409);
        expect((res.body as Body).error?.code).toBe('FILE_NOT_ATTACHABLE');
      }
      // Someone else's file is unknown.
      const other = await attorney();
      await api()
        .post(`/api/v1/verification/requests/${id}/documents`)
        .set(a.auth)
        .send({ fileId: await file(other.userId), docType: 'passport' })
        .expect(404);
      // bar_license needs a license in that state first.
      const noLicense = await api()
        .post(`/api/v1/verification/requests/${id}/documents`)
        .set(a.auth)
        .send({
          fileId: await file(a.userId),
          docType: 'bar_license',
          stateCode: 'CA',
        })
        .expect(400);
      expect((noLicense.body as Body).error?.code).toBe('VALIDATION_ERROR');
    });

    it('same bar number in the same state by another attorney → LICENSE_ALREADY_REGISTERED', async () => {
      const a = await attorney();
      const b = await attorney();
      const bar = barNumber();
      const idA = await createDraft(a.auth);
      const idB = await createDraft(b.auth);
      await api()
        .post(`/api/v1/verification/requests/${idA}/licenses`)
        .set(a.auth)
        .send({ stateCode: 'NY', barNumber: bar })
        .expect(201);
      const dup = await api()
        .post(`/api/v1/verification/requests/${idB}/licenses`)
        .set(b.auth)
        .send({ stateCode: 'ny', barNumber: bar.toLowerCase() })
        .expect(409);
      expect((dup.body as Body).error?.code).toBe('LICENSE_ALREADY_REGISTERED');
      // Same number in another state is a different license.
      await api()
        .post(`/api/v1/verification/requests/${idB}/licenses`)
        .set(b.auth)
        .send({ stateCode: 'NJ', barNumber: bar })
        .expect(201);
      // One license per state per request.
      const again = await api()
        .post(`/api/v1/verification/requests/${idA}/licenses`)
        .set(a.auth)
        .send({ stateCode: 'NY', barNumber: barNumber() })
        .expect(409);
      expect((again.body as Body).error?.code).toBe('LICENSE_ALREADY_ADDED');
    });

    it('submits a complete draft; profile becomes pending; comment ≤500', async () => {
      const a = await attorney();
      const id = await createDraft(a.auth);
      await api()
        .patch(`/api/v1/verification/requests/${id}`)
        .set(a.auth)
        .send({ applicantComment: 'x'.repeat(501) })
        .expect(400);
      await api()
        .patch(`/api/v1/verification/requests/${id}`)
        .set(a.auth)
        .send({ applicantComment: 'Maiden name on the bar card: Kim Doe' })
        .expect(200);
      await prisma.verificationRequest
        .delete({ where: { id } })
        .catch(() => undefined);
      const { requestId } = await submittedRequest(a);
      const row = await prisma.verificationRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(row.status).toBe('submitted');
      expect(row.submitted_at).not.toBeNull();
      expect(await profileStatus(a.userId)).toBe('pending');
      // Submitted requests are not editable by the attorney.
      const edit = await api()
        .post(`/api/v1/verification/requests/${requestId}/licenses`)
        .set(a.auth)
        .send({ stateCode: 'CA', barNumber: barNumber() })
        .expect(409);
      expect((edit.body as Body).error?.code).toBe(
        'VERIFICATION_INVALID_STATUS',
      );
      // No automatic checks with the flags off.
      expect(
        await prisma.verificationCheck.count({
          where: { request_id: requestId },
        }),
      ).toBe(0);
    });

    it('limits submissions to verification.max_submissions_30d', async () => {
      const a = await attorney();
      for (let i = 0; i < 5; i++) {
        await prisma.verificationRequest.create({
          data: {
            attorney_id: a.userId,
            status: 'rejected',
            submitted_at: new Date(Date.now() - (i + 1) * 24 * 3600 * 1000),
          },
        });
      }
      const res = await api()
        .post('/api/v1/verification/requests')
        .set(a.auth)
        .expect(429);
      expect((res.body as Body).error?.code).toBe(
        'VERIFICATION_SUBMISSION_LIMIT',
      );
      expect(
        (res.body as Body).error?.details?.retryAfterSeconds,
      ).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------- 3.4

  describe('stage 3.4 — verifier admin API', () => {
    it('denies attorneys, admins without a profile and non-verifier roles (403)', async () => {
      const a = await attorney();
      const bare = await admin(null);
      const moderator = await admin('moderator');
      const support = await admin('support');
      for (const who of [a, bare, moderator, support]) {
        const res = await api()
          .get('/api/v1/admin/verification/requests')
          .set(who.auth)
          .expect(403);
        expect((res.body as Body).error?.code).toBe('FORBIDDEN');
      }
      const sup = await admin('super_admin');
      await api()
        .get('/api/v1/admin/verification/requests')
        .set(sup.auth)
        .expect(200);
    });

    it('passes a request fully by hand with every view and decision audited', async () => {
      const a = await attorney();
      const { requestId, licenseId, bar } = await submittedRequest(a);
      const verifier = await admin('verifier');
      const other = await admin('verifier');

      const queue = await api()
        .get('/api/v1/admin/verification/requests?stateCode=NY&limit=50')
        .set(verifier.auth)
        .expect(200);
      expect(
        ((queue.body as Body).data as unknown as { id: string }[]).some(
          (r) => r.id === requestId,
        ),
      ).toBe(true);

      const taken = await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/take`)
        .set(verifier.auth)
        .expect(200);
      const card = (taken.body as Body).data;
      expect(card.status).toBe('in_review');
      const licenses = card.licenses as { id: string; barNumber: string }[];
      expect(licenses[0].barNumber).toBe(bar);
      const documents = card.documents as { id: string; docType: string }[];
      expect(documents).toHaveLength(3);
      expect(JSON.stringify(card)).not.toContain('s3_key');

      // Lock: one verifier per request.
      const locked = await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/approve`)
        .set(other.auth)
        .expect(409);
      expect((locked.body as Body).error?.code).toBe(
        'VERIFICATION_REQUEST_LOCKED',
      );
      await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/take`)
        .set(other.auth)
        .expect(409);

      // Document view → signed link + audit row.
      const link = await api()
        .post(`/api/v1/admin/verification/documents/${documents[0].id}/url`)
        .set(verifier.auth)
        .expect(200);
      expect((link.body as Body).data.url).toEqual(
        expect.stringContaining('X-Amz-Signature'),
      );

      const early = await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/approve`)
        .set(verifier.auth)
        .expect(409);
      expect((early.body as Body).error?.code).toBe(
        'VERIFICATION_DECISION_INCOMPLETE',
      );

      await api()
        .post(
          `/api/v1/admin/verification/requests/${requestId}/licenses/${licenseId}/decision`,
        )
        .set(verifier.auth)
        .send({ decision: 'verified' })
        .expect(200);
      const approved = await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/approve`)
        .set(verifier.auth)
        .expect(200);
      expect((approved.body as Body).data.status).toBe('approved');

      expect(await profileStatus(a.userId)).toBe('verified');
      const license = await prisma.attorneyLicense.findUniqueOrThrow({
        where: { id: licenseId },
      });
      expect(license.license_status).toBe('verified');
      expect(license.verified_by).toBe(verifier.userId);

      expect(await auditActions(verifier.userId)).toEqual([
        'verification.take',
        'verification.document_view',
        'verification.license_decision',
        'verification.approve',
      ]);
      const view = await prisma.auditLog.findFirstOrThrow({
        where: {
          admin_id: verifier.userId,
          action: 'verification.document_view',
        },
      });
      expect(view.target_id).toBe(documents[0].id);

      const notes = await prisma.notification.findMany({
        where: { user_id: a.userId, type: 'verification_update' },
        orderBy: { created_at: 'asc' },
      });
      expect(notes.map((n) => (n.payload as { kind: string }).kind)).toEqual([
        'in_review',
        'approved',
      ]);

      // Public profile now carries the badge; never the bar number.
      const viewer = await attorney();
      const pub = await api()
        .get(`/api/v1/attorneys/${a.username}`)
        .set(viewer.auth)
        .expect(200);
      expect((pub.body as Body).data.verifiedBadge).toBe(true);
      expect(JSON.stringify(pub.body)).not.toContain(bar);
    });

    it('needs_more_info → attorney adds a file and resubmits → reject with a code', async () => {
      const a = await attorney();
      const { requestId, licenseId } = await submittedRequest(a);
      const verifier = await admin('verifier');
      await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/take`)
        .set(verifier.auth)
        .expect(200);
      await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/request-info`)
        .set(verifier.auth)
        .send({ message: 'Please upload a certificate of good standing.' })
        .expect(200);
      const mine = await api()
        .get(`/api/v1/verification/requests/${requestId}`)
        .set(a.auth)
        .expect(200);
      expect((mine.body as Body).data.status).toBe('needs_more_info');
      expect((mine.body as Body).data.infoRequestMessage).toBe(
        'Please upload a certificate of good standing.',
      );
      expect(await profileStatus(a.userId)).toBe('pending');

      // Documents can be added, not removed, after an info request.
      const docId = ((mine.body as Body).data.documents as { id: string }[])[0]
        .id;
      await api()
        .delete(`/api/v1/verification/requests/${requestId}/documents/${docId}`)
        .set(a.auth)
        .expect(409);
      await api()
        .post(`/api/v1/verification/requests/${requestId}/documents`)
        .set(a.auth)
        .send({
          fileId: await file(a.userId),
          docType: 'bar_license',
          stateCode: 'NY',
        })
        .expect(201);
      const resubmitted = await api()
        .post(`/api/v1/verification/requests/${requestId}/submit`)
        .set(a.auth)
        .send({ applicantComment: 'Uploaded.' })
        .expect(200);
      expect((resubmitted.body as Body).data.status).toBe('submitted');

      await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/take`)
        .set(verifier.auth)
        .expect(200);
      await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/reject`)
        .set(verifier.auth)
        .send({ rejectionCode: 'nope' })
        .expect(400);
      const rejected = await api()
        .post(`/api/v1/admin/verification/requests/${requestId}/reject`)
        .set(verifier.auth)
        .send({
          rejectionCode: 'license_not_found',
          comment: 'Not in the NY registry.',
        })
        .expect(200);
      expect((rejected.body as Body).data.rejectionCode).toBe(
        'license_not_found',
      );
      expect(await profileStatus(a.userId)).toBe('rejected');
      const license = await prisma.attorneyLicense.findUniqueOrThrow({
        where: { id: licenseId },
      });
      expect(license.license_status).toBe('rejected');
      expect(license.rejection_code).toBe('license_not_found');
      expect(await auditActions(verifier.userId)).toEqual([
        'verification.take',
        'verification.request_info',
        'verification.take',
        'verification.reject',
      ]);
      // A new request is possible after rejection.
      await createDraft(a.auth);
    });

    it('suspend hides the profile and withdraws active bids; restore brings it back', async () => {
      const a = await attorney('verified');
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: a.userId,
          state_code: 'NY',
          bar_number: barNumber(),
          license_status: 'verified',
        },
      });
      const client = await signIn();
      await prisma.user.update({
        where: { id: client.userId },
        data: { role: 'client' },
      });
      const bids: string[] = [];
      for (const status of ['active', 'active', 'accepted'] as const) {
        const c = await prisma.case.create({
          data: {
            client_id: client.userId,
            title: 'Case',
            description: 'Description',
            practice_area_id: practiceAreaId,
            primary_state_code: 'NY',
            budget_mode: 'clarify_later',
          },
        });
        const bid = await prisma.bid.create({
          data: {
            case_id: c.id,
            attorney_id: a.userId,
            status,
            fee_type: 'fixed',
            amount_cents: 10_000,
            message: 'I can help.',
            start_availability: 'immediately',
            turn: 'client',
          },
        });
        bids.push(bid.id);
      }
      const viewer = await attorney();
      await api()
        .get(`/api/v1/attorneys/${a.username}`)
        .set(viewer.auth)
        .expect(200);

      const verifier = await admin('verifier');
      await api()
        .post(`/api/v1/admin/verification/attorneys/${a.userId}/suspend`)
        .set(verifier.auth)
        .send({})
        .expect(400);
      const res = await api()
        .post(`/api/v1/admin/verification/attorneys/${a.userId}/suspend`)
        .set(verifier.auth)
        .send({ reason: 'Fraud report under investigation' })
        .expect(200);
      expect((res.body as Body).data).toMatchObject({
        verificationStatus: 'suspended',
        withdrawnBids: 2,
      });
      const after = await prisma.bid.findMany({
        where: { id: { in: bids } },
        orderBy: { created_at: 'asc' },
      });
      expect(after.map((b) => b.status).sort()).toEqual([
        'accepted',
        'withdrawn',
        'withdrawn',
      ]);
      await api()
        .get(`/api/v1/attorneys/${a.username}`)
        .set(viewer.auth)
        .expect(404);
      // A suspended attorney can't open a verification request.
      const blocked = await api()
        .post('/api/v1/verification/requests')
        .set(a.auth)
        .expect(403);
      expect((blocked.body as Body).error?.code).toBe('ATTORNEY_SUSPENDED');

      const restored = await api()
        .post(`/api/v1/admin/verification/attorneys/${a.userId}/restore`)
        .set(verifier.auth)
        .expect(200);
      expect((restored.body as Body).data.verificationStatus).toBe('verified');
      await api()
        .get(`/api/v1/attorneys/${a.username}`)
        .set(viewer.auth)
        .expect(200);
      expect(await auditActions(verifier.userId)).toEqual([
        'verification.suspend',
        'verification.restore',
      ]);
      const notes = await prisma.notification.findMany({
        where: { user_id: a.userId, type: 'verification_update' },
        orderBy: { created_at: 'asc' },
      });
      expect(notes.map((n) => (n.payload as { kind: string }).kind)).toEqual([
        'suspended',
        'restored',
      ]);
    });

    it('recheck with manual lookup queues the license for manual review', async () => {
      const a = await attorney('verified');
      const license = await prisma.attorneyLicense.create({
        data: {
          attorney_id: a.userId,
          state_code: 'CA',
          bar_number: barNumber(),
          license_status: 'verified',
        },
      });
      const verifier = await admin('super_admin');
      const res = await api()
        .post(`/api/v1/admin/verification/licenses/${license.id}/recheck`)
        .set(verifier.auth)
        .expect(200);
      const data = (res.body as Body).data;
      expect(data.result).toBe('manual_review');
      expect((data.license as { status: string }).status).toBe('pending');
      const queued = await prisma.verificationRequest.findUniqueOrThrow({
        where: { id: data.requestId as string },
        include: { checks: true },
      });
      expect(queued.status).toBe('submitted');
      expect(queued.admin_note).toContain('license_recheck');
      expect(queued.checks.map((c) => c.check_type)).toEqual(['bar_lookup']);
      expect(await auditActions(verifier.userId)).toEqual([
        'verification.license_recheck',
      ]);
      await api()
        .post(`/api/v1/admin/verification/licenses/${license.id}/recheck`)
        .set(verifier.auth)
        .expect(409);
    });

    it('stripe_identity flag routes ID checks through the paid adapter + CostGuard', async () => {
      await setFlag('stripe_identity', true);
      try {
        const a = await attorney();
        const { requestId } = await submittedRequest(a);
        const checks = await prisma.verificationCheck.findMany({
          where: { request_id: requestId },
          orderBy: { check_type: 'asc' },
        });
        expect(
          checks.map((c) => `${c.check_type}/${c.provider}/${c.result}`).sort(),
        ).toEqual([
          'face_match/stripe_identity/manual_review',
          'id_check/stripe_identity/manual_review',
        ]);
        const redis = app.get<Redis>(REDIS_CLIENT);
        expect(
          (await redis.keys('budget:{id_check}:*')).length,
        ).toBeGreaterThan(0);
      } finally {
        await setFlag('stripe_identity', false);
      }
    });
  });
});
