import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-05: the document templates library — the admin uploads a
 * PDF / Word file, describes and publishes it; in the app it is found by
 * search and filters, downloaded (counted once per user a day) or copied
 * in one tap into the user's own chat / case attachment. Lawyers-only
 * templates stay hidden from clients; drafts and deleted ones from all.
 */
jest.setTimeout(60_000);

type Json = Record<string, any>;

describe('Document templates (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let admin: AdminSession;

  const PDF = Buffer.from(
    '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'x'.repeat(200),
  );

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
    admin = await adminSession(baseUrl, prisma, 'super_admin');
  });

  afterAll(async () => {
    await prisma.featureFlag.updateMany({
      where: { key: 'document_templates' },
      data: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'attorney' | 'client') {
    const u = await prisma.user.create({ data: { role } });
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  /** Admin upload through the real pipeline (presign → MinIO → confirm). */
  async function upload(data = PDF, mime = 'application/pdf') {
    const sha256 = createHash('sha256').update(data).digest('hex');
    const p = await api()
      .post('/api/v1/admin/document-templates/uploads')
      .set(admin.auth)
      .send({ mime, sizeBytes: data.length, sha256 })
      .expect(201);
    const { fileId, upload: u } = p.body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(u.fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(data)], { type: mime }));
    const s3 = await fetch(u.url, { method: 'POST', body: form });
    expect(s3.status).toBeLessThan(300);
    await api()
      .post(`/api/v1/admin/document-templates/uploads/${fileId}/confirm`)
      .set(admin.auth)
      .expect(200);
    // The antivirus worker is not running here.
    await prisma.file.update({
      where: { id: fileId },
      data: { scan_status: 'clean' },
    });
    return fileId;
  }

  async function template(body: Json) {
    const fileId = await upload();
    const r = await api()
      .post('/api/v1/admin/document-templates')
      .set(admin.auth)
      .send({ fileId, published: true, ...body });
    expect(r.status).toBe(201);
    return r.body.data as Json;
  }

  const tag = randomUUID().slice(0, 8);

  it('admin creates, edits and publishes; the app lists by audience and filters', async () => {
    const pa = await prisma.practiceArea.findFirst({
      where: { parent_id: { not: null } },
    });
    const lease = await template({
      title: `Lease ${tag}`,
      description: 'Residential lease',
      state: 'il',
      practiceAreaId: pa?.id ?? null,
    });
    expect(lease).toMatchObject({
      title: `Lease ${tag}`,
      fileName: `Lease ${tag}.pdf`,
      state: 'IL',
      audience: 'everyone',
      published: true,
      mime: 'application/pdf',
      sizeBytes: PDF.length,
    });
    const retainer = await template({
      title: `Retainer ${tag}`,
      audience: 'lawyers',
    });
    const draft = await template({ title: `Draft ${tag}`, published: false });

    const client = await user('client');
    const lawyer = await user('attorney');
    const list = async (auth: Record<string, string>, qs = '') =>
      (
        await api()
          .get(`/api/v1/document-templates?q=${tag}${qs}`)
          .set(auth)
          .expect(200)
      ).body.data as Json[];

    expect((await list(client.auth)).map((t) => t.id as string)).toEqual([
      lease.id,
    ]);
    expect((await list(lawyer.auth)).map((t) => t.id as string).sort()).toEqual(
      [lease.id, retainer.id].sort(),
    );
    // State filter keeps every-state templates; another state drops IL.
    expect((await list(lawyer.auth, '&state=IL')).length).toBe(2);
    expect(
      (await list(lawyer.auth, '&state=NY')).map((t) => t.id as string),
    ).toEqual([retainer.id]);
    if (pa) {
      expect(
        (await list(lawyer.auth, `&practiceAreaId=${pa.id}`)).map(
          (t) => t.id as string,
        ),
      ).toEqual([lease.id]);
    }
    // A client can't open a lawyers-only one; nobody opens a draft.
    await api()
      .get(`/api/v1/document-templates/${retainer.id as string}`)
      .set(client.auth)
      .expect(404);
    await api()
      .get(`/api/v1/document-templates/${draft.id as string}`)
      .set(lawyer.auth)
      .expect(404);

    // Edit: title, unpublish → hidden.
    const edited = await api()
      .patch(`/api/v1/admin/document-templates/${lease.id as string}`)
      .set(admin.auth)
      .send({ title: `Lease 2 ${tag}`, state: null, published: false })
      .expect(200);
    expect(edited.body.data).toMatchObject({ state: null, published: false });
    expect(await list(client.auth)).toEqual([]);
    const audit = await prisma.auditLog.findMany({
      where: { target_id: lease.id as string },
      select: { action: true },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'admin.document_template.create',
      'admin.document_template.update',
    ]);
  });

  it('download gives a signed link and counts once per user a day; copy makes a clean own file', async () => {
    const t = await template({ title: `Contract ${tag}` });
    const client = await user('client');
    const d1 = await api()
      .post(`/api/v1/document-templates/${t.id as string}/download`)
      .set(client.auth)
      .expect(200);
    expect(d1.body.data).toMatchObject({
      fileName: `Contract ${tag}.pdf`,
      mime: 'application/pdf',
    });
    expect(decodeURIComponent(d1.body.data.url as string)).toContain(
      `filename="Contract ${tag}.pdf"`,
    );
    const bytes = Buffer.from(
      await (await fetch(d1.body.data.url as string)).arrayBuffer(),
    );
    expect(bytes.equals(PDF)).toBe(true);
    await api()
      .post(`/api/v1/document-templates/${t.id as string}/download`)
      .set(client.auth)
      .expect(200);
    const other = await user('attorney');
    const copy = await api()
      .post(`/api/v1/document-templates/${t.id as string}/copy`)
      .set(other.auth)
      .send({ target: 'chat_attachment' })
      .expect(201);
    expect(copy.body.data).toMatchObject({
      purpose: 'chat_attachment',
      scanStatus: 'clean',
    });
    const row = await prisma.file.findUniqueOrThrow({
      where: { id: copy.body.data.id as string },
    });
    expect(row.owner_user_id).toBe(other.id);
    const counted = await prisma.documentTemplate.findUniqueOrThrow({
      where: { id: t.id as string },
    });
    expect(counted.download_count).toBe(2);

    await api()
      .post(`/api/v1/document-templates/${t.id as string}/copy`)
      .set(other.auth)
      .send({ target: 'avatar' })
      .expect(400);
  });

  it('bulk unpublish / delete, a used file is refused, the flag turns the section off', async () => {
    const a = await template({ title: `Bulk A ${tag}` });
    const b = await template({ title: `Bulk B ${tag}` });
    const r = await api()
      .post('/api/v1/admin/document-templates/bulk')
      .set(admin.auth)
      .send({ ids: [a.id, b.id, randomUUID()], action: 'unpublish' })
      .expect(200);
    expect(r.body.data.done).toHaveLength(2);
    expect(r.body.data.skipped[0].reason).toBe('not_found');
    const again = await api()
      .post('/api/v1/admin/document-templates/bulk')
      .set(admin.auth)
      .send({ ids: [a.id], action: 'unpublish' })
      .expect(200);
    expect(again.body.data.skipped[0].reason).toBe('invalid_state');
    await api()
      .post('/api/v1/admin/document-templates/bulk')
      .set(admin.auth)
      .send({ ids: [a.id], action: 'delete' })
      .expect(200);
    await api()
      .get(`/api/v1/admin/document-templates/${a.id as string}`)
      .set(admin.auth)
      .expect(404);

    await api()
      .post('/api/v1/admin/document-templates')
      .set(admin.auth)
      .send({ fileId: b.fileId, title: 'Same file' })
      .expect(409);

    const client = await user('client');
    await prisma.featureFlag.upsert({
      where: { key: 'document_templates' },
      create: { key: 'document_templates', enabled: false },
      update: { enabled: false },
    });
    await app.get(FeatureFlagsService).invalidate();
    const off = await api()
      .get('/api/v1/document-templates')
      .set(client.auth)
      .expect(403);
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
    await prisma.featureFlag.update({
      where: { key: 'document_templates' },
      data: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
  });
});
