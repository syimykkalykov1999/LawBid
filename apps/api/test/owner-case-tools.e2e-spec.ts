import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLib } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { CaseJournalService } from '../src/modules/journal/case-journal.service';
import { CaseSigningService } from '../src/modules/cases/tools/case-signing.service';
import type { RequestUser } from '../src/modules/auth/decorators/current-user.decorator';
import { ConflictCheckService } from '../src/modules/bids/conflict/conflict-check.service';
import { ensurePostPractices } from './support/post-practices';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-20 (case tools): time and expenses → invoice, e-signature,
 * documents from templates, conflict of interests. The object store is an
 * in-memory fake: these suites need Postgres and Redis only.
 */
jest.setTimeout(120_000);

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

// A 1x1 PNG for a drawn signature.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function pdfBytes(pages = 2): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) =>
    doc.on('end', () => r(Buffer.concat(chunks))),
  );
  for (let i = 0; i < pages; i++) {
    if (i) doc.addPage();
    doc.text(`Retainer agreement, page ${i + 1}`);
  }
  doc.end();
  return done;
}

describe('Case tools (e2e, 2026-10-20)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let s3: FakeS3;
  let baseUrl = '';

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
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function user(
    role: 'client' | 'attorney',
    names: { first: string; last: string; phone?: string; email?: string } = {
      first: role === 'client' ? 'Anna' : 'John',
      last: role === 'client' ? 'Petrova' : 'Smith',
    },
  ) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: names.first,
        last_name: names.last,
        phone_e164: names.phone ?? null,
        email: names.email ?? null,
        phone_verified_at: role === 'client' ? new Date() : null,
      },
    });
    const handle = `${role.slice(0, 2)}_${u.id.slice(0, 8)}`;
    if (role === 'client') {
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
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

  type Person = Awaited<ReturnType<typeof user>>;

  async function makeCase(
    cli: Person,
    att: Person | null,
    over: { title?: string; description?: string; details?: string } = {},
  ) {
    const a = await prisma.practiceArea.findFirstOrThrow({
      where: { parent_id: { not: null } },
    });
    const c = await prisma.case.create({
      data: {
        client_id: cli.id,
        title: over.title ?? 'Lease dispute',
        description: over.description ?? 'A description long enough.',
        private_details: over.details ?? null,
        practice_area_id: a.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status: att ? 'in_progress' : 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    if (att) {
      const bid = await prisma.bid.create({
        data: {
          case_id: c.id,
          attorney_id: att.id,
          status: 'accepted',
          fee_type: 'fixed',
          amount_cents: 100000,
          message: 'My bid',
          start_availability: 'immediately',
          turn: 'client',
        },
      });
      await prisma.case.update({
        where: { id: c.id },
        data: { accepted_bid_id: bid.id },
      });
      await prisma.conversation.create({
        data: {
          case_id: c.id,
          attorney_id: att.id,
          client_id: cli.id,
          status: 'active',
        },
      });
    }
    return c.id;
  }

  const api = () => request(baseUrl);
  const notes = (userId: string, caseId: string) =>
    prisma.notification
      .findMany({
        where: { user_id: userId, type: 'case_workspace_activity' },
        orderBy: { created_at: 'asc' },
      })
      .then((rows) =>
        rows
          .filter((r) => (r.payload as { caseId?: string }).caseId === caseId)
          .map((r) => (r.payload as { kind: string }).kind),
      );
  const chatLines = (caseId: string) =>
    prisma.message
      .findMany({
        where: { conversation: { case_id: caseId }, type: 'system' },
        orderBy: { created_at: 'asc' },
      })
      .then((rows) => rows.map((m) => m.body_original));

  // ---- time, expenses, invoice -----------------------------------------

  it('logs time and expenses, then issues an invoice the client can read', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const caseId = await makeCase(cli, att);
    const base = `/api/v1/cases/${caseId}/billing`;

    // no rate yet: a timer cannot start
    const early = await api().post(`${base}/timer/start`).set(att.auth);
    expect(early.status).toBe(409);

    const rate = await api()
      .put(`${base}/rate`)
      .set(att.auth)
      .send({ hourlyRateCents: 20000 });
    expect(rate.status).toBe(200);
    expect(rate.body.data.hourlyRateCents).toBe(20000);

    // the client may not set it, nor see the attorney's work
    expect(
      (
        await api()
          .put(`${base}/rate`)
          .set(cli.auth)
          .send({ hourlyRateCents: 1 })
      ).status,
    ).toBe(403);

    const start = await api().post(`${base}/timer/start`).set(att.auth);
    expect(start.status).toBe(200);
    expect(start.body.data.timer.caseId).toBe(caseId);
    // one running timer per attorney
    expect((await api().post(`${base}/timer/start`).set(att.auth)).status).toBe(
      409,
    );
    const mine = await api()
      .get('/api/v1/users/me/running-timer')
      .set(att.auth);
    expect(mine.body.data.caseTitle).toBe('Lease dispute');
    // back-date the run by 30 minutes, then stop
    await prisma.caseTimeEntry.updateMany({
      where: { case_id: caseId, running_since: { not: null } },
      data: { running_since: new Date(Date.now() - 30 * 60_000) },
    });
    const stop = await api()
      .post(`${base}/timer/stop`)
      .set(att.auth)
      .send({ note: 'Call with the landlord' });
    expect(stop.status).toBe(200);
    expect(stop.body.data.timer).toBeNull();
    expect(stop.body.data.entries[0].minutes).toBe(30);
    expect(stop.body.data.entries[0].cents).toBe(10000);

    const manual = await api().post(`${base}/time`).set(att.auth).send({
      workedOn: '2026-10-19',
      minutes: 90,
      note: 'Drafted the motion',
    });
    expect(manual.status).toBe(201);

    const exp = await api().post(`${base}/expenses`).set(att.auth).send({
      spentOn: '2026-10-19',
      description: 'Filing fee',
      amountCents: 4500,
    });
    expect(exp.status).toBe(201);
    expect(exp.body.data.unbilled).toEqual({
      minutes: 120,
      timeCents: 40000,
      expensesCents: 4500,
      totalCents: 44500,
    });

    // the client sees nothing of it yet
    const before = await api().get(base).set(cli.auth);
    expect(before.body.data.role).toBe('client');
    expect(before.body.data.entries).toEqual([]);
    expect(before.body.data.invoices).toEqual([]);

    const inv = await api()
      .post(`${base}/invoices`)
      .set(att.auth)
      .send({ note: 'Thank you' });
    expect(inv.status).toBe(201);
    const invoice = inv.body.data.invoices[0];
    expect(invoice.totalCents).toBe(44500);
    expect(invoice.number).toMatch(/^LB-[0-9A-F]{8}-001$/);
    expect(invoice.url).toContain('fake.test');
    expect(inv.body.data.unbilled.totalCents).toBe(0);
    expect(
      (inv.body.data.entries as { invoiceId: string }[]).every(
        (e) => e.invoiceId,
      ),
    ).toBe(true);

    // the PDF is a real PDF, in the case's files, for both sides
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: invoice.fileId },
    });
    const bytes = await s3.read(file.s3_bucket, file.s3_key);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      await prisma.casePhoto.count({
        where: { case_id: caseId, file_id: file.id },
      }),
    ).toBe(1);

    // the client reads the invoice and is told; the chat has the line
    const after = await api().get(base).set(cli.auth);
    expect(after.body.data.invoices[0].totalCents).toBe(44500);
    expect(await notes(cli.id, caseId)).toContain('invoice');
    expect(await chatLines(caseId)).toContain('invoice_issued:44500');
    const journal = await prisma.caseJournal.findFirst({
      where: { case_id: caseId, event_type: 'invoice_issued' },
    });
    expect(journal).not.toBeNull();
    expect((await app.get(CaseJournalService).verifyChain(caseId)).valid).toBe(
      true,
    );

    // an invoiced entry is frozen; there is nothing more to invoice
    const entryId = inv.body.data.entries[0].id as string;
    expect(
      (await api().delete(`${base}/time/${entryId}`).set(att.auth)).status,
    ).toBe(409);
    expect(
      (await api().post(`${base}/invoices`).set(att.auth).send({})).status,
    ).toBe(409);

    // a stranger sees nothing
    const stranger = await user('attorney');
    expect((await api().get(base).set(stranger.auth)).status).toBe(404);
  });

  it('prices an entry at the rate it was logged at', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const caseId = await makeCase(cli, att);
    const base = `/api/v1/cases/${caseId}/billing`;
    await api()
      .put(`${base}/rate`)
      .set(att.auth)
      .send({ hourlyRateCents: 10000 });
    await api()
      .post(`${base}/time`)
      .set(att.auth)
      .send({ workedOn: '2026-10-18', minutes: 60 });
    await api()
      .put(`${base}/rate`)
      .set(att.auth)
      .send({ hourlyRateCents: 30000 });
    const r = await api()
      .post(`${base}/time`)
      .set(att.auth)
      .send({ workedOn: '2026-10-19', minutes: 60 });
    expect(r.body.data.unbilled.timeCents).toBe(40000);
    // a bad entry is refused
    expect(
      (
        await api()
          .post(`${base}/time`)
          .set(att.auth)
          .send({ workedOn: '2026-10-19', minutes: 0 })
      ).status,
    ).toBe(400);
  });

  // ---- e-signature -----------------------------------------------------

  async function pdfFile(owner: Person): Promise<string> {
    const data = await pdfBytes(2);
    const id = randomUUID();
    const key = `case_attachment/${owner.id}/${id}`;
    await s3.put('fake-documents', key, data);
    await prisma.file.create({
      data: {
        id,
        owner_user_id: owner.id,
        purpose: 'case_attachment',
        s3_bucket: 'fake-documents',
        s3_key: key,
        mime: 'application/pdf',
        size_bytes: BigInt(data.length),
        sha256: createHash('sha256').update(data).digest('hex'),
        scan_status: 'clean',
      },
    });
    return id;
  }

  it('both sides sign a PDF; the finished file carries the protocol and verifies', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const caseId = await makeCase(cli, att);
    const base = `/api/v1/cases/${caseId}/signing`;
    const fileId = await pdfFile(att);

    const made = await api()
      .post(base)
      .set(att.auth)
      .send({ fileId, title: 'Retainer agreement' });
    expect(made.status).toBe(201);
    const req = made.body.data[0];
    expect(req.status).toBe('pending');
    expect(req.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(req.canSign).toBe(true);
    expect(await notes(cli.id, caseId)).toContain('sign_request');
    expect(await chatLines(caseId)).toContain('sign_requested');

    // consent is required, a drawn signature needs its picture
    expect(
      (
        await api()
          .post(`${base}/${req.id}/sign`)
          .set(cli.auth)
          .send({ method: 'typed', name: 'Anna Petrova', consent: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .post(`${base}/${req.id}/sign`)
          .set(cli.auth)
          .send({ method: 'drawn', name: 'Anna Petrova', consent: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await api().post(`${base}/${req.id}/sign`).set(cli.auth).send({
          method: 'drawn',
          name: 'Anna Petrova',
          consent: true,
          imagePngBase64: 'bm90IGEgcG5n',
        })
      ).status,
    ).toBe(400);

    const first = await api()
      .post(`${base}/${req.id}/sign`)
      .set(cli.auth)
      .set('User-Agent', 'LawBid-test/1.0')
      .send({ method: 'typed', name: 'Anna Petrova', consent: true });
    expect(first.status).toBe(200);
    expect(first.body.data[0].status).toBe('pending');
    expect(first.body.data[0].canSign).toBe(false);
    // twice is refused
    expect(
      (
        await api()
          .post(`${base}/${req.id}/sign`)
          .set(cli.auth)
          .send({ method: 'typed', name: 'Anna Petrova', consent: true })
      ).status,
    ).toBe(409);

    const second = await api()
      .post(`${base}/${req.id}/sign`)
      .set(att.auth)
      .send({
        method: 'drawn',
        name: 'John Smith',
        consent: true,
        imagePngBase64: PNG_B64,
      });
    expect(second.status).toBe(200);
    const done = second.body.data[0];
    expect(done.status).toBe('signed');
    expect(done.finalUrl).toContain('fake.test');
    expect(done.finalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(
      (done.signatures as { role: string }[]).map((s) => s.role).sort(),
    ).toEqual(['attorney', 'client']);

    // original 2 pages + signature page + protocol page, readable
    const final = await prisma.caseSignRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    const f = await prisma.file.findUniqueOrThrow({
      where: { id: final.final_file_id as string },
    });
    const merged = await s3.read(f.s3_bucket, f.s3_key);
    expect((await PdfLib.load(merged)).getPageCount()).toBe(4);
    expect(createHash('sha256').update(merged).digest('hex')).toBe(
      final.final_sha256,
    );

    // the signature record keeps IP, device and the hash of the document
    const sig = await prisma.caseSignature.findFirstOrThrow({
      where: { request_id: req.id, signer_role: 'client' },
    });
    expect(sig.user_agent).toBe('LawBid-test/1.0');
    expect(sig.doc_sha256).toBe(req.sourceSha256);
    expect(sig.ip).toBeTruthy();

    // a signature is never changed or removed on its own
    await expect(
      prisma.caseSignature.update({
        where: { id: sig.id },
        data: { signed_name: 'Someone Else' },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.caseSignature.delete({ where: { id: sig.id } }),
    ).rejects.toThrow(/only with their request/);

    // journal: requested, 2 x signed, completed — chain intact
    const events = (
      await prisma.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
      })
    ).map((j) => j.event_type);
    expect(events.filter((e) => e.startsWith('signature_'))).toEqual([
      'signature_requested',
      'signature_signed',
      'signature_signed',
      'signature_completed',
    ]);
    expect(await chatLines(caseId)).toContain('sign_completed');
    expect(await notes(cli.id, caseId)).toContain('sign_done');
    // the last signer is not told about their own signature
    expect(await notes(att.id, caseId)).not.toContain('sign_done');

    const ok = await api().get(`${base}/${req.id}/verify`).set(cli.auth);
    expect(ok.body.data).toMatchObject({
      sourceOk: true,
      finalOk: true,
      journalOk: true,
      journalSignatures: 2,
    });

    // tamper with the stored signed file: verification notices
    await s3.put(
      f.s3_bucket,
      f.s3_key,
      Buffer.concat([merged, Buffer.from('x')]),
    );
    const bad = await api().get(`${base}/${req.id}/verify`).set(att.auth);
    expect(bad.body.data.finalOk).toBe(false);
    expect(bad.body.data.sourceOk).toBe(true);

    // a finished document takes no more signatures
    expect(
      (await api().post(`${base}/${req.id}/decline`).set(cli.auth).send({}))
        .status,
    ).toBe(409);

    // purging the document takes its signatures with it: the guard trigger
    // lets the cascade through (and only the cascade)
    expect(
      await prisma.caseSignature.count({ where: { request_id: req.id } }),
    ).toBe(2);
    await prisma.caseSignRequest.delete({ where: { id: req.id } });
    expect(
      await prisma.caseSignature.count({ where: { request_id: req.id } }),
    ).toBe(0);
  });

  it('refuses what cannot be signed and lets the other side decline', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const caseId = await makeCase(cli, att);
    const base = `/api/v1/cases/${caseId}/signing`;

    // not a PDF
    const data = Buffer.from('hello');
    const id = randomUUID();
    await s3.put('fake-documents', `k/${id}`, data);
    await prisma.file.create({
      data: {
        id,
        owner_user_id: att.id,
        purpose: 'case_attachment',
        s3_bucket: 'fake-documents',
        s3_key: `k/${id}`,
        mime: 'image/png',
        size_bytes: BigInt(data.length),
        sha256: createHash('sha256').update(data).digest('hex'),
        scan_status: 'clean',
      },
    });
    expect(
      (await api().post(base).set(att.auth).send({ fileId: id, title: 'x' }))
        .status,
    ).toBe(400);

    // a damaged "PDF"
    const bad = randomUUID();
    await s3.put('fake-documents', `k/${bad}`, data);
    await prisma.file.create({
      data: {
        id: bad,
        owner_user_id: att.id,
        purpose: 'case_attachment',
        s3_bucket: 'fake-documents',
        s3_key: `k/${bad}`,
        mime: 'application/pdf',
        size_bytes: BigInt(data.length),
        sha256: createHash('sha256').update(data).digest('hex'),
        scan_status: 'clean',
      },
    });
    expect(
      (await api().post(base).set(att.auth).send({ fileId: bad, title: 'x' }))
        .status,
    ).toBe(400);

    // someone else's file
    const other = await user('attorney');
    const theirs = await pdfFile(other);
    expect(
      (
        await api()
          .post(base)
          .set(att.auth)
          .send({ fileId: theirs, title: 'x' })
      ).status,
    ).toBe(404);

    // the client declines with a reason; the attorney cannot cancel a declined one
    const fileId = await pdfFile(att);
    const made = await api()
      .post(base)
      .set(att.auth)
      .send({ fileId, title: 'Retainer' });
    const rid = made.body.data[0].id as string;
    // an assistant cannot decline, as it cannot sign
    await expect(
      app.get(CaseSigningService).decline(
        {
          sub: att.id,
          role: 'attorney',
          assistant: true,
        } as unknown as RequestUser,
        caseId,
        rid,
        undefined,
      ),
    ).rejects.toThrow(/Only the attorney/);
    const dec = await api()
      .post(`${base}/${rid}/decline`)
      .set(cli.auth)
      .send({ reason: 'Fee too high' });
    expect(dec.status).toBe(200);
    expect(dec.body.data[0]).toMatchObject({
      status: 'declined',
      declinedByRole: 'client',
      declineReason: 'Fee too high',
    });
    expect(
      (await api().post(`${base}/${rid}/cancel`).set(att.auth)).status,
    ).toBe(409);
    expect(await notes(att.id, caseId)).toContain('sign_declined');

    // only the asker cancels
    const again = await api()
      .post(base)
      .set(att.auth)
      .send({ fileId, title: 'Retainer v2' });
    const rid2 = again.body.data[0].id as string;
    expect(
      (await api().post(`${base}/${rid2}/cancel`).set(cli.auth)).status,
    ).toBe(403);
    expect(
      (await api().post(`${base}/${rid2}/cancel`).set(att.auth)).status,
    ).toBe(200);

    // a stranger sees nothing
    const stranger = await user('client');
    expect((await api().get(base).set(stranger.auth)).status).toBe(404);
  });

  // ---- documents from templates ---------------------------------------

  it('builds a PDF from a template; the admin keeps the templates', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const caseId = await makeCase(cli, att, { title: 'Eviction notice' });
    const admin = await adminSession(baseUrl, prisma, 'super_admin');

    const bad = await api()
      .post('/api/v1/admin/form-templates')
      .set(admin.auth)
      .send({
        slug: 'bad-one',
        title: { en: 'Bad' },
        body: { en: 'Dear {{nobody}}' },
        fields: [],
      });
    expect(bad.status).toBe(400);

    const slug = `letter-${randomUUID().slice(0, 6)}`;
    const created = await api()
      .post('/api/v1/admin/form-templates')
      .set(admin.auth)
      .send({
        slug,
        title: { en: 'Short letter', ru: 'Короткое письмо' },
        body: {
          en: '# Letter\n\nDear {{recipient}},\n\nRe: {{case_title}}\n\n{{attorney_name}}',
          ru: '# Письмо\n\nУважаемый {{recipient}},\n\nПо делу: {{case_title}}\n\n{{attorney_name}}',
        },
        fields: [
          {
            key: 'recipient',
            type: 'text',
            required: true,
            label: { en: 'To', ru: 'Кому' },
          },
          {
            key: 'case_title',
            type: 'text',
            required: true,
            label: { en: 'Case' },
            prefill: 'case_title',
          },
          {
            key: 'attorney_name',
            type: 'text',
            required: true,
            label: { en: 'Attorney' },
            prefill: 'attorney_name',
          },
        ],
        published: true,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    // a slug is unique
    expect(
      (
        await api()
          .post('/api/v1/admin/form-templates')
          .set(admin.auth)
          .send({
            slug,
            title: { en: 'Dup' },
            body: { en: 'x' },
            fields: [],
          })
      ).status,
    ).toBe(409);

    const list = await api()
      .get(`/api/v1/cases/${caseId}/documents/templates`)
      .set(att.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.prefill.attorney_name).toBe('John Smith');
    expect(list.body.data.prefill.client_name).toBe('Anna Petrova');
    expect(list.body.data.prefill.case_title).toBe('Eviction notice');
    const t = (
      list.body.data.templates as { id: string; languages: string[] }[]
    ).find((x) => x.id === id);
    expect(t?.languages.sort()).toEqual(['en', 'ru']);

    const build = `/api/v1/cases/${caseId}/documents/build`;
    // a required answer missing
    const miss = await api()
      .post(build)
      .set(att.auth)
      .send({ templateId: id, language: 'en', values: {} });
    expect(miss.status).toBe(400);
    expect(
      miss.body.error?.details?.fields ?? miss.body.details?.fields,
    ).toEqual(
      expect.arrayContaining([{ key: 'recipient', problem: 'required' }]),
    );
    // a language the template does not have
    expect(
      (
        await api()
          .post(build)
          .set(att.auth)
          .send({
            templateId: id,
            language: 'de',
            values: { recipient: 'x', case_title: 'y', attorney_name: 'z' },
          })
      ).status,
    ).toBe(400);
    // the client cannot build
    expect(
      (
        await api()
          .post(build)
          .set(cli.auth)
          .send({ templateId: id, language: 'en', values: {} })
      ).status,
    ).toBe(400);

    const ok = await api()
      .post(build)
      .set(att.auth)
      .send({
        templateId: id,
        language: 'ru',
        values: {
          recipient: 'Иван Иванов',
          case_title: 'Eviction notice',
          attorney_name: 'John Smith',
        },
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.title).toBe('Короткое письмо');
    const f = await prisma.file.findUniqueOrThrow({
      where: { id: ok.body.data.fileId },
    });
    expect(
      (await s3.read(f.s3_bucket, f.s3_key)).subarray(0, 5).toString(),
    ).toBe('%PDF-');
    expect(
      await prisma.casePhoto.count({
        where: { case_id: caseId, file_id: f.id },
      }),
    ).toBe(1);

    // unpublished templates are not offered
    await api()
      .patch(`/api/v1/admin/form-templates/${id}`)
      .set(admin.auth)
      .send({ published: false });
    const hidden = await api()
      .get(`/api/v1/cases/${caseId}/documents/templates`)
      .set(att.auth);
    expect(
      (hidden.body.data.templates as { id: string }[]).find((x) => x.id === id),
    ).toBeUndefined();
    expect(
      (
        await api()
          .post(build)
          .set(att.auth)
          .send({ templateId: id, language: 'en', values: {} })
      ).status,
    ).toBe(404);
    expect(
      (await api().delete(`/api/v1/admin/form-templates/${id}`).set(admin.auth))
        .status,
    ).toBe(204);
    // an ordinary user is not an admin
    expect(
      (await api().get('/api/v1/admin/form-templates').set(att.auth)).status,
    ).toBeGreaterThanOrEqual(401);
  });

  // ---- conflict of interests -------------------------------------------

  it('warns an attorney whose former client is named in a new case, and the other way round', async () => {
    const att = await user('attorney');
    const old = await user('client', {
      first: 'Maria',
      last: 'Gonzalez',
      phone: '+13125550142',
      email: 'maria.g@example.com',
    });
    await makeCase(old, att, {
      title: 'Wage claim',
      details: 'Employer: Bright Cafe, manager Robert Klein, +1 (212) 555-0188',
    });

    // 1) a new case that names Maria (maybe as the opposing party)
    const newClient = await user('client', { first: 'Peter', last: 'Brown' });
    const named = await makeCase(newClient, null, {
      title: 'Roommate dispute',
      description: 'My roommate maria gonzalez stopped paying rent.',
    });
    const one = await api()
      .get(`/api/v1/cases/${named}/conflict-check`)
      .set(att.auth);
    expect(one.status).toBe(200);
    expect(one.body.data.conflict).toBe(true);
    expect(one.body.data.matches).toEqual([
      expect.objectContaining({
        kind: 'former_client',
        by: 'name',
        caseTitle: 'Wage claim',
      }),
    ]);

    // 2) a new case whose client is named in the attorney's old case
    const klein = await user('client', {
      first: 'Robert',
      last: 'Klein',
      phone: '+12125550188',
    });
    const theirs = await makeCase(klein, null, { title: 'Back pay' });
    const two = await api()
      .get(`/api/v1/cases/${theirs}/conflict-check`)
      .set(att.auth);
    // by name alone, and without saying how it matched
    expect(two.body.data.matches).toEqual([
      {
        kind: 'opposing_party',
        caseId: expect.any(String),
        caseTitle: 'Wage claim',
      },
    ]);
    // the answer never carries the client's identity
    expect(JSON.stringify(two.body.data)).not.toMatch(/Klein|212|0188/);

    // 3) an unrelated case is clean
    const clean = await makeCase(
      await user('client', { first: 'Zed', last: 'Quark' }),
      null,
    );
    const none = await api()
      .get(`/api/v1/cases/${clean}/conflict-check`)
      .set(att.auth);
    expect(none.body.data).toEqual({ conflict: false, matches: [] });

    // each warning is kept as the attorney's own record; a bid keeps one too
    expect(
      await prisma.caseConflictCheck.count({
        where: { case_id: named, attorney_id: att.id },
      }),
    ).toBe(1);
    await app.get(ConflictCheckService).onBid(att.id, named, randomUUID());
    const recs = await prisma.caseConflictCheck.findMany({
      where: { case_id: named },
      orderBy: { created_at: 'asc' },
    });
    expect(recs.map((r) => r.trigger)).toEqual(['view', 'bid']);

    // a client cannot use it
    expect(
      (
        await api()
          .get(`/api/v1/cases/${named}/conflict-check`)
          .set(newClient.auth)
      ).status,
    ).toBe(403);
    // a client's private details are not read before hire
    const hidden = await makeCase(
      await user('client', { first: 'Pat', last: 'Hidden' }),
      null,
      { title: 'Private matter', details: 'The other side is maria gonzalez.' },
    );
    const priv = await api()
      .get(`/api/v1/cases/${hidden}/conflict-check`)
      .set(att.auth);
    expect(priv.body.data).toEqual({ conflict: false, matches: [] });

    // a day's checks are limited
    await prisma.caseConflictCheck.deleteMany({
      where: { attorney_id: att.id },
    });
    await prisma.caseConflictCheck.createMany({
      data: Array.from({ length: 30 }, () => ({
        case_id: clean,
        attorney_id: att.id,
        trigger: 'view',
        matches: [],
      })),
    });
    expect(
      (await api().get(`/api/v1/cases/${clean}/conflict-check`).set(att.auth))
        .status,
    ).toBe(429);

    // the same client in both cases is not a conflict
    const again = await makeCase(old, null, {
      title: 'Second matter',
      description: 'maria gonzalez again',
    });
    await prisma.caseConflictCheck.deleteMany({
      where: { attorney_id: att.id },
    });
    const same = await api()
      .get(`/api/v1/cases/${again}/conflict-check`)
      .set(att.auth);
    expect(same.body.data.conflict).toBe(false);

    // Owner 2026-10-22 (security audit #3, finding 7): another client's
    // closed case the attorney never worked on is not theirs to probe...
    const closed = await makeCase(newClient, null, {
      title: 'Closed elsewhere',
      description: 'maria gonzalez',
    });
    await prisma.case.update({
      where: { id: closed },
      data: { status: 'closed' },
    });
    const probe = await api()
      .get(`/api/v1/cases/${closed}/conflict-check`)
      .set(att.auth);
    expect(probe.status).toBe(404);
    expect(probe.body.error.code).toBe('CASE_NOT_FOUND');
    // ...and a block either way refuses the check.
    await prisma.userBlock.create({
      data: { blocker_id: newClient.id, blocked_id: att.id },
    });
    const blocked = await api()
      .get(`/api/v1/cases/${named}/conflict-check`)
      .set(att.auth);
    expect(blocked.status).not.toBe(200);
  });
});
