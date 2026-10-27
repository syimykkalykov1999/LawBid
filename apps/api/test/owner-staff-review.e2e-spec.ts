import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { StaffSamplingService } from '../src/modules/staff-rating/staff-sampling.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T9 (re-check loop): leased samples (two reviewers never get
 * the same one), the verdict feeding the rating signal, golden tasks,
 * reviewer calibration and the owner / head numbers, on a real PostgreSQL
 * and Redis. A plain worker and every request with the switches off answer
 * 404.
 */
jest.setTimeout(180_000);

const OLD = new Date('2020-01-01T00:00:00Z'); // our samples go first in the queue

describe('Staff re-check loop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sampling: StaffSamplingService;
  let base = '';
  let owner: AdminSession;
  let head: AdminSession;
  let senior: AdminSession;
  let senior2: AdminSession;
  let worker: AdminSession; // the one whose decisions are checked
  let worker2: AdminSession; // gets golden tasks
  let plain: AdminSession; // a worker who may not re-check
  let stored: Record<string, unknown> = {};
  const api = () => request(base);
  const R = '/api/v1/admin/workspace/review';
  const ON = {
    'staff.rating_enabled': true,
    'staff.sampling_enabled': true,
    'staff.lease_enabled': true,
    'staff.golden_enabled': true,
  };
  const data = (r: { body: unknown }) =>
    (r.body as { data: Record<string, any> }).data;
  const all = () => [owner, head, senior, senior2, worker, worker2, plain];
  const ids = () => all().map((a) => a.userId);
  const post = (a: AdminSession, path: string, body: object = {}) =>
    api().post(`${R}${path}`).set(a.auth).send(body);
  const get = (a: AdminSession, path: string) =>
    api().get(`${R}${path}`).set(a.auth);

  async function seed(n: number, kind = 'support_ticket') {
    const out: Array<{ id: string; item: string }> = [];
    for (let i = 0; i < n; i++) {
      const item = randomUUID();
      const s = await prisma.staffReviewSample.create({
        data: {
          decision_kind: kind,
          item_id: item,
          decided_by: worker.userId,
          stage: 'newcomer',
          created_at: new Date(OLD.getTime() + i),
          golden_answer: { outcome: 'resolve' },
        },
      });
      out.push({ id: s.id, item });
    }
    return out;
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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    sampling = app.get(StaffSamplingService);
    const real = app.get(AppSettingsService);
    jest.spyOn(real, 'all').mockImplementation(() => Promise.resolve(stored));
    const realBool = real.boolean.bind(real);
    jest
      .spyOn(real, 'boolean')
      .mockImplementation((k) =>
        String(k).startsWith('staff.')
          ? Promise.resolve(stored[k] === true)
          : realBool(k),
      );

    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
    const sup = { dashboard: 'view', support: 'manage' };
    owner = await adminSession(base, prisma, 'super_admin');
    head = await adminSession(base, prisma, 'support', undefined, sup);
    senior = await adminSession(base, prisma, 'support', undefined, sup);
    senior2 = await adminSession(base, prisma, 'support', undefined, sup);
    worker = await adminSession(base, prisma, 'support', undefined, sup);
    worker2 = await adminSession(base, prisma, 'support', undefined, sup);
    plain = await adminSession(base, prisma, 'support', undefined, sup);
    await prisma.adminProfile.update({
      where: { user_id: head.userId },
      data: { workspace: 'mass', is_workspace_head: true },
    });
    for (const s of [senior, senior2]) {
      await prisma.staffMemberState.create({
        data: { admin_id: s.userId, state: 'active', trust_tier: 3 },
      });
    }
  });

  afterEach(async () => {
    await prisma.workLease.deleteMany({
      where: { kind: 'review_sample' },
    });
    await prisma.staffQualitySignal.deleteMany({
      where: { admin_id: { in: ids() } },
    });
    await prisma.staffReviewSample.deleteMany({
      where: { decided_by: { in: ids() } },
    });
  });

  afterAll(async () => {
    const authored = { in: ids() };
    await prisma.staffQualitySignal.deleteMany({
      where: { admin_id: authored },
    });
    await prisma.staffReviewSample.deleteMany({
      where: { OR: [{ decided_by: authored }, { reviewer_id: authored }] },
    });
    await prisma.staffRatingSnapshot.deleteMany({
      where: { admin_id: authored },
    });
    await prisma.workLeaseEvent.deleteMany({ where: { admin_id: authored } });
    await prisma.staffMemberState.deleteMany({ where: { admin_id: authored } });
    await prisma.adminProfile.update({
      where: { user_id: head.userId },
      data: { is_workspace_head: false },
    });
    await app.close();
  });

  beforeEach(async () => {
    stored = { ...ON };
    // Suites run one after another: only our samples wait in the queue.
    await prisma.staffReviewSample.deleteMany({
      where: { status: 'pending', decided_by: { notIn: ids() } },
    });
  });

  it('off (rating or sampling): every review route answers 404, the owner too', async () => {
    for (const off of [
      {},
      { 'staff.rating_enabled': true, 'staff.lease_enabled': true },
      { 'staff.sampling_enabled': true, 'staff.lease_enabled': true },
    ]) {
      stored = off;
      for (const a of [owner, head, senior]) {
        await get(a, '/me').expect(404);
        await post(a, '/next').expect(404);
        await get(a, '/stats').expect(404);
      }
    }
  });

  it('a plain worker gets 404 on every review route; a senior may re-check but not read the numbers', async () => {
    await get(plain, '/me').expect(404);
    await post(plain, '/next').expect(404);
    await get(plain, '/current').expect(404);
    await post(plain, `/${randomUUID()}/verdict`, {
      verdict: 'confirmed',
    }).expect(404);
    await get(plain, '/stats').expect(404);
    await get(plain, '/team').expect(404);

    expect(data(await get(senior, '/me').expect(200))).toEqual({
      level: 'senior',
      canManage: false,
    });
    expect(data(await get(head, '/me').expect(200))).toEqual({
      level: 'head',
      canManage: true,
    });
    expect(data(await get(owner, '/me').expect(200)).level).toBe('owner');
    await get(senior, '/stats').expect(404);
    await get(senior, '/team').expect(404);
    await get(senior, '/golden').expect(404);
    await post(senior, '/golden', { sampleId: randomUUID() }).expect(404);
  });

  it('two reviewers at once get two different samples; nobody sees who decided (only the owner)', async () => {
    const s = await seed(3);
    const [a, b] = await Promise.all([
      post(head, '/next'),
      post(senior, '/next'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const sa = data(a).sample;
    const sb = data(b).sample;
    expect(data(a).status).toBe('leased');
    expect(data(b).status).toBe('leased');
    expect(sa.id).not.toBe(sb.id);
    expect([sa.id, sb.id].every((id) => s.some((x) => x.id === id))).toBe(true);
    expect(sa.worker).toBeNull();
    expect(JSON.stringify(a.body)).not.toContain(worker.userId);
    expect(sa.outcome).toBe('resolve');

    // a reload shows the same sample, and «next» again gives the same one back
    expect(data(await get(head, '/current')).sample.id).toBe(sa.id);
    expect(data(await post(head, '/next')).sample.id).toBe(sa.id);

    // the owner takes the third and learns who decided
    const c = data(await post(owner, '/next').expect(200)).sample;
    expect(c.worker).toEqual({
      adminId: worker.userId,
      name: expect.any(String),
    });
    // one sample, one holder
    const held = await prisma.workLease.findMany({
      where: { kind: 'review_sample', admin_id: { not: null } },
    });
    expect(new Set(held.map((h) => h.item_id)).size).toBe(held.length);
  });

  it('a verdict feeds the rating signal, writes an audit row and frees the lease', async () => {
    const [x, y] = await seed(2);
    const first = data(await post(head, '/next').expect(200)).sample;
    expect(first.id).toBe(x.id);
    const res = await post(head, `/${x.id}/verdict`, {
      verdict: 'overturned',
      reasons: ['wrong_outcome'],
    }).expect(200);
    expect(data(res)).toEqual({ ok: true, result: 'done' });
    const row = await prisma.staffReviewSample.findUniqueOrThrow({
      where: { id: x.id },
    });
    expect(row).toMatchObject({
      status: 'done',
      verdict: 'different',
      reviewer_id: head.userId,
    });
    const sig = await prisma.staffQualitySignal.findFirst({
      where: { admin_id: worker.userId, kind: 'sample_diff', item_id: x.item },
    });
    expect(sig).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'staff.review_verdict', target_id: x.id },
    });
    expect(audit?.admin_id).toBe(head.userId);
    expect(audit?.after).toMatchObject({
      verdict: 'overturned',
      reasons: ['wrong_outcome'],
    });
    const lease = await prisma.workLease.findFirst({
      where: { kind: 'review_sample', item_id: x.id },
    });
    expect(lease?.admin_id).toBeNull();

    // a second verdict on the same sample is gone
    await post(head, `/${x.id}/verdict`, { verdict: 'confirmed' }).expect(404);

    // confirmed: no signal at all
    const next = data(await post(head, '/next')).sample;
    expect(next.id).toBe(y.id);
    await post(head, `/${y.id}/verdict`, { verdict: 'confirmed' }).expect(200);
    expect(
      await prisma.staffQualitySignal.count({
        where: { admin_id: worker.userId, item_id: y.item },
      }),
    ).toBe(0);
  });

  it('only the holder may give a verdict; overturning needs a reason; «unclear» marks nobody', async () => {
    const [x] = await seed(1);
    await post(head, `/${x.id}/verdict`, { verdict: 'confirmed' }).expect(404); // not leased yet
    await post(head, '/next').expect(200);
    await post(senior, `/${x.id}/verdict`, { verdict: 'confirmed' }).expect(
      404,
    ); // not theirs
    await post(head, `/${x.id}/verdict`, { verdict: 'overturned' }).expect(400);
    await post(head, `/${x.id}/verdict`, { verdict: 'nope' }).expect(400);

    const r = await post(head, `/${x.id}/verdict`, {
      verdict: 'unclear',
    }).expect(200);
    expect(data(r).result).toBe('returned');
    const row = await prisma.staffReviewSample.findUniqueOrThrow({
      where: { id: x.id },
    });
    expect(row).toMatchObject({ status: 'pending', verdict: null });
    expect(
      await prisma.staffQualitySignal.count({ where: { item_id: x.item } }),
    ).toBe(0);
    // the one who could not tell does not get it again; another reviewer does
    expect(data(await post(head, '/next')).sample).toBeNull();
    expect(data(await post(senior, '/next')).sample.id).toBe(x.id);
  });

  it('golden: owner marks a confirmed decision, the result shows in the lists and stats', async () => {
    const [x] = await seed(1, 'support_ticket');
    await post(head, '/next').expect(200);
    await post(head, `/${x.id}/verdict`, { verdict: 'confirmed' }).expect(200);

    await post(owner, '/golden', { sampleId: randomUUID() }).expect(400);
    const marked = await post(owner, '/golden', {
      sampleId: x.id,
      workerId: worker2.userId,
    }).expect(200);
    const goldenId = data(marked).goldenId as string;
    await post(owner, '/golden', {
      sampleId: x.id,
      workerId: worker2.userId,
    }).expect(409);

    let list = data(await get(head, '/golden').expect(200)).items as Array<
      Record<string, any>
    >;
    expect(list.find((g) => g.id === goldenId)).toMatchObject({
      state: 'pending',
      worker: { adminId: worker2.userId },
    });
    // T4 serves it to the worker and calls resolveGolden with the answer
    expect(await sampling.resolveGolden(goldenId, 'resolve')).toBe(true);
    list = data(await get(owner, '/golden')).items;
    expect(list.find((g) => g.id === goldenId)?.state).toBe('passed');
    expect(
      await prisma.staffQualitySignal.count({
        where: { admin_id: worker2.userId, kind: 'golden_pass' },
      }),
    ).toBe(1);

    // a task that was not confirmed cannot be golden
    const [z] = await seed(1);
    await post(owner, '/golden', { sampleId: z.id }).expect(400);
  });

  it('calibration: a second reviewer checks a verdict blind; agreement shows in the stats', async () => {
    stored = {
      ...ON,
      'staff.peer_check_enabled': true,
      'staff.peer_check.pct': 10,
    };
    const [x] = await seed(1);
    await post(head, '/next').expect(200);
    const dice = jest.spyOn(Math, 'random').mockReturnValue(0);
    await post(head, `/${x.id}/verdict`, { verdict: 'confirmed' }).expect(200);
    dice.mockRestore();
    const copy = await prisma.staffReviewSample.findFirstOrThrow({
      where: { decision_kind: 'cal_support_ticket', item_id: x.item },
    });
    expect(copy).toMatchObject({
      status: 'pending',
      decided_by: head.userId,
      stage: 'peer',
    });

    // the first reviewer never gets their own check back
    expect(data(await post(head, '/next')).sample).toBeNull();
    const mine = data(await post(senior, '/next')).sample;
    expect(mine.id).toBe(copy.id);
    expect(mine.worker).toBeNull();
    expect(JSON.stringify(mine)).not.toContain('origVerdict');
    // the second reviewer disagrees
    await post(senior, `/${copy.id}/verdict`, {
      verdict: 'overturned',
      reasons: ['missed_signal'],
    }).expect(200);

    // …which marks neither the worker nor the first reviewer
    expect(
      await prisma.staffQualitySignal.count({
        where: {
          admin_id: { in: [worker.userId, head.userId] },
          item_id: x.item,
        },
      }),
    ).toBe(0);
    const after = await prisma.staffReviewSample.findUniqueOrThrow({
      where: { id: copy.id },
    });
    expect(after).toMatchObject({
      status: 'peer_done',
      verdict: 'different',
      reviewer_id: senior.userId,
    });

    const stats = data(await get(owner, '/stats').expect(200));
    const cal = (stats.calibration as Array<Record<string, any>>).find(
      (c) => c.decisionKind === 'support_ticket',
    );
    expect(cal?.pairs).toBeGreaterThanOrEqual(1);
    expect(cal?.agreementPct).toBeLessThan(100);
  });

  it('team and stats read the nightly snapshot: returned rate per worker, per workspace', async () => {
    const day = new Date(Date.now() + 86_400_000 * 400);
    day.setUTCHours(0, 0, 0, 0); // a future «latest» snapshot nobody else wrote
    await prisma.staffRatingSnapshot.create({
      data: {
        admin_id: worker.userId,
        snapshot_date: day,
        workspace: 'mass',
        rating: 80,
        n_decisions: 200,
        status: 'ok',
        evidence: {
          totals: {
            decided: 200,
            reopened: 8,
            complaints: 2,
            sampled: 10,
            sampleDiff: 2,
            goldenTotal: 4,
            goldenFail: 1,
          },
        },
      },
    });
    try {
      const team = data(await get(head, '/team').expect(200));
      const row = (team.items as Array<Record<string, any>>).find(
        (i) => i.adminId === worker.userId,
      );
      expect(row).toMatchObject({
        decisions: 200,
        returnedRate: 5,
        sampled: 10,
        overturned: 2,
        goldenFailed: 1,
      });
      const stats = data(await get(head, '/stats').expect(200));
      const mass = (stats.workspaces as Array<Record<string, any>>).find(
        (w) => w.workspace === 'mass',
      );
      expect(mass).toMatchObject({
        sampled: 10,
        overturned: 2,
        overturnRate: 20,
        returnedRate: 5,
      });
      // a head sees only their own workspace
      expect(
        (stats.workspaces as Array<Record<string, any>>).every(
          (w) => w.workspace === 'mass',
        ),
      ).toBe(true);
    } finally {
      await prisma.staffRatingSnapshot.deleteMany({
        where: { snapshot_date: day },
      });
    }
  });
});
