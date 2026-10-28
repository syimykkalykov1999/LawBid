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
import { DealRecordRunner } from '../src/modules/deals/deal-record.runner';

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md):
 * accept → sign → sign → seal, the decline path, and the rich payment terms
 * on bids. Object store = in-memory fake; Postgres + Redis only. The
 * `deal-record` worker runs in-process (JOBS_ENABLED), the tests also call
 * the runner directly so they do not depend on queue timing.
 */
jest.setTimeout(180_000);

class FakeS3 {
  readonly configured = true;
  readonly objects = new Map<string, Buffer>();
  bucket(kind: string): string {
    return `fake-${kind}`;
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

// A 1x1 transparent PNG for a drawn signature.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Deal record (e2e, 2026-10-27)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let runner: DealRecordRunner;
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
    runner = app.get(DealRecordRunner);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_deal_leaf' },
      create: {
        code: 'e2e_deal_leaf',
        name_en: 'E2E deal record',
        i18n_key: 'practice.e2e_deal_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await setSwitch('deal_record.enabled', null);
    await setSwitch('bids.rich_terms_enabled', null);
    await app.close();
  });

  const api = () => request(baseUrl);

  async function setSwitch(key: string, value: boolean | null): Promise<void> {
    if (value === null) await prisma.appConfig.deleteMany({ where: { key } });
    else
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    await redis.del('config:app_config'); // bypass the 30 s cache
  }

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

  const bidBody = (overrides: Record<string, unknown> = {}) => ({
    feeType: 'fixed',
    amountCents: 60_000,
    message: 'I handle NJ speeding tickets every week, happy to help.',
    startAvailability: 'immediately',
    ...overrides,
  });

  const postBid = (
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
  ) =>
    api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  async function bidOn(auth: Record<string, string>, caseId: string) {
    const res = await postBid(auth, caseId, bidBody());
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  const start = (auth: Record<string, string>, bidId: string) =>
    api()
      .post('/api/v1/deal-records')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({ bidId });
  const get = (auth: Record<string, string>, id: string) =>
    api().get(`/api/v1/deal-records/${id}`).set(auth);
  const sign = (auth: Record<string, string>, id: string, name = 'Signer') =>
    api()
      .post(`/api/v1/deal-records/${id}/sign`)
      .set(auth)
      .send({ name, imagePngBase64: PNG_B64 });
  const decline = (auth: Record<string, string>, id: string) =>
    api()
      .post(`/api/v1/deal-records/${id}/decline`)
      .set(auth)
      .send({ reason: 'Changed my mind' });

  /** The in-process worker usually gets there first; this makes it certain. */
  async function settle(
    auth: Record<string, string>,
    id: string,
    stage: 'unsigned' | 'sealed',
    want: string,
  ): Promise<Record<string, any>> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const data = async () => (await get(auth, id)).body.data;
    for (let i = 0; i < 20; i++) {
      const d = (await data()) as Record<string, any>;
      if (d.status === want) return d;
      if (i === 3) {
        await runner.process({
          recordId: id,
          caseId: d.caseId as string,
          stage,
        });
      }
      await sleep(250);
    }
    const d = (await data()) as Record<string, any>;
    expect(d.status).toBe(want);
    return d;
  }

