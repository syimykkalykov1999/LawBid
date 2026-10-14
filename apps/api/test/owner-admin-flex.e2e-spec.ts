import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-04 ("везде удобства гибкими сделай"): users list filters by
 * state and registration dates; bulk suspend / restore / end sessions for
 * users and hide / close / archive / restore for cases, one reason each.
 */
jest.setTimeout(120_000);

describe('Admin flexibility: user filters + bulk users / cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const REASON = 'Support request batch';

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
    for (const [code, name] of [
      ['NY', 'New York'],
      ['WY', 'Wyoming'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  async function client(first: string, state: string) {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: first,
        last_name: 'Flex',
        status: 'active',
      },
    });
    await prisma.clientProfile.create({
      data: { user_id: u.id, state_code: state, preferred_languages: ['en'] },
    });
    return u;
  }

  it('filters users by state and dates; bulk suspends, restores and ends sessions', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const since = new Date(Date.now() - 60_000).toISOString();
    const a = await client('Wy1', 'WY');
    const b = await client('Wy2', 'WY');
    const ny = await client('Ny1', 'NY');

    const list = await api()
      .get('/api/v1/admin/users')
      .query({ stateCode: 'wy', from: since, limit: 50 })
      .set(admin.auth)
      .expect(200);
    const ids = (list.body.data as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(ids).not.toContain(ny.id);

    const future = await api()
      .get('/api/v1/admin/users')
      .query({
        stateCode: 'WY',
        from: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .set(admin.auth)
      .expect(200);
    expect(future.body.data).toHaveLength(0);

    const suspend = await api()
      .post('/api/v1/admin/users/bulk')
      .set(admin.auth)
      .send({ action: 'suspend', ids: [a.id, b.id, a.id], reason: REASON })
      .expect(200);
    expect([...(suspend.body.data.done as string[])].sort()).toEqual(
      [a.id, b.id].sort(),
    );
    const statuses = await prisma.user.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { status: true },
    });
    expect(statuses.every((s) => s.status === 'suspended')).toBe(true);

    // Already suspended: skipped, not an error.
    const again = await api()
      .post('/api/v1/admin/users/bulk')
      .set(admin.auth)
      .send({ action: 'suspend', ids: [a.id], reason: REASON })
      .expect(200);
    expect(again.body.data.skipped).toEqual([
      { id: a.id, reason: 'invalid_state' },
    ]);

    await api()
      .post('/api/v1/admin/users/bulk')
      .set(admin.auth)
      .send({ action: 'restore', ids: [a.id, b.id], reason: REASON })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).status,
    ).toBe('active');

    const logout = await api()
      .post('/api/v1/admin/users/bulk')
      .set(admin.auth)
      .send({ action: 'logout', ids: [a.id, ny.id], reason: REASON })
      .expect(200);
    expect(logout.body.data.done).toHaveLength(2);

    // Rights: view-only users admins can't act in bulk; an over-long reason is rejected (a reason is optional).
    const viewer = await adminSession(base, prisma, 'moderator', undefined, {
      users: 'view',
    });
    await api()
      .post('/api/v1/admin/users/bulk')
      .set(viewer.auth)
      .send({ action: 'suspend', ids: [a.id], reason: REASON })
      .expect(404);
    await api()
      .post('/api/v1/admin/users/bulk')
      .set(admin.auth)
      .send({ action: 'suspend', ids: [a.id], reason: 'x'.repeat(501) })
      .expect(400);
  });

  it('bulk closes, archives and restores cases', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const owner = await client('CaseOwner', 'NY');
    const area = await prisma.practiceArea.findFirstOrThrow({
      select: { id: true },
    });
    const mk = async (title: string) => {
      const c = await prisma.case.create({
        data: {
          client_id: owner.id,
          title,
          description: 'Bulk case test',
          practice_area_id: area.id,
          primary_state_code: 'NY',
          budget_mode: 'clarify_later',
        },
      });
      await prisma.caseState.create({
        data: { case_id: c.id, state_code: 'NY', is_primary: true },
      });
      return c.id;
    };
    const c1 = await mk('Bulk case one');
    const c2 = await mk('Bulk case two');

    const archive = await api()
      .post('/api/v1/admin/cases/bulk')
      .set(admin.auth)
      .send({ action: 'archive', ids: [c1, c2], reason: REASON })
      .expect(200);
    expect(archive.body.data.done).toHaveLength(2);

    // Close needs an open case: archived ones are skipped.
    const close = await api()
      .post('/api/v1/admin/cases/bulk')
      .set(admin.auth)
      .send({ action: 'close', ids: [c1], reason: REASON })
      .expect(200);
    expect(close.body.data.skipped).toEqual([
      { id: c1, reason: 'invalid_state' },
    ]);

    await api()
      .post('/api/v1/admin/cases/bulk')
      .set(admin.auth)
      .send({ action: 'restore', ids: [c1, c2], reason: REASON })
      .expect(200);
    const rows = await prisma.case.findMany({
      where: { id: { in: [c1, c2] } },
      select: { status: true },
    });
    expect(rows.every((r) => r.status === 'open')).toBe(true);
  });
});
