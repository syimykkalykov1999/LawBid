/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async Prisma / settings calls */
import { Prisma } from '../../../generated/prisma/client';
import { InfraChangeService } from './infra-change.service';
import { servingDestroys } from './infra-auto.logic';
import {
  INFRA_PENDING_ID,
  INFRA_PENDING_NAME,
  queueRefusal,
} from './infra-change.logic';

/**
 * Owner 17.11 «Применить изменения из кода» (first case: Origin Shield of
 * the media CDN, #1195): a request that changes no switch rides the same
 * request → plan → 2FA confirm → apply pipeline and the same guards.
 * The in-memory table is the one of infra-change.service.spec.ts.
 */
type Row = Record<string, unknown> & {
  id: string;
  status: string;
  item_id: string;
  created_at: Date;
  updated_at: Date;
};

const ACTIVE = ['requested', 'planning', 'planned', 'confirmed', 'applying'];

function fakePrisma() {
  const rows: Row[] = [];
  let n = 0;
  const match = (r: Row, w: Record<string, unknown> = {}): boolean =>
    Object.entries(w).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as { in?: unknown[]; not?: unknown; gte?: Date };
        if (o.in) return o.in.includes(r[k]);
        if ('not' in o) return r[k] !== o.not;
        if (o.gte) return (r[k] as Date) >= o.gte;
      }
      return r[k] === v;
    });
  const t = {
    findMany: jest.fn(
      async (a: {
        where?: Record<string, unknown>;
        distinct?: string[];
        take?: number;
      }) => {
        let out = rows.filter((r) => match(r, a.where));
        out = [...out].reverse();
        if (a.distinct) {
          const seen = new Set<unknown>();
          out = out.filter((r) => {
            const k = r[a.distinct![0]];
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        return out.slice(0, a.take ?? 1000);
      },
    ),
    count: jest.fn(
      async (a: { where?: Record<string, unknown> }) =>
        rows.filter((r) => match(r, a.where)).length,
    ),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => {
      if (rows.some((r) => ACTIVE.includes(r.status))) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      n += 1;
      const now = new Date();
      const row: Row = {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        status: 'requested',
        from_state: null,
        confirmed_by: null,
        plan_summary: null,
        file_before: null,
        run_id: null,
        run_url: null,
        recorded: null,
        error: null,
        planned_at: null,
        confirmed_at: null,
        finished_at: null,
        rollback_of: null,
        dry_run: false,
        created_at: now,
        updated_at: now,
        ...a.data,
      } as unknown as Row;
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(
      async (a: { where: { id: string } }) =>
        rows.find((r) => r.id === a.where.id) ?? null,
    ),
    findUniqueOrThrow: jest.fn(async (a: { where: { id: string } }) => {
      const r = rows.find((x) => x.id === a.where.id);
      if (!r) throw new Error('not found');
      return r;
    }),
    updateMany: jest.fn(
      async (a: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const hit = rows.filter((r) => match(r, a.where));
        for (const r of hit)
          Object.assign(r, a.data, { updated_at: new Date() });
        return { count: hit.length };
      },
    ),
  };
  return { prisma: { infraChangeRequest: t }, rows };
}

function make(
  o: {
    dryRun?: boolean;
    quiet?: string;
    dispatchFails?: boolean;
    cap?: number;
    configured?: boolean;
  } = {},
) {
  const { prisma, rows } = fakePrisma();
  const settings = {
    boolean: jest.fn(async () => o.dryRun ?? false),
    number: jest.fn(async () => o.cap ?? 3),
    raw: jest.fn(async () => o.quiet ?? ''),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const github = {
    configured: jest.fn(async () => o.configured ?? true),
    dispatch: jest.fn(async () => {
      if (o.dispatchFails) throw new Error('HTTP 404');
    }),
  };
  const svc = new InfraChangeService(
    prisma as never,
    settings as never,
    audit as never,
    github as never,
  );
  return { svc, rows, audit, github };
}

const RUN = { runId: '42', runUrl: 'https://github.com/o/r/actions/runs/42' };
// What #1195 plans: the media distribution updated in place.
const SHIELD = {
  add: 0,
  change: 1,
  destroy: 0,
  resources: [
    {
      address: 'module.stack.module.s3.aws_cloudfront_distribution.media',
      action: 'update',
    },
  ],
  fileBefore: {},
};

describe('InfraChangeService: «Применить изменения из кода»', () => {
  it('request → plan → 2FA confirm → apply → done; no switch changes, no rollback', async () => {
    const { svc, audit, github } = make();
    const r = await svc.createPending('admin-1', '1.2.3.4');
    expect(r).toMatchObject({
      itemId: INFRA_PENDING_ID,
      itemName: INFRA_PENDING_NAME,
      fromState: null,
      toState: 'pending',
      changes: {},
      costDeltaUsd: [0, 0],
      status: 'requested',
      dryRun: false,
    });
    expect(r.impact).toContain('main');
    expect(github.dispatch).toHaveBeenCalledWith(r.id);

    const job = await svc.jobStart(r.id, RUN);
    expect(job).toMatchObject({ status: 'planning', changes: {} });
    const planned = await svc.planReady(r.id, RUN, SHIELD);
    expect(planned.status).toBe('planned');
    expect(planned.plan).toMatchObject({ add: 0, change: 1, destroy: 0 });
    // Nobody tapped: the workflow waits for the owner's code.
    expect(await svc.decision(r.id, RUN)).toMatchObject({
      decision: 'wait',
      auto: false,
    });

    await svc.confirm('admin-1', null, r.id);
    expect(await svc.decision(r.id, RUN)).toMatchObject({
      decision: 'apply',
      auto: false,
    });
    await svc.report(r.id, RUN, { status: 'applying' });
    const done = await svc.report(r.id, RUN, {
      status: 'done',
      recorded: 'main',
    });
    expect(done.status).toBe('done');
    // No switch position comes from it.
    expect((await svc.liveStates()).has(INFRA_PENDING_ID)).toBe(false);
    expect((await svc.recent()).map((x) => x.id)).toContain(r.id);
    await expect(svc.rollback('admin-1', null, r.id)).rejects.toMatchObject({
      code: 'wrong_status',
    });
    const calls = audit.record.mock.calls as unknown as [
      { action: string; after: Record<string, unknown> },
    ][];
    expect(calls.map((c) => c[0].action)).toEqual([
      'ops.infra_request',
      'ops.infra_confirm',
    ]);
    expect(calls[0][0].after).toMatchObject({ item: INFRA_PENDING_ID });
  });

  it('one request at a time: refused while a switch request runs, and the reverse', async () => {
    const { svc } = make();
    const sw = await svc.create('a', null, 'aws.opensearch', 'on');
    await expect(svc.createPending('a', null)).rejects.toMatchObject({
      code: 'busy',
    });
    await svc.cancel('a', null, sw.id);
    await svc.createPending('a', null);
    await expect(
      svc.create('a', null, 'aws.opensearch', 'on'),
    ).rejects.toMatchObject({ code: 'busy' });
  });

  it('the daily cap and a missing GitHub App refuse it like a switch', async () => {
    const capped = make({ cap: 1 });
    const first = await capped.svc.createPending('a', null);
    await capped.svc.jobStart(first.id, RUN);
    await capped.svc.report(first.id, RUN, { status: 'plan_failed' });
    await expect(capped.svc.createPending('a', null)).rejects.toMatchObject({
      code: 'daily_cap',
    });
    await expect(
      make({ configured: false }).svc.createPending('a', null),
    ).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('dry-run: the plan is shown, the run stops, nothing to confirm', async () => {
    const { svc } = make({ dryRun: true });
    const r = await svc.createPending('a', null);
    expect(r.dryRun).toBe(true);
    await svc.jobStart(r.id, RUN);
    expect((await svc.planReady(r.id, RUN, SHIELD)).status).toBe('dry_run');
    expect((await svc.decision(r.id, RUN)).decision).toBe('stop');
  });

  it('a plan from code that destroys protected data is refused', async () => {
    const { svc, rows } = make();
    const r = await svc.createPending('a', null);
    await svc.jobStart(r.id, RUN);
    await expect(
      svc.planReady(r.id, RUN, {
        ...SHIELD,
        destroy: 1,
        resources: [
          { address: 'module.stack.aws_s3_bucket.media', action: 'delete' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'bad_plan' });
    expect(rows[0].status).toBe('failed');
  });

  it('a plan from code that replaces a serving part (CDN) is refused, the reason stays', async () => {
    const { svc, rows } = make();
    const r = await svc.createPending('a', null);
    await svc.jobStart(r.id, RUN);
    await expect(
      svc.planReady(r.id, RUN, {
        ...SHIELD,
        add: 1,
        destroy: 1,
        resources: [
          {
            address: 'module.stack.module.s3.aws_cloudfront_distribution.media',
            action: 'delete-create',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'bad_plan' });
    expect(rows[0].status).toBe('failed');
    expect(String(rows[0].error)).toContain(
      'aws_cloudfront_distribution.media',
    );
  });

  it('the confirm keeps the quiet hours and the 30-minute plan life', async () => {
    const { svc, rows } = make({ quiet: '00:00-00:01' });
    const r = await svc.createPending('a', null);
    await svc.jobStart(r.id, RUN);
    await svc.planReady(r.id, RUN, SHIELD);
    const inWindow =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()) === '00:00';
    if (!inWindow) {
      await expect(svc.confirm('a', null, r.id)).rejects.toMatchObject({
        code: 'quiet_hours',
      });
    }
    rows[0].planned_at = new Date(Date.now() - 31 * 60_000);
    await expect(svc.confirm('a', null, r.id)).rejects.toMatchObject({
      code: 'wrong_status',
    });
    expect(rows[0].status).toBe('expired');
  });
});

describe('pending guards (pure)', () => {
  it('queueRefusal: busy, then the cap (0 = none), then GitHub', () => {
    const ok = { activeCount: 0, last24h: 0, dailyCap: 3, configured: true };
    expect(queueRefusal(ok)).toBeNull();
    expect(queueRefusal({ ...ok, activeCount: 1 })).toBe('busy');
    expect(queueRefusal({ ...ok, last24h: 3 })).toBe('daily_cap');
    expect(queueRefusal({ ...ok, last24h: 99, dailyCap: 0 })).toBeNull();
    expect(queueRefusal({ ...ok, configured: false })).toBe('not_configured');
  });

  it('servingDestroys: deletes and replaces of serving parts only', () => {
    expect(
      servingDestroys([
        {
          address: 'module.s.aws_cloudfront_distribution.media',
          action: 'update',
        },
        { address: 'module.s.aws_lb.api', action: 'delete' },
        { address: 'module.s.aws_ecs_service.api', action: 'create-delete' },
        {
          address: 'module.s.aws_ecs_task_definition.api',
          action: 'delete-create',
        },
      ]),
    ).toEqual(['module.s.aws_lb.api', 'module.s.aws_ecs_service.api']);
  });
});
