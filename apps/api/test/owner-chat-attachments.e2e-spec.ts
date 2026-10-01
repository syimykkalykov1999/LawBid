import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * OQ-047 (owner 2026-09-30): photos and documents in chats once the bid is
 * accepted — every common format (PDF, Word, Excel, PowerPoint, text,
 * images), any number; refused while contacts are locked; a file is sent
 * once; the "Files" filter lists only attachments.
 */
jest.setTimeout(120_000);

describe('Chat attachments (e2e, OQ-047)', () => {
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
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function chat(unlocked = true) {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Vera', last_name: 'Voice' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Otto', last_name: 'Audio' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `voice_${attorney.id.slice(0, 8)}`,
        username_lower: `voice_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'attach_e2e' },
      create: {
        code: 'attach_e2e',
        name_en: 'Attach e2e',
        i18n_key: 'practice.attach_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'attach_e2e.leaf' },
      create: {
        code: 'attach_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.attach_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Voice case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: unlocked,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    return {
      id: conv.id,
      client: { id: client.id, auth: bearer(client.id, 'client') },
      attorney: { id: attorney.id, auth: bearer(attorney.id, 'attorney') },
    };
  }

  /** presign → MinIO → confirm → clean; returns the file id. */
  async function upload(
    auth: Record<string, string>,
    bytes: Buffer,
    mime: string,
  ): Promise<string> {
    const pre = await api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send({
        purpose: 'chat_attachment',
        mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
      .expect(201);
    const p = pre.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }));
    const up = await fetch(p.upload.url, { method: 'POST', body: form });
    expect(up.status).toBe(204);
    await api().post(`/api/v1/files/${p.fileId}/confirm`).set(auth).expect(200);
    for (let i = 0; i < 100; i += 1) {
      const f = await api()
        .get(`/api/v1/files/${p.fileId}`)
        .set(auth)
        .expect(200);
      const status = (f.body.data as { scanStatus: string }).scanStatus;
      if (status === 'clean') return p.fileId;
      if (status !== 'pending') throw new Error(`scan ${status}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('scan did not finish');
  }

  const pdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n',
  );
  const csv = Buffer.from('name,amount\nRent,1200\nDeposit,600\n');
  const jpeg = readFileSync(join(__dirname, 'fixtures/sample.jpg'));
  const OLE = Buffer.from([
    0xd0,
    0xcf,
    0x11,
    0xe0,
    0xa1,
    0xb1,
    0x1a,
    0xe1,
    ...Array(504).fill(0),
  ]);

  const send = (
    auth: Record<string, string>,
    convId: string,
    body: Record<string, unknown>,
  ) =>
    api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(auth)
      .send({ clientMessageId: randomUUID(), ...body });

  it('sends documents and photos both ways after acceptance; lists them', async () => {
    const c = await chat();
    const doc = await upload(c.attorney.auth, pdf, 'application/pdf');
    const sent = await send(c.attorney.auth, c.id, {
      type: 'attachment',
      fileId: doc,
      fileName: '../Engagement letter.pdf',
      body: 'Please sign',
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data.type).toBe('attachment');
    expect(sent.body.data.attachment).toMatchObject({
      fileId: doc,
      name: 'Engagement letter.pdf',
      mime: 'application/pdf',
      isImage: false,
      url: expect.any(String),
    });
    expect(sent.body.data.body).toBe('Please sign');

    const table = await upload(c.client.auth, csv, 'text/csv');
    expect(
      (
        await send(c.client.auth, c.id, {
          type: 'attachment',
          fileId: table,
          fileName: 'expenses.csv',
        })
      ).status,
    ).toBe(201);
    const legacyExcel = await upload(
      c.client.auth,
      OLE,
      'application/vnd.ms-excel',
    );
    expect(
      (
        await send(c.client.auth, c.id, {
          type: 'attachment',
          fileId: legacyExcel,
          fileName: 'old.xls',
        })
      ).status,
    ).toBe(201);
    const photo = await upload(c.client.auth, jpeg, 'image/jpeg');
    const p = await send(c.client.auth, c.id, {
      type: 'attachment',
      fileId: photo,
      fileName: 'IMG_0001.jpg',
    });
    expect(p.body.data.attachment).toMatchObject({
      isImage: true,
      previewUrl: expect.any(String),
    });

    // A file goes once.
    const again = await send(c.client.auth, c.id, {
      type: 'attachment',
      fileId: photo,
      fileName: 'IMG_0001.jpg',
    });
    expect(again.status).toBe(409);

    await send(c.client.auth, c.id, { body: 'Thanks!' });
    const files = await api()
      .get(`/api/v1/conversations/${c.id}/messages?only=attachment`)
      .set(c.attorney.auth)
      .expect(200);
    expect((files.body.data as { type: string }[]).map((m) => m.type)).toEqual([
      'attachment',
      'attachment',
      'attachment',
      'attachment',
    ]);
  });

  it('refuses files before acceptance and from outsiders', async () => {
    const locked = await chat(false);
    const f = await upload(locked.attorney.auth, pdf, 'application/pdf');
    const r = await send(locked.attorney.auth, locked.id, {
      type: 'attachment',
      fileId: f,
      fileName: 'a.pdf',
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CHAT_ATTACHMENTS_LOCKED');

    const c = await chat();
    const other = await chat();
    const foreign = await upload(other.client.auth, pdf, 'application/pdf');
    const steal = await send(c.client.auth, c.id, {
      type: 'attachment',
      fileId: foreign,
      fileName: 'x.pdf',
    });
    expect(steal.status).not.toBe(201);
    const noName = await send(c.client.auth, c.id, {
      type: 'attachment',
      fileId: foreign,
    });
    expect(noName.status).toBe(400);
  });

  it('rejects a declared type the bytes do not match', async () => {
    const c = await chat();
    const pre = await api()
      .post('/api/v1/files/presign')
      .set(c.client.auth)
      .send({
        purpose: 'chat_attachment',
        mime: 'application/pdf',
        sizeBytes: csv.length,
        sha256: createHash('sha256').update(csv).digest('hex'),
      })
      .expect(201);
    const p = pre.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append(
      'file',
      new Blob([new Uint8Array(csv)], { type: 'application/pdf' }),
    );
    await fetch(p.upload.url, { method: 'POST', body: form });
    const confirm = await api()
      .post(`/api/v1/files/${p.fileId}/confirm`)
      .set(c.client.auth);
    expect(confirm.status).toBe(400);
    expect(confirm.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });
});