  describe('switch off (default)', () => {
    it('deal records do not exist and accept works as before', async () => {
      await setSwitch('deal_record.enabled', null);
      const client = await user('client');
      const att = await user('attorney');
      const caseId = await kase(client.id);
      const bidId = await bidOn(att.auth, caseId);
      expect((await start(client.auth, bidId)).status).toBe(404);
      expect(
        (
          await api()
            .get(`/api/v1/cases/${caseId}/deal-record`)
            .set(client.auth)
        ).status,
      ).toBe(404);
      const accepted = await api()
        .post(`/api/v1/bids/${bidId}/accept`)
        .set(client.auth)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.status).toBe('accepted');
    });
  });

  describe('switch on', () => {
    beforeAll(() => setSwitch('deal_record.enabled', true));

    it('the plain accept is refused (old app → update)', async () => {
      const client = await user('client');
      const att = await user('attorney');
      const caseId = await kase(client.id);
      const bidId = await bidOn(att.auth, caseId);
      const res = await api()
        .post(`/api/v1/bids/${bidId}/accept`)
        .set(client.auth)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DEAL_RECORD_REQUIRED');
    });

    it('accept → sign (client) → sign (attorney) → sealed: the bid is accepted only at the second signature', async () => {
      const client = await user('client');
      const att = await user('attorney');
      const loser = await user('attorney');
      const caseId = await kase(client.id);
      const bidId = await bidOn(att.auth, caseId);
      const loserBid = await bidOn(loser.auth, caseId);

      // The attorney cannot start: not their turn.
      const wrong = await start(att.auth, bidId);
      expect(wrong.status).toBe(409);
      expect(wrong.body.error.code).toBe('BID_NOT_YOUR_TURN');

      const started = await start(client.auth, bidId);
      expect(started.status).toBe(201);
      const rec = started.body.data;
      expect(rec.status).toBe('preparing');
      expect(rec.acceptedBy).toBe('client');
      expect(rec.recordCode).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}$/);
      expect(rec.client.fullName).toBe('Anna Petrova');
      expect(rec.attorney.barState).toBe('NJ');
      expect(rec.history).toHaveLength(1);
      expect(rec.history[0].message).toBe(bidBody().message);
      expect(rec.history[0].status).toBe('accepted');
      expect(JSON.stringify(rec)).not.toMatch(/\+1201/); // no phone numbers

      // Nothing accepted yet.
      const bidRow = await prisma.bid.findUniqueOrThrow({
        where: { id: bidId },
      });
      expect(bidRow.status).toBe('active');
      expect(
        (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      ).toBe('open');

      // A second live record on the same case is refused.
      const dup = await start(client.auth, loserBid);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DEAL_RECORD_PENDING');

      const waiting = await settle(
        client.auth,
        rec.id,
        'unsigned',
        'awaiting_signatures',
      );
      expect(waiting.unsignedUrl).toMatch(/^https:\/\/fake\.test\//);
      expect(waiting.myTurnToSign).toBe(true);
      const attView = await get(att.auth, rec.id);
      expect(attView.status).toBe(200);
      expect(attView.body.data.myTurnToSign).toBe(false);

      // The other party cannot go first; a stranger sees nothing.
      const early = await sign(att.auth, rec.id, 'John Smith');
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('DEAL_RECORD_INVALID_STATE');
      expect((await get(loser.auth, rec.id)).status).toBe(404);

      const first = await sign(client.auth, rec.id, 'Anna Petrova');
      expect(first.status).toBe(200);
      expect(first.body.data.status).toBe('awaiting_signatures');
      expect(first.body.data.signatures).toEqual([
        expect.objectContaining({ role: 'client', name: 'Anna Petrova' }),
      ]);
      expect(first.body.data.myTurnToSign).toBe(false);
      expect((await get(att.auth, rec.id)).body.data.myTurnToSign).toBe(true);
      // Still not accepted; the attorney was told to sign.
      expect(
        (await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status,
      ).toBe('active');
      const told = await prisma.notification.findFirst({
        where: { user_id: att.id, type: 'case_workspace_activity' },
        orderBy: { created_at: 'desc' },
      });
      expect(told?.payload).toMatchObject({
        kind: 'deal_record_sign',
        dealRecordId: rec.id,
      });
      // Signing twice is refused.
      const twice = await sign(client.auth, rec.id, 'Anna Petrova');
      expect(twice.status).toBe(409);

      const second = await sign(att.auth, rec.id, 'John Smith');
      expect(second.status).toBe(200);
      expect(['sealing', 'sealed']).toContain(second.body.data.status);
      // The second signature IS the acceptance.
      const acceptedBid = await prisma.bid.findUniqueOrThrow({
        where: { id: bidId },
      });
      expect(acceptedBid.status).toBe('accepted');
      const kaseRow = await prisma.case.findUniqueOrThrow({
        where: { id: caseId },
      });
      expect(kaseRow.status).toBe('in_progress');
      expect(kaseRow.accepted_bid_id).toBe(bidId);
      expect(
        (await prisma.bid.findUniqueOrThrow({ where: { id: loserBid } }))
          .status,
      ).toBe('rejected_auto');
      expect(
        await prisma.contactDisclosure.count({ where: { bid_id: bidId } }),
      ).toBe(1);

      const sealed = await settle(client.auth, rec.id, 'sealed', 'sealed');
      expect(sealed.sealedUrl).toMatch(/^https:\/\/fake\.test\//);
      expect(sealed.sealedSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sealed.signatures).toHaveLength(2);
      // The stored object's hash is the one in the row.
      const sealedFile = await prisma.file.findUniqueOrThrow({
        where: { id: sealed.sealedFileId },
      });
      const bytes = await s3.read(sealedFile.s3_bucket, sealedFile.s3_key);
      expect(sha256(bytes)).toBe(sealed.sealedSha256);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      // The Docs-tab request is signed with the same final file.
      const req = await prisma.caseSignRequest.findFirstOrThrow({
        where: { deal_record: { id: rec.id } },
        include: { signatures: true },
      });
      expect(req.status).toBe('signed');
      expect(req.final_file_id).toBe(sealed.sealedFileId);
      expect(req.final_sha256).toBe(sealed.sealedSha256);
      expect(req.signatures).toHaveLength(2);
      // Both PDFs are case files now; the journal has the chain.
      expect(await prisma.casePhoto.count({ where: { case_id: caseId } })).toBe(
        2,
      );
      const events = await prisma.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
        select: { event_type: true },
      });
      expect(events.map((e) => e.event_type)).toEqual(
        expect.arrayContaining([
          'signature_requested',
          'signature_signed',
          'bid_accepted',
          'contacts_disclosed',
          'signature_completed',
        ]),
      );
      // The case's current record is this one, for both sides.
      const current = await api()
        .get(`/api/v1/cases/${caseId}/deal-record`)
        .set(att.auth);
      expect(current.status).toBe(200);
      expect(current.body.data.record.id).toBe(rec.id);
      expect(current.body.data.record.myRole).toBe('attorney');
      // Sealed = immutable: no more signing or declining.
      expect((await sign(client.auth, rec.id)).status).toBe(409);
      expect((await decline(client.auth, rec.id)).status).toBe(409);
      // The generic Docs-tab list does not show the record twice.
      const list = await api()
        .get(`/api/v1/cases/${caseId}/signing`)
        .set(client.auth);
      expect(list.status).toBe(200);
      expect(list.body.data).toEqual([]);

      // The attorney links their own agreement (an uploaded case file).
      const agreementBytes = Buffer.from('%PDF-1.4 fake agreement');
      await s3.put('fake-documents', `agr/${rec.id}.pdf`, agreementBytes);
      const agreement = await prisma.file.create({
        data: {
          owner_user_id: att.id,
          purpose: 'case_attachment',
          s3_bucket: 'fake-documents',
          s3_key: `agr/${rec.id}.pdf`,
          mime: 'application/pdf',
          size_bytes: agreementBytes.length,
          sha256: sha256(agreementBytes),
          scan_status: 'clean',
        },
      });
      const clientTry = await api()
        .post(`/api/v1/deal-records/${rec.id}/agreement`)
        .set(client.auth)
        .send({ fileId: agreement.id });
      expect(clientTry.status).toBe(403); // only the attorney attaches
      const attached = await api()
        .post(`/api/v1/deal-records/${rec.id}/agreement`)
        .set(att.auth)
        .send({ fileId: agreement.id });
      expect(attached.status).toBe(200);
      expect(attached.body.data.agreementFileId).toBe(agreement.id);
      expect(attached.body.data.agreementUrl).toMatch(
        /^https:\/\/fake\.test\//,
      );
      expect(await prisma.casePhoto.count({ where: { case_id: caseId } })).toBe(
        3,
      );
    });

    it('decline before the second signature: nothing happened, the case stays open, a new record can start', async () => {
      const client = await user('client');
      const att = await user('attorney');
      const caseId = await kase(client.id);
      const bidId = await bidOn(att.auth, caseId);
      const rec = (await start(client.auth, bidId)).body.data;
      await settle(client.auth, rec.id, 'unsigned', 'awaiting_signatures');
      expect((await sign(client.auth, rec.id, 'Anna Petrova')).status).toBe(
        200,
      );

      const declined = await decline(att.auth, rec.id);
      expect(declined.status).toBe(200);
      expect(declined.body.data.status).toBe('declined');
      expect(declined.body.data.declineReason).toBe('Changed my mind');
      expect(
        (await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status,
      ).toBe('active');
      expect(
        (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      ).toBe('open');
      const req = await prisma.caseSignRequest.findFirstOrThrow({
        where: { deal_record: { id: rec.id } },
      });
      expect(req.status).toBe('declined');
      const told = await prisma.notification.findFirst({
        where: { user_id: client.id, type: 'case_workspace_activity' },
        orderBy: { created_at: 'desc' },
      });
      expect(told?.payload).toMatchObject({ kind: 'deal_record_declined' });
      // No current record for the case any more, and the client may start again.
      const current = await api()
        .get(`/api/v1/cases/${caseId}/deal-record`)
        .set(client.auth);
      expect(current.body.data.record).toBeNull();
      const again = await start(client.auth, bidId);
      expect(again.status).toBe(201);
      expect(again.body.data.id).not.toBe(rec.id);
      // Declining a declined record is refused.
      expect((await decline(client.auth, rec.id)).status).toBe(409);
    });
  });

  describe('rich payment terms (bids.rich_terms_enabled)', () => {
    const terms = {
      version: 1,
      type: 'retainer_plus_installments',
      currency: 'USD',
      retainerCents: 20_000,
      installmentCents: 20_000,
      installmentCount: 2,
      installmentPeriod: 'monthly',
      notes: 'Court fees at cost.',
    };

    it('is refused while the switch is off', async () => {
      await setSwitch('bids.rich_terms_enabled', null);
      const client = await user('client');
      const att = await user('attorney');
      const caseId = await kase(client.id);
      const res = await postBid(
        att.auth,
        caseId,
        bidBody({ paymentTerms: terms }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_TERMS_DISABLED');
    });

    it('is stored on the bid and on every round when on; invalid terms are 400 with the problems', async () => {
      await setSwitch('bids.rich_terms_enabled', true);
      const client = await user('client');
      const att = await user('attorney');
      const caseId = await kase(client.id);
      const bad = await postBid(
        att.auth,
        caseId,
        bidBody({ paymentTerms: { ...terms, type: 'flat' } }),
      );
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('PAYMENT_TERMS_INVALID');
      expect(bad.body.error.details.problems).toEqual(
        expect.arrayContaining(['flat needs flatCents']),
      );

      const ok = await postBid(
        att.auth,
        caseId,
        bidBody({ paymentTerms: terms }),
      );
      expect(ok.status).toBe(201);
      expect(ok.body.data.paymentTerms).toEqual(terms);
      expect(ok.body.data.offers[0].paymentTerms).toEqual(terms);

      const counter = await api()
        .post(`/api/v1/bids/${ok.body.data.id}/counter`)
        .set(client.auth)
        .send({
          amountCents: 50_000,
          message: 'Flat, please',
          paymentTerms: {
            version: 1,
            type: 'flat',
            currency: 'USD',
            flatCents: 50_000,
          },
        });
      expect(counter.status).toBe(201);
      expect(counter.body.data.paymentTerms).toEqual({
        version: 1,
        type: 'flat',
        currency: 'USD',
        flatCents: 50_000,
      });
      expect(counter.body.data.offers[1].paymentTerms.type).toBe('flat');
      expect(counter.body.data.offers[0].paymentTerms).toEqual(terms);
    });
  });
});
