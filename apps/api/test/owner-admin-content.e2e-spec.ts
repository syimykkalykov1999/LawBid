import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-09-30: admin sections — overview, posts/comments removal
 * (author notified), qualifications, broadcasts, CSV, RBAC.
 */
jest.setTimeout(120_000);

describe('Admin content (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  it('overview, content removal, practice areas, broadcast, CSV', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const author = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Ann',
        last_name: 'Author',
        status: 'active',
      },
    });
    const pa = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    const post = await prisma.post.create({
      data: {
        author_id: author.id,
        title: 'Spam title',
        body: 'Buy now',
        practice_area_id: pa.id,
      },
    });

    const ov = await api()
      .get('/api/v1/admin/overview')
      .set(admin.auth)
      .expect(200);
    expect(ov.body.data).toHaveProperty('assistants');

    const list = await api()
      .get('/api/v1/admin/content/posts?q=Spam')
      .set(admin.auth)
      .expect(200);
    expect((list.body.data as { id: string }[]).map((p) => p.id)).toContain(
      post.id,
    );
    await api()
      .post(`/api/v1/admin/content/posts/${post.id}/remove`)
      .set(admin.auth)
      .send({ reason: 'Spam' })
      .expect(204);
    // Soft-deleted rows are hidden by the Prisma extension.
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect(
      await prisma.notification.count({
        where: { user_id: author.id, type: 'moderation_notice' },
      }),
    ).toBe(1);

    const areas = await api()
      .get('/api/v1/admin/practice-areas')
      .set(admin.auth)
      .expect(200);
    const fam = (areas.body.data as { id: string; code: string }[]).find(
      (a) => a.code === 'family_law',
    )!;
    const upd = await api()
      .patch(`/api/v1/admin/practice-areas/${fam.id}`)
      .set(admin.auth)
      .send({ nameEn: 'Family Law & Custody' })
      .expect(200);
    expect(
      (upd.body.data as { code: string; nameEn: string }[]).find(
        (a) => a.code === 'family_law',
      )!.nameEn,
    ).toBe('Family Law & Custody');

    const b = await api()
      .post('/api/v1/admin/broadcasts')
      .set(admin.auth)
      .send({
        title: 'Hello',
        body: 'Welcome to LawBid',
        audience: 'attorneys',
      })
      .expect(201);
    expect(b.body.data.recipients).toBeGreaterThan(0);
    // Audit 2026-10-02: the fan-out runs in the background (queue).
    let delivered = 0;
    for (let i = 0; i < 50 && delivered === 0; i++) {
      delivered = await prisma.notification.count({
        where: { user_id: author.id, type: 'admin_broadcast' },
      });
      if (delivered === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(delivered).toBe(1);

    // Audit 2026-10-02: the users CSV (contacts) needs a justification.
    await api().get('/api/v1/admin/export/users').set(admin.auth).expect(400);
    const csv = await api()
      .get('/api/v1/admin/export/users')
      .set(admin.auth)
      .set(
        'X-Justification',
        encodeURIComponent('Ежемесячный отчёт для юриста'),
      )
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { action: 'admin.export.users', justification: { not: null } },
      }),
    ).toBeGreaterThan(0);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toBe(
      'id,role,status,first_name,last_name,phone,email,created_at',
    );
  });

  it('RBAC: a verifier cannot remove content or broadcast', async () => {
    const verifier = await adminSession(base, prisma, 'verifier');
    await api()
      .get('/api/v1/admin/content/posts')
      .set(verifier.auth)
      .expect(403);
    await api()
      .post('/api/v1/admin/broadcasts')
      .set(verifier.auth)
      .send({ title: 'x', body: 'y', audience: 'all' })
      .expect(403);
    // The overview belongs to the content area, which a verifier lacks.
    await api().get('/api/v1/admin/overview').set(verifier.auth).expect(403);
  });
});
