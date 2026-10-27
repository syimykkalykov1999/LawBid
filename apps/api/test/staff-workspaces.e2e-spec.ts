import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T2: workspaces in the real API. The owner puts admins into
 * workspaces and names the head (one per workspace, none in finance, 409
 * otherwise); with `staff.workspaces_enabled` on, a section of another
 * workspace is 404 for everybody but the owner; the head hires and grants
 * only inside their workspace. With the switch off the API is as before.
 */
jest.setTimeout(180_000);

describe('Workspaces and the workspace head (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    // Heads left by other suites would make the "one per workspace" cases
    // order dependent.
    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
  });

  afterAll(async () => {
    await setSwitches(false, false);
    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
    await app.close();
  });

  const api = () => request(base);

  async function setKey(key: string, value: boolean) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  async function setSwitches(workspaces: boolean, head: boolean) {
    await setKey('staff.workspaces_enabled', workspaces);
    await setKey('staff.head_enabled', head);
    await redis.del('config:app_config'); // bypass the cache
  }

  async function stepUp(a: AdminSession) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(a.auth)
      .send({ code: totpCode(a.totpSecret, Date.now() + 30_000) })
      .expect(200);
  }

  async function worker(
    role: 'verifier' | 'support' | 'finance',
    permissions: Record<string, string>,
    workspace: 'mass' | 'finance' | 'owner',
  ) {
    const s = await adminSession(base, prisma, role, undefined, permissions);
    await prisma.adminProfile.update({
      where: { user_id: s.userId },
      data: { workspace },
    });
    return s;
  }

  const status = (a: AdminSession, path: string) =>
    api()
      .get(`/api/v1${path}`)
      .set(a.auth)
      .then((r) => r.status);

  it('off (the default): nothing changes — a mass admin with a money toggle still reads money; nobody is a head', async () => {
    await setSwitches(false, false);
    const w = await worker(
      'verifier',
      { money: 'view', verification: 'manage' },
      'mass',
    );
    expect(await status(w, '/admin/billing/overview')).not.toBe(404);
    expect(await status(w, '/admin/verification/requests')).not.toBe(404);
    const me = await api().get('/api/v1/admin/auth/me').set(w.auth).expect(200);
    expect(me.body.data).toMatchObject({
      workspace: 'mass',
      workspaceHead: false,
      workspacesEnabled: false,
    });
  });

  it('on: other workspace = 404 (owner excepted); the worker keeps their own; /me tells the panel', async () => {
    await setSwitches(true, true);
    const mass = await worker(
      'verifier',
      { money: 'view', verification: 'manage' },
      'mass',
    );
    const fin = await worker(
      'finance',
      { money: 'manage', payroll: 'manage', verification: 'view' },
      'finance',
    );
    const owner = await adminSession(base, prisma, 'super_admin');
    expect(await status(mass, '/admin/billing/overview')).toBe(404);
    expect(await status(mass, '/admin/verification/requests')).not.toBe(404);
    expect(await status(fin, '/admin/verification/requests')).toBe(404);
    expect(await status(fin, '/admin/payroll/employees')).not.toBe(404);
    expect(await status(owner, '/admin/billing/overview')).not.toBe(404);
    // the denied attempt is in the audit log
    const rows = await prisma.auditLog.findMany({
      where: { admin_id: mass.userId, action: 'admin.workspace_denied' },
    });
    expect(rows.length).toBeGreaterThan(0);
    const me = await api()
      .get('/api/v1/admin/auth/me')
      .set(mass.auth)
      .expect(200);
    expect(me.body.data).toMatchObject({
      workspace: 'mass',
      workspaceHead: false,
      workspacesEnabled: true,
    });
    const ownMe = await api()
      .get('/api/v1/admin/auth/me')
      .set(owner.auth)
      .expect(200);
    expect(ownMe.body.data).toMatchObject({
      workspace: 'owner',
      workspacesEnabled: true,
    });
  });

  it('owner sets workspace and head; a second head and a finance head are 409; only the owner may', async () => {
    await setSwitches(true, true);
    const owner = await adminSession(base, prisma, 'super_admin');
    const a = await worker('verifier', { verification: 'manage' }, 'mass');
    const b = await worker('support', { support: 'manage' }, 'mass');
    const f = await worker('finance', { payroll: 'manage' }, 'finance');
    await stepUp(owner);

    // setting a head needs the step-up the owner just did; a worker cannot
    await api()
      .patch(`/api/v1/admin/admins/${a.userId}/head`)
      .set(a.auth)
      .send({ head: true })
      .expect(404);

    const first = await api()
      .patch(`/api/v1/admin/admins/${a.userId}/head`)
      .set(owner.auth)
      .send({ head: true })
      .expect(200);
    expect(first.body.data).toMatchObject({
      workspace: 'mass',
      workspaceHead: true,
    });

    const second = await api()
      .patch(`/api/v1/admin/admins/${b.userId}/head`)
      .set(owner.auth)
      .send({ head: true })
      .expect(409);
    expect(second.body.error.code).toBe('ADMIN_WORKSPACE_CONFLICT');

    const fin = await api()
      .patch(`/api/v1/admin/admins/${f.userId}/head`)
      .set(owner.auth)
      .send({ head: true })
      .expect(409);
    expect(fin.body.error.code).toBe('ADMIN_WORKSPACE_CONFLICT');

    // list by workspace
    const list = await api()
      .get('/api/v1/admin/admins?workspace=finance')
      .set(owner.auth)
      .expect(200);
    const ids = (list.body.data as { id: string; workspace: string }[]).map(
      (x) => x.id,
    );
    expect(ids).toContain(f.userId);
    expect(ids).not.toContain(a.userId);

    // moving the head out drops the flag; the seat is free again
    const moved = await api()
      .patch(`/api/v1/admin/admins/${a.userId}/workspace`)
      .set(owner.auth)
      .send({ workspace: 'owner' })
      .expect(200);
    expect(moved.body.data).toMatchObject({
      workspace: 'owner',
      workspaceHead: false,
    });
    await api()
      .patch(`/api/v1/admin/admins/${b.userId}/head`)
      .set(owner.auth)
      .send({ head: true })
      .expect(200);
    await api()
      .patch(`/api/v1/admin/admins/${b.userId}/head`)
      .set(owner.auth)
      .send({ head: false })
      .expect(200);

    // a mass admin with a section the finance workspace lacks cannot move there
    const conflict = await api()
      .patch(`/api/v1/admin/admins/${b.userId}/workspace`)
      .set(owner.auth)
      .send({ workspace: 'finance' })
      .expect(409);
    expect(conflict.body.error.code).toBe('ADMIN_WORKSPACE_CONFLICT');

    // every change left an audit row
    const audit = await prisma.auditLog.findMany({
      where: {
        admin_id: owner.userId,
        action: { in: ['admins.set_head', 'admins.set_workspace'] },
      },
    });
    expect(audit.length).toBeGreaterThanOrEqual(4);
  });

  it('the head: reaches the admins page, hires and grants inside the ceiling, nothing outside, nobody else', async () => {
    await setSwitches(true, true);
    const owner = await adminSession(base, prisma, 'super_admin');
    const head = await worker(
      'support',
      { support: 'manage', verification: 'manage' },
      'mass',
    );
    const mate = await worker('verifier', { verification: 'manage' }, 'mass');
    const fin = await worker('finance', { payroll: 'manage' }, 'finance');
    await stepUp(owner);
    await api()
      .patch(`/api/v1/admin/admins/${head.userId}/head`)
      .set(owner.auth)
      .send({ head: true })
      .expect(200);

    // the head sees only the mass team
    const list = await api()
      .get('/api/v1/admin/admins')
      .set(head.auth)
      .expect(200);
    const ids = (list.body.data as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(mate.userId);
    expect(ids).not.toContain(fin.userId);
    expect(ids).not.toContain(owner.userId);

    await stepUp(head);
    // inside the ceiling: ok
    await api()
      .patch(`/api/v1/admin/admins/${mate.userId}/permissions`)
      .set(head.auth)
      .send({ permissions: { verification: 'manage', moderation: 'view' } })
      .expect(200);
    // outside: refused
    for (const area of ['payroll', 'money', 'exports', 'settings']) {
      await api()
        .patch(`/api/v1/admin/admins/${mate.userId}/permissions`)
        .set(head.auth)
        .send({ permissions: { [area]: 'view' } })
        .expect(403);
    }
    // themselves, the other workspace, the owner: no
    await api()
      .patch(`/api/v1/admin/admins/${head.userId}/permissions`)
      .set(head.auth)
      .send({ permissions: { verification: 'manage' } })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/admins/${fin.userId}/permissions`)
      .set(head.auth)
      .send({ permissions: { support: 'view' } })
      .expect(403);
    await api()
      .patch(`/api/v1/admin/admins/${owner.userId}/permissions`)
      .set(head.auth)
      .send({ permissions: {} })
      .expect(403);
    // the head cannot hand out workspace or head seats, nor change roles
    await api()
      .patch(`/api/v1/admin/admins/${mate.userId}/head`)
      .set(head.auth)
      .send({ head: true })
      .expect(404);
    await api()
      .patch(`/api/v1/admin/admins/${mate.userId}/workspace`)
      .set(head.auth)
      .send({ workspace: 'finance' })
      .expect(404);
    // …and still cannot read the keys or the audit log
    expect(await status(head, '/admin/integrations')).toBe(404);
    expect(await status(head, '/admin/audit-log')).toBe(404);

    // hiring: a new verifier lands in the mass workspace, cut to the ceiling
    const hired = await api()
      .post('/api/v1/admin/admins')
      .set(head.auth)
      .send({
        email: `hired-${Date.now()}@lawbid-e2e.test`,
        role: 'verifier',
        permissions: { verification: 'manage', users: 'view' },
      })
      .expect(201);
    expect(hired.body.data).toMatchObject({
      workspace: 'mass',
      workspaceHead: false,
    });
    await api()
      .post('/api/v1/admin/admins')
      .set(head.auth)
      .send({
        email: `hired2-${Date.now()}@lawbid-e2e.test`,
        role: 'verifier',
        permissions: { payroll: 'manage' },
      })
      .expect(403);
    await api()
      .post('/api/v1/admin/admins')
      .set(head.auth)
      .send({ email: `hired3-${Date.now()}@lawbid-e2e.test`, role: 'finance' })
      .expect(403);

    // with the head role off the admins page is gone again
    await setSwitches(true, false);
    expect(await status(head, '/admin/admins')).toBe(404);
  });
});
