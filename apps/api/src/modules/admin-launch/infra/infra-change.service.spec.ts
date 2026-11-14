/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async Prisma / settings calls */
import { Prisma } from '@prisma/client';
import { InfraChangeService, InfraRequestError } from './infra-change.service';
import { callerFromClaims, InfraAuthError } from './infra-github.client';
import { SYSTEM_ACTOR_ID } from './infra-auto.logic';

/**
 * Owner 2026-10-26: the request → plan → 2FA confirm → apply flow end to
 * end against an in-memory table (the same compare-and-set updates and the
 * one-active-request rule the migration's partial unique index enforces).
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
  o: { dryRun?: boolean; quiet?: string; dispatchFails?: boolean } = {},
) {
  const { prisma, rows } = fakePrisma();
  const settings = {
    boolean: jest.fn(async () => o.dryRun ?? false),
    number: jest.fn(async () => 3),
    raw: jest.fn(async () => o.quiet ?? ''),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const github = {
    configured: jest.fn(async () => true),
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
const PLAN = {
  add: 1,
  change: 0,
  destroy: 0,
  resources: [
    {
      address: 'module.stack.module.growth.aws_opensearch_domain.search[0]',
      action: 'create',
    },
  ],
  fileBefore: { 'growth.opensearch_enabled': null },
};

describe('InfraChangeService', () => {
  it('request → plan → 2FA confirm → apply → done, then «Откатить»', async () => {
    const { svc, rows, audit, github } = make();
    const r = await svc.create('admin-1', '1.2.3.4', 'aws.opensearch', 'on');
    expect(r.status).toBe('requested');
    expect(r.costDeltaUsd).toEqual([28, 280]);
    expect(r.changes).toEqual({ 'growth.opensearch_enabled': true });
    expect(github.dispatch).toHaveBeenCalledWith(r.id);

    const job = await svc.jobStart(r.id, RUN);
    expect(job).toMatchObject({ status: 'planning', dryRun: false });
    const planned = await svc.planReady(r.id, RUN, PLAN);
    expect(planned.status).toBe('planned');
    expect(planned.expiresAt).not.toBeNull();
    expect((await svc.decision(r.id, RUN)).decision).toBe('wait');

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
    expect((await svc.liveStates()).get('aws.opensearch')).toBe('on');

    const back = await svc.rollback('admin-1', null, r.id);
    expect(back).toMatchObject({ toState: 'off', rollbackOf: r.id });
    expect(back.costDeltaUsd).toEqual([-280, -28]);
    await svc.jobStart(back.id, { ...RUN, runId: '43' });
    await svc.planReady(back.id, { ...RUN, runId: '43' }, PLAN);
    await svc.confirm('admin-1', null, back.id);
    await svc.report(back.id, { ...RUN, runId: '43' }, { status: 'applying' });
    await svc.report(back.id, { ...RUN, runId: '43' }, { status: 'done' });
    expect(rows.find((x) => x.id === r.id)!.status).toBe('rolled_back');
    expect((await svc.liveStates()).get('aws.opensearch')).toBe('off');
    const calls = audit.record.mock.calls as unknown as [{ action: string }][];
    expect(calls.map((c) => c[0].action)).toEqual([
      'ops.infra_request',
      'ops.infra_confirm',
      'ops.infra_rollback',
      'ops.infra_confirm',
    ]);
  });

  it('an automatic request is real and its safe plan is applied without a tap (audit 2026-11-08)', async () => {
    // dry_run on for the admin buttons; the automation still acts.
    const { svc, audit } = make({ dryRun: true });
    const r = await svc.create(
      SYSTEM_ACTOR_ID,
      null,
      'aws.opensearch',
      'on',
      null,
      {
        auto: true,
      },
    );
    expect(r.dryRun).toBe(false);
    await svc.jobStart(r.id, RUN);
    const planned = await svc.planReady(r.id, RUN, PLAN);
    expect(planned.status).toBe('confirmed');
    expect(await svc.decision(r.id, RUN)).toMatchObject({
      decision: 'apply',
      auto: true,
    });
    // No admin, so no audit row with a fake admin id (the request row is the log).
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('an automatic plan that removes more than it should waits for the owner', async () => {
    const { svc } = make();
    const r = await svc.create(
      SYSTEM_ACTOR_ID,
      null,
      'aws.opensearch',
      'on',
      null,
      {
        auto: true,
      },
    );
    await svc.jobStart(r.id, RUN);
    const planned = await svc.planReady(r.id, RUN, {
      ...PLAN,
      destroy: 1,
      resources: [
        ...PLAN.resources,
        {
          address: 'module.stack.aws_cloudwatch_metric_alarm.x',
          action: 'delete',
        },
      ],
    });
    expect(planned.status).toBe('planned');
  });

  it('13.11 replay: the automatic pooler switch-off plan is NOT applied without the owner', async () => {
    // Request f758b39f (13.11 21:33 UTC): «Авто» aws.pgbouncer on -> off. Its
    // plan deletes only the pooler and replaces the api / worker task
    // definitions, so the old rule confirmed it by itself and the apply took
    // the pooler away under the running tasks (outage 21:58-22:53 UTC).
    const { svc } = make();
    const r = await svc.create(
      SYSTEM_ACTOR_ID,
      null,
      'aws.pgbouncer',
      'off',
      null,
      { auto: true },
    );
    await svc.jobStart(r.id, RUN);
    const pgb = 'module.stack.module.pgbouncer[0]';
    const planned = await svc.planReady(r.id, RUN, {
      add: 2,
      change: 3,
      destroy: 6,
      resources: [
        { address: `${pgb}.aws_ecs_service.this`, action: 'delete' },
        { address: `${pgb}.aws_ecs_task_definition.this`, action: 'delete' },
        { address: `${pgb}.aws_security_group.svc`, action: 'delete' },
        {
          address: `${pgb}.aws_service_discovery_service.this`,
          action: 'delete',
        },
        {
          address: 'module.stack.module.ecs.aws_ecs_task_definition.api',
          action: 'create-delete',
        },
        {
          address: 'module.stack.module.ecs.aws_ecs_task_definition.worker',
          action: 'create-delete',
        },
        {
          address: 'module.stack.module.ecs.aws_ecs_service.api',
          action: 'update',
        },
      ],
      fileBefore: { db_pooler_enabled: true },
    });
    expect(planned.status).toBe('planned');
    expect((await svc.decision(r.id, RUN)).decision).toBe('wait');
  });

  it('the auto flag of an admin is ignored (only the system acts without 2FA)', async () => {
    const { svc } = make({ dryRun: true });
    const r = await svc.create('admin-1', null, 'aws.opensearch', 'on', null, {
      auto: true,
    });
    expect(r.dryRun).toBe(true);
  });

  it('only one request at a time; a second one is refused', async () => {
    const { svc } = make();
    await svc.create('a', null, 'aws.opensearch', 'on');
    await expect(
      svc.create('a', null, 'aws.inspector', 'on'),
    ).rejects.toMatchObject({ code: 'busy' });
  });

  it('a request outside the whitelist is refused', async () => {
    const { svc } = make();
    await expect(
      svc.create('a', null, 'aws.backup', 'off'),
    ).rejects.toMatchObject({ code: 'unknown_item' });
  });

  it('GitHub refusing the start fails the request, so the next one is free', async () => {
    const { svc } = make({ dispatchFails: true });
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    expect(r.status).toBe('failed');
    expect(r.error).toContain('HTTP 404');
    await expect(
      svc.create('a', null, 'aws.inspector', 'on'),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('dry-run: the plan is shown, the run stops, nothing to confirm', async () => {
    const { svc } = make({ dryRun: true });
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(r.id, RUN);
    expect((await svc.planReady(r.id, RUN, PLAN)).status).toBe('dry_run');
    expect((await svc.decision(r.id, RUN)).decision).toBe('stop');
    await expect(svc.confirm('a', null, r.id)).rejects.toMatchObject({
      code: 'wrong_status',
    });
  });

  it('a plan that destroys data is refused and the request fails', async () => {
    const { svc, rows } = make();
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(r.id, RUN);
    await expect(
      svc.planReady(r.id, RUN, {
        ...PLAN,
        destroy: 1,
        resources: [
          { address: 'module.stack.aws_s3_bucket.media', action: 'delete' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'bad_plan' });
    expect(rows[0].status).toBe('failed');
  });

  it('an unconfirmed plan expires after 30 minutes', async () => {
    const { svc, rows } = make();
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(r.id, RUN);
    await svc.planReady(r.id, RUN, PLAN);
    rows[0].planned_at = new Date(Date.now() - 31 * 60_000);
    await expect(svc.confirm('a', null, r.id)).rejects.toMatchObject({
      code: 'wrong_status',
    });
    expect(rows[0].status).toBe('expired');
    expect((await svc.decision(r.id, RUN)).decision).toBe('stop');
  });

  it('outside quiet hours the confirm is refused', async () => {
    const { svc } = make({ quiet: '00:00-00:01' });
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(r.id, RUN);
    await svc.planReady(r.id, RUN, PLAN);
    const now = new Date();
    const inWindow =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now) === '00:00';
    if (!inWindow) {
      await expect(svc.confirm('a', null, r.id)).rejects.toMatchObject({
        code: 'quiet_hours',
      });
    }
  });

  it('another run cannot drive a request it did not take', async () => {
    const { svc } = make();
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(r.id, RUN);
    await expect(
      svc.planReady(r.id, { ...RUN, runId: '99' }, PLAN),
    ).rejects.toBeInstanceOf(InfraRequestError);
  });

  it('row 86: a failure whose target the cloud already holds is settled, the error stays', async () => {
    const { svc } = make();
    const fail = async (runId: string, plan: typeof PLAN) => {
      const r = await svc.create('a', null, 'aws.opensearch', 'on');
      const run = { ...RUN, runId };
      await svc.jobStart(r.id, run);
      await svc.planReady(r.id, run, plan);
      await svc.confirm('a', null, r.id);
      await svc.report(r.id, run, { status: 'applying' });
      await svc.report(r.id, run, {
        status: 'failed',
        error: 'elasticache:ModifyReplicationGroup AccessDenied',
      });
      return r.id;
    };
    // 12.11: the first apply created the domain, then failed on Redis.
    const first = await fail('50', PLAN);
    expect((await svc.recent()).find((x) => x.id === first)).toMatchObject({
      status: 'failed',
      settled: false,
    });
    // Its plan created the domain: unknown whether it stayed, not live yet.
    expect((await svc.liveStates()).get('aws.opensearch')).toBeUndefined();
    // The next «Вкл»: the domain is there, the plan only touches Redis.
    const second = await fail('51', {
      add: 0,
      change: 1,
      destroy: 0,
      resources: [
        {
          address: 'module.stack.aws_elasticache_replication_group.redis',
          action: 'update',
        },
      ],
      fileBefore: PLAN.fileBefore,
    });
    const list = await svc.recent();
    const a = list.find((x) => x.id === first)!;
    const b = list.find((x) => x.id === second)!;
    // Row 9: the second plan proves the domain is up, so «Авто» sees it on
    // (and may switch it off later) and the first failure is settled too.
    expect((await svc.liveStates()).get('aws.opensearch')).toBe('on');
    expect(a).toMatchObject({ status: 'failed', settled: true });
    expect(b).toMatchObject({
      status: 'failed',
      settled: true,
      error: 'elasticache:ModifyReplicationGroup AccessDenied',
    });
  });

  it('row 86: a failure is settled once a finished change set its target', async () => {
    const { svc } = make();
    const r = await svc.create('a', null, 'aws.opensearch', 'on');
    const run = { ...RUN, runId: '60' };
    await svc.jobStart(r.id, run);
    await svc.report(r.id, run, { status: 'plan_failed', error: 'no plan' });
    expect((await svc.recent()).find((x) => x.id === r.id)).toMatchObject({
      status: 'failed',
      settled: false,
    });
    const ok = await svc.create('a', null, 'aws.opensearch', 'on');
    await svc.jobStart(ok.id, RUN);
    await svc.planReady(ok.id, RUN, PLAN);
    await svc.confirm('a', null, ok.id);
    await svc.report(ok.id, RUN, { status: 'applying' });
    await svc.report(ok.id, RUN, { status: 'done' });
    expect((await svc.recent()).find((x) => x.id === r.id)).toMatchObject({
      status: 'failed',
      settled: true,
      error: 'no plan',
    });
  });
});

describe('workflow OIDC claims', () => {
  const ok = {
    repository: 'Owner/LawBid',
    ref: 'refs/heads/main',
    job_workflow_ref:
      'Owner/LawBid/.github/workflows/infra-apply.yml@refs/heads/main',
    run_id: '123',
  };
  it('accepts only this repository, this workflow, main', () => {
    expect(callerFromClaims(ok, 'owner/lawbid')).toEqual({
      runId: '123',
      runUrl: 'https://github.com/owner/lawbid/actions/runs/123',
    });
    for (const bad of [
      { ...ok, repository: 'evil/LawBid' },
      { ...ok, ref: 'refs/heads/feature' },
      {
        ...ok,
        job_workflow_ref:
          'Owner/LawBid/.github/workflows/deploy.yml@refs/heads/main',
      },
      {
        ...ok,
        job_workflow_ref:
          'Owner/LawBid/.github/workflows/infra-apply.yml@refs/heads/x',
      },
      { ...ok, run_id: undefined },
    ]) {
      expect(() => callerFromClaims(bad, 'owner/lawbid')).toThrow(
        InfraAuthError,
      );
    }
  });
});
