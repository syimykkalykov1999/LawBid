import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StaffRetaliationExpireJob } from '../src/jobs/handlers/staff-retaliation-expire.job';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import {
  RETALIATION_PORT,
  type RetaliationPort,
} from '../src/modules/staff-core/retaliation.port';
import { adminSession, adminStepUp } from './support/admin-login';

/**
 * Staff package T6 (plan B3): complaints against a head, the retaliation
 * guard and the owner's inbox. A worker files (anonymously) → the head gets
 * 404 on every appeals route → the owner lists, reveals, decides; the head
 * fires the author inside 90 days → red flag + 14-day hold → the owner
 * reverses; the nightly job ends an expired hold.
 */
jest.setTimeout(180_000);

describe('Staff appeals + retaliation guard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let port: RetaliationPort;
  let job: StaffRetaliationExpireJob;

  const api = () => request(base);
  const DAY = 86_400_000;

  async function setting(key: string, value: boolean | number) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await redis.del('config:app_config'); // bypass the cache
  }

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
    const addr = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    port = app.get<RetaliationPort>(RETALIATION_PORT);
    job = app.get(StaffRetaliationExpireJob);
    // One head per workspace: clear heads other suites left.
    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
  });

  afterAll(async () => {
    await setting('staff.appeals_enabled', false);
    await app.close();
  });

  it('end to end', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const head = await adminSession(base, prisma, 'support');
    await prisma.adminProfile.update({
      where: { user_id: head.userId },
      data: { is_workspace_head: true },
    });
    const worker = await adminSession(base, prisma, 'support');
    const worker2 = await adminSession(base, prisma, 'moderator');
    const deputy = await adminSession(base, prisma, 'support', undefined, {
      support: 'manage',
      manage_admins: true,
    });
    await prisma.user.update({
      where: { id: worker.userId },
      data: { first_name: 'Anna', last_name: 'Secret' },
    });

    // ---- switch off: the feature does not exist --------------------------
    await api()
      .post('/api/v1/admin/workspace/appeals')
      .set(worker.auth)
      .send({ text: 'He shouts at everyone every day.' })
      .expect(404);
    await api().get('/api/v1/admin/appeals').set(owner.auth).expect(404);

    // ---- a worker files an anonymous complaint ----------------------------
    await setting('staff.appeals_enabled', true);
    const filed = await api()
      .post('/api/v1/admin/workspace/appeals')
      .set(worker.auth)
      .send({
        kind: 'pressure',
        text: 'He shouts at everyone every day.',
        anonymous: true,
      })
      .expect(201);
    const appealId = (filed.body as { data: { id: string } }).data.id;
    const number = (filed.body as { data: { number: number } }).data.number;
    const stored = await prisma.adminAppeal.findUniqueOrThrow({
      where: { id: appealId },
    });
    expect(stored.author_id).toBe(worker.userId); // kept for the guard
    expect(stored.head_admin_id).toBe(head.userId);
    // The filing of an anonymous author left no audit row naming them.
    expect(
      await prisma.auditLog.count({
        where: { admin_id: worker.userId, action: { contains: 'appeals' } },
      }),
    ).toBe(0);

    // The author sees the status of their own complaint, no verdict.
    const mine = await api()
      .get('/api/v1/admin/workspace/appeals/mine')
      .set(worker.auth)
      .expect(200);
    expect(
      (mine.body as { data: Array<{ status: string }> }).data[0].status,
    ).toBe('received');
    // Another worker sees none of it.
    const other = await api()
      .get('/api/v1/admin/workspace/appeals/mine')
      .set(worker2.auth)
      .expect(200);
    expect((other.body as { data: unknown[] }).data).toEqual([]);

    // ---- the head (and the deputy) get 404 on every appeals route --------
    for (const who of [head, deputy, worker]) {
      for (const [method, path] of [
        ['get', '/api/v1/admin/appeals'],
        ['get', `/api/v1/admin/appeals/${appealId}`],
        ['get', '/api/v1/admin/appeals/flags'],
        ['get', '/api/v1/admin/appeals/signals'],
        ['post', `/api/v1/admin/appeals/${appealId}/decide`],
        ['post', `/api/v1/admin/appeals/${appealId}/reveal`],
        ['post', '/api/v1/admin/appeals/flags/' + appealId + '/reverse'],
        ['delete', `/api/v1/admin/appeals/${appealId}`],
      ] as const) {
        await api()
          [method](path)
          .set(who.auth)
          .send(method === 'post' ? { decision: 'nothing' } : undefined)
          .expect(404);
      }
    }
    // The head cannot file against themselves nor read "mine".
    await api()
      .post('/api/v1/admin/workspace/appeals')
      .set(head.auth)
      .send({ text: 'a complaint about myself' })
      .expect(404);
    await api()
      .get('/api/v1/admin/workspace/appeals/mine')
      .set(head.auth)
      .expect(404);

    // ---- the owner's inbox: «автор №N», no id, no name --------------------
    const list = await api()
      .get('/api/v1/admin/appeals')
      .query({ state: 'open' })
      .set(owner.auth)
      .expect(200);
    const mineItem = (
      list.body as {
        data: Array<{ id: string; author: Record<string, unknown> }>;
      }
    ).data.find((i) => i.id === appealId);
    expect(mineItem?.author).toEqual({
      adminId: null,
      label: `автор обжалования №${number}`,
      anonymous: true,
    });
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain(worker.userId);
    expect(raw).not.toContain('Secret');

    const detail = await api()
      .get(`/api/v1/admin/appeals/${appealId}`)
      .set(owner.auth)
      .expect(200);
    expect((detail.body as { data: { status: string } }).data.status).toBe(
      'seen',
    );
    expect(JSON.stringify(detail.body)).not.toContain(worker.userId);
    const seen = await api()
      .get('/api/v1/admin/workspace/appeals/mine')
      .set(worker.auth)
      .expect(200);
    expect(
      (seen.body as { data: Array<{ status: string }> }).data[0].status,
    ).toBe('in_review');

    // ---- the head fires the author within 90 days -------------------------
    const verdict = await port.check(worker.userId, head.userId, 'offboard');
    expect(verdict).toEqual({ flagged: true });
    const state = await prisma.staffMemberState.findUniqueOrThrow({
      where: { admin_id: worker.userId },
    });
    expect(state.state).toBe('hold_owner');
    const holdLeft = (state.state_until as Date).getTime() - Date.now();
    expect(holdLeft).toBeGreaterThan(13.9 * DAY);
    expect(holdLeft).toBeLessThan(14.1 * DAY);

    const flags = await api()
      .get('/api/v1/admin/appeals/flags')
      .query({ state: 'open' })
      .set(owner.auth)
      .expect(200);
    const flag = (
      flags.body as {
        data: {
          items: Array<{
            id: string;
            subject: Record<string, unknown>;
            holdActive: boolean;
          }>;
        };
      }
    ).data.items.find(
      (f) => f.subject.label === `автор обжалования №${number}`,
    );
    expect(flag).toBeDefined();
    expect(flag?.subject.adminId).toBeNull();
    expect(flag?.holdActive).toBe(true);
    const red = await api()
      .get('/api/v1/admin/appeals')
      .set(owner.auth)
      .expect(200);
    expect(
      (red.body as { data: Array<{ id: string; redFlag: boolean }> }).data.find(
        (i) => i.id === appealId,
      )?.redFlag,
    ).toBe(true);
    // No block, no second approver: the signals include the missing warning.
    const signals = await api()
      .get('/api/v1/admin/appeals/signals')
      .set(owner.auth)
      .expect(200);
    expect(
      (
        signals.body as { data: { items: Array<{ code: string }> } }
      ).data.items.map((s) => s.code),
    ).toContain('removal_without_warning');
    expect(JSON.stringify(signals.body)).not.toContain('Secret');

    // ---- the owner reverses (2FA first) ------------------------------------
    await api()
      .post(`/api/v1/admin/appeals/flags/${flag?.id}/reverse`)
      .set(owner.auth)
      .send({})
      .expect(403);
    await adminStepUp(base, owner);
    const reversed = await api()
      .post(`/api/v1/admin/appeals/flags/${flag?.id}/reverse`)
      .set(owner.auth)
      .send({ note: 'not justified' })
      .expect(200);
    expect(reversed.body).toMatchObject({
      data: { state: 'cleared', reinstated: true },
    });
    expect(
      (
        await prisma.staffMemberState.findUniqueOrThrow({
          where: { admin_id: worker.userId },
        })
      ).state,
    ).toBe('active');
    expect(
      await prisma.staffAction.count({
        where: { admin_id: worker.userId, kind: 'reinstate', source: 'owner' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          admin_id: owner.userId,
          action: 'admin.appeals.retaliation_reverse',
        },
      }),
    ).toBe(1);

    // ---- the job: a hold that ran out ---------------------------------------
    expect(await port.check(worker.userId, head.userId, 'replace')).toEqual({
      flagged: true,
    });
    const second = await prisma.staffRetaliationFlag.findFirstOrThrow({
      where: { subject_admin_id: worker.userId, state: 'open' },
    });
    await prisma.staffRetaliationFlag.update({
      where: { id: second.id },
      data: { hold_until: new Date(Date.now() - 60_000) },
    });
    const ran = await job.run();
    expect(ran).toMatchObject({ holdsEnded: 1 });
    expect(
      (
        await prisma.staffMemberState.findUniqueOrThrow({
          where: { admin_id: worker.userId },
        })
      ).state,
    ).toBe('offboarded');
    const decide = await api()
      .get('/api/v1/admin/appeals/signals')
      .set(owner.auth)
      .expect(200);
    const asks = (
      decide.body as {
        data: { items: Array<{ code: string; subject: { name: string } }> };
      }
    ).data.items.filter((s) => s.code === 'retaliation_decide');
    expect(asks).toHaveLength(1);
    expect(JSON.stringify(decide.body)).not.toContain('Secret');
    // A second run changes nothing.
    expect(await job.run()).toMatchObject({ holdsEnded: 0 });

    // ---- reveal: step-up, own audit row, daily cap --------------------------
    await setting('staff.reveal_per_day', 1);
    const revealed = await api()
      .post(`/api/v1/admin/appeals/${appealId}/reveal`)
      .set(owner.auth)
      .expect(200);
    expect(revealed.body).toMatchObject({
      data: {
        adminId: worker.userId,
        name: 'Anna Secret',
        revealsLeftToday: 0,
      },
    });
    const audit = await prisma.auditLog.findMany({
      where: { admin_id: owner.userId, action: 'admin.appeals.reveal' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].target_id).toBe(appealId);
    expect(JSON.stringify(audit[0])).not.toContain(worker.userId);
    expect(
      (await prisma.adminAppeal.findUniqueOrThrow({ where: { id: appealId } }))
        .reveal_log,
    ).toHaveLength(1);
    await api()
      .post(`/api/v1/admin/appeals/${appealId}/reveal`)
      .set(owner.auth)
      .expect(429);

    // ---- decide ---------------------------------------------------------------
    const decided = await api()
      .post(`/api/v1/admin/appeals/${appealId}/decide`)
      .set(owner.auth)
      .send({ decision: 'fire_head', note: 'confirmed' })
      .expect(200);
    expect(decided.body).toMatchObject({
      data: {
        status: 'resolved',
        decision: 'fire_head',
        followUp: { call: 'POST admin/admins/{id}/disable', applied: false },
      },
    });
    await api()
      .post(`/api/v1/admin/appeals/${appealId}/decide`)
      .set(owner.auth)
      .send({ decision: 'nothing' })
      .expect(400);
    const done = await api()
      .get('/api/v1/admin/workspace/appeals/mine')
      .set(worker.auth)
      .expect(200);
    expect(
      (done.body as { data: Array<{ status: string }> }).data[0].status,
    ).toBe('decided');
    expect(JSON.stringify(done.body)).not.toContain('fire_head');
    const decidedList = await api()
      .get('/api/v1/admin/appeals')
      .query({ state: 'decided' })
      .set(owner.auth)
      .expect(200);
    expect(
      (decidedList.body as { data: Array<{ id: string }> }).data.map(
        (i) => i.id,
      ),
    ).toContain(appealId);
    // Nothing deleted the appeal.
    expect(await prisma.adminAppeal.count({ where: { id: appealId } })).toBe(1);
  });
});
