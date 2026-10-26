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
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-18 (OQ-055): support with files in both directions, the
 * device info the app attaches, `{name}` / `{ticket}` filled on the server,
 * a macro per language, and the «Непрочитанные» filter.
 */
jest.setTimeout(120_000);

describe('Support attachments, device info, macros (e2e, OQ-055)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  let agent: AdminSession;
  const rights = { dashboard: 'view', support: 'manage', users: 'view' };

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
    agent = await adminSession(base, prisma, 'support', undefined, rights);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  async function client(lang = 'ru', first: string | null = 'Вера') {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: first,
        email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
        ui_language: lang,
      },
    });
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  /** presign → S3 → confirm → clean; [presign]/[confirm] differ for admins. */
  async function upload(
    auth: Record<string, string>,
    bytes: Buffer,
    mime: string,
    admin = false,
  ): Promise<string> {
    const pre = await api()
      .post(admin ? '/api/v1/admin/support/uploads' : '/api/v1/files/presign')
      .set(auth)
      .send({
        ...(admin ? {} : { purpose: 'support_attachment' }),
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
    const confirm = admin
      ? `/api/v1/admin/support/uploads/${p.fileId}/confirm`
      : `/api/v1/files/${p.fileId}/confirm`;
    await api().post(confirm).set(auth).expect(200);
    for (let i = 0; i < 100; i += 1) {
      const f = await api().post(confirm).set(auth);
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
  const jpeg = readFileSync(join(__dirname, 'fixtures/sample.jpg'));

  it('ticket with a photo, a PDF and device info; admin answers with a file and a macro', async () => {
    const user = await client();
    const photoId = await upload(user.auth, jpeg, 'image/jpeg');
    const pdfId = await upload(user.auth, pdf, 'application/pdf');

    const created = await api()
      .post('/api/v1/support/tickets')
      .set(user.auth)
      .send({
        subject: 'Screen is broken',
        category: 'bug',
        body: '',
        attachments: [
          { fileId: photoId, name: 'screen.jpg' },
          { fileId: pdfId, name: 'log.pdf' },
        ],
        context: {
          appVersion: '1.4.2',
          buildNumber: '57',
          platform: 'ios',
          osVersion: 'iOS 18.2',
          deviceModel: 'Apple iPhone15,2',
          language: 'ru',
          theme: 'navy',
          timezone: 'America/Chicago',
          route: '/cases/42',
        },
      })
      .expect(201);
    const ticketId = created.body.data.id as string;
    const first = (
      created.body.data.messages as {
        attachments: {
          id: string;
          name: string;
          isImage: boolean;
          url: string | null;
          previewUrl: string | null;
        }[];
      }[]
    )[0];
    expect(first.attachments.map((a) => a.name)).toEqual([
      'screen.jpg',
      'log.pdf',
    ]);
    expect(first.attachments[0]).toMatchObject({ isImage: true });
    expect(first.attachments[0].previewUrl).toEqual(expect.any(String));
    expect(first.attachments[1].url).toEqual(expect.any(String));
    // The user's own ticket JSON never carries the device card.
    expect(JSON.stringify(created.body.data)).not.toContain('Apple iPhone15,2');

    // The same file is not sent twice.
    await api()
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set(user.auth)
      .send({
        body: 'again',
        attachments: [{ fileId: pdfId, name: 'log.pdf' }],
      })
      .expect(409);
    // Nothing to send.
    await api()
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set(user.auth)
      .send({ body: ' ' })
      .expect(400);

    // Admin: attachments and the device card.
    const list = await api()
      .get('/api/v1/admin/support/tickets?unread=true')
      .set(agent.auth)
      .expect(200);
    expect(
      (list.body.data as { id: string }[]).some((t) => t.id === ticketId),
    ).toBe(true);
    const detail = await api()
      .get(`/api/v1/admin/support/tickets/${ticketId}`)
      .set(agent.auth)
      .expect(200);
    expect(detail.body.data.clientContext).toMatchObject({
      appVersion: '1.4.2',
      platform: 'ios',
      deviceModel: 'Apple iPhone15,2',
      route: '/cases/42',
      userId: user.id,
      role: 'client',
    });
    const adminFiles = (
      detail.body.data.messages as { attachments: { name: string }[] }[]
    ).flatMap((m) => m.attachments);
    expect(adminFiles.map((f) => f.name)).toEqual(['screen.jpg', 'log.pdf']);
    // Read now: gone from the unread filter.
    const after = await api()
      .get('/api/v1/admin/support/tickets?unread=true')
      .set(agent.auth)
      .expect(200);
    expect(
      (after.body.data as { id: string }[]).some((t) => t.id === ticketId),
    ).toBe(false);

    // A macro with both languages: the composer asks for the user's text.
    const macro = await api()
      .post('/api/v1/admin/support/macros')
      .set(agent.auth)
      .send({
        title: `Hello ${randomUUID().slice(0, 6)}`,
        body: 'Hello {name}, we are on it ({ticket}).',
        bodyRu: 'Здравствуйте, {name}! Занимаемся обращением {ticket}.',
      })
      .expect(201);
    const macroId = macro.body.data.id as string;
    const ru = await api()
      .get('/api/v1/admin/support/macros?language=ru')
      .set(agent.auth)
      .expect(200);
    const ruText = (ru.body.data as { id: string; text: string }[]).find(
      (m) => m.id === macroId,
    )!.text;
    expect(ruText).toContain('Здравствуйте');
    const en = await api()
      .get('/api/v1/admin/support/macros?language=en')
      .set(agent.auth)
      .expect(200);
    expect(
      (en.body.data as { id: string; text: string }[]).find(
        (m) => m.id === macroId,
      )!.text,
    ).toContain('Hello {name}');

    // Admin replies with the macro text and a file.
    const adminPdf = await upload(agent.auth, pdf, 'application/pdf', true);
    const reply = await api()
      .post(`/api/v1/admin/support/tickets/${ticketId}/messages`)
      .set(agent.auth)
      .send({
        body: ruText,
        macroId,
        attachments: [{ fileId: adminPdf, name: 'instruction.pdf' }],
      })
      .expect(201);
    expect(reply.body.data.body).toBe(
      `Здравствуйте, Вера! Занимаемся обращением #${ticketId
        .replace(/-/g, '')
        .slice(0, 8)
        .toUpperCase()}.`,
    );

    // The user sees the substituted text and the file.
    const mine = await api()
      .get(`/api/v1/support/tickets/${ticketId}`)
      .set(user.auth)
      .expect(200);
    const last = (
      mine.body.data.messages as {
        author: string;
        body: string;
        attachments: { name: string; url: string }[];
      }[]
    ).filter((m) => m.author === 'support' && m.attachments.length > 0)[0];
    expect(last.body).toContain('Здравствуйте, Вера!');
    expect(last.body).not.toContain('{');
    expect(last.attachments[0].name).toBe('instruction.pdf');
    const download = await fetch(last.attachments[0].url);
    expect(download.status).toBe(200);

    // A stranger gets nothing: not the ticket, not the files.
    const stranger = await client('en', 'Sam');
    await api()
      .get(`/api/v1/support/tickets/${ticketId}`)
      .set(stranger.auth)
      .expect(404);
    await api()
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set(stranger.auth)
      .send({ body: 'hi' })
      .expect(404);
    // …and cannot attach someone else's file to their own ticket.
    await api()
      .post('/api/v1/support/tickets')
      .set(stranger.auth)
      .send({
        subject: 'Steal a file',
        category: 'other',
        body: 'x',
        attachments: [{ fileId: photoId, name: 'a.jpg' }],
      })
      .expect(404);
    // A user token is no admin: the staff view is closed (401).
    await api()
      .get(`/api/v1/admin/support/tickets/${ticketId}`)
      .set(stranger.auth)
      .expect(401);
  });

  it('refuses more files than the place allows and unsafe types', async () => {
    const user = await client('en', null);
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      ids.push(
        await upload(
          user.auth,
          Buffer.from(`%PDF-1.7\n${i}\n%%EOF\n`),
          'application/pdf',
        ),
      );
    }
    await api()
      .post('/api/v1/support/tickets')
      .set(user.auth)
      .send({
        subject: 'Too many',
        category: 'other',
        body: 'files',
        attachments: ids.map((id, i) => ({ fileId: id, name: `f${i}.pdf` })),
      })
      .expect(409);
    // An executable is not a support attachment type.
    await api()
      .post('/api/v1/files/presign')
      .set(user.auth)
      .send({
        purpose: 'support_attachment',
        mime: 'application/zip',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
      })
      .expect(400);
    // First five are fine; a nameless user still gets an English "there".
    const ok = await api()
      .post('/api/v1/support/tickets')
      .set(user.auth)
      .send({
        subject: 'Five files',
        category: 'other',
        body: 'files',
        attachments: ids
          .slice(0, 5)
          .map((id, i) => ({ fileId: id, name: `f${i}.pdf` })),
      })
      .expect(201);
    expect(ok.body.data.messages[0].attachments).toHaveLength(5);
    const reply = await api()
      .post(`/api/v1/admin/support/tickets/${ok.body.data.id}/messages`)
      .set(agent.auth)
      .send({ body: 'Hi {name}!' })
      .expect(201);
    expect(reply.body.data.body).toBe('Hi there!');
  });
});
