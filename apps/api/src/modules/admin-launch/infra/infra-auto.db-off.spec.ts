/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async Prisma / Redis / settings calls */
import { PartitionService } from '../../../partitioning/partition.service';
import { ShardMoveService } from '../../../sharding/move/shard-move.service';
import { SYSTEM_ACTOR_ID } from './infra-auto.logic';
import { InfraAutoService } from './infra-auto.service';
import { InfraChangeService } from './infra-change.service';

/**
 * Owner rows 8 and 85 (13.11: «Авто» must remove servers by itself at low
 * load, not only add). The real automatic pass (InfraAutoService) and the
 * real request flow (InfraChangeService: live state, create, plan guard,
 * auto-confirm) run together against one in-memory request table, every
 * 10 minutes of a calm period longer than infra.auto_off_hours (72 h), so
 * the switch-off is proven without waiting three days on prod.
 *
 * Signals replay prod 11.11–13.11 (CloudWatch): primary CPU 3–5 %, read
 * copy CPU ~4 % (limit 70 %): no `db_cpu`, `replica_idle`.
 */
type Row = Record<string, unknown> & {
  id: string;
  status: string;
  item_id: string;
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
  // Newest finished first (orderBy finished_at desc), unfinished last.
  const order = (a: Row, b: Row) =>
    ((b.finished_at as Date | null)?.getTime() ?? 0) -
    ((a.finished_at as Date | null)?.getTime() ?? 0);
  const t = {
    findMany: jest.fn(
      async (a: { where?: Record<string, unknown>; take?: number }) =>
        rows
          .filter((r) => match(r, a.where))
          .sort(order)
          .slice(0, a.take ?? 1000),
    ),
    count: jest.fn(
      async (a: { where?: Record<string, unknown> }) =>
        rows.filter((r) => match(r, a.where)).length,
    ),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => {
      if (rows.some((r) => ACTIVE.includes(r.status))) {
        throw new Error('one active request (partial unique index)');
      }
      n += 1;
      const now = new Date();
      const row = {
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
        for (const r of hit) {
          Object.assign(r, a.data, { updated_at: new Date() });
        }
        return { count: hit.length };
      },
    ),
  };
  /** A finished request as it stands on prod. */
  const seed = (r: {
    item: string;
    to: 'on' | 'off';
    status: 'done' | 'failed';
    by: string;
    at: string;
    plan?: { address: string; action: string }[];
    active?: string;
  }) => {
    n += 1;
    const at = new Date(r.at);
    rows.push({
      id: `seed-${n}`,
      item_id: r.item,
      to_state: r.to,
      from_state: r.to === 'on' ? 'off' : 'on',
      status: r.active ?? r.status,
      requested_by: r.by,
      plan_summary: r.plan
        ? { add: 0, change: 0, destroy: 0, resources: r.plan }
        : null,
      run_id: 'old-run',
      created_at: at,
      updated_at: at,
      planned_at: at,
      finished_at: r.active ? null : at,
    });
  };
  return {
    prisma: { infraChangeRequest: t, $queryRaw: jest.fn(async () => []) },
    rows,
    seed,
  };
}

const OWNER = '11111111-1111-4111-8111-111111111111';

function make(o: {
  pressures: string[];
  modes?: Record<string, string>;
  /** Extra database servers and the ones without any data. */
  servers?: string[];
  empty?: string[];
}) {
  const { prisma, rows, seed } = fakePrisma();
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn(async (k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    sadd: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
  };
  const strings: Record<string, string> = {
    'infra.auto_mode': 'auto',
    'db.replica_provision': 'auto',
    'db.shards_mode': o.modes?.['db.shards_mode'] ?? 'auto',
    'cache.redis_mode': 'off',
    'search.engine_follow': 'manual',
    'events.sink': 'db',
  };
  const numbers: Record<string, number> = {
    'infra.auto_on_minutes': 30,
    'infra.auto_off_hours': 72,
    'infra.waf_attack_on_minutes': 5,
    'infra.waf_calm_off_hours': 6,
    'infra.auto_max_usd_month': 100,
    'economy.aws_cap_usd': 0,
    'infra.daily_cap': 0,
    'partition.auto_rows': 1_000_000_000,
  };
  const settings = {
    string: jest.fn(async (k: string) => strings[k] ?? null),
    number: jest.fn(async (k: string) => numbers[k] ?? 0),
    boolean: jest.fn(async () => false),
    // Nothing stored on «Масштаб» unless the case says so (prod default).
    raw: jest.fn(async (k: string) =>
      k === 'infra.quiet_hours' ? '' : o.modes?.[k],
    ),
  };
  const moves = {
    extraDatabases: () => o.servers ?? [],
    emptyServers: jest.fn(async () => o.empty ?? []),
    serverFill: jest.fn(async () => [
      { key: 'primary', ratio: 0.05, shards: 16 },
      ...(o.servers ?? []).map((key) => ({
        key,
        ratio: 0,
        shards: o.empty?.includes(key) ? 0 : 4,
      })),
    ]),
  };
  const partitions = {
    shardSignal: jest.fn(async () => ({
      status: 'green',
      thresholdGb: 500,
      thresholdRows: 1_000_000_000,
    })),
  };
  const moduleRef = {
    get: jest.fn((token: unknown) => {
      if (token === ShardMoveService) return moves;
      if (token === PartitionService) return partitions;
      throw new Error('not in this test');
    }),
  };
  const github = {
    configured: jest.fn(async () => true),
    dispatch: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const infra = new InfraChangeService(
    prisma as never,
    settings as never,
    audit as never,
    github as never,
    moduleRef as never,
  );
  const registry = {
    signals: jest.fn(async () => ({
      pressures: o.pressures,
      budgetRatio: 0.1,
    })),
    searchEngine: jest.fn(async () => 'postgres'),
  };
  const config = { get: jest.fn(() => undefined) };
  const auto = new InfraAutoService(
    infra,
    registry as never,
    settings as never,
    prisma as never,
    config as never,
    redis as never,
    undefined,
    undefined,
    moduleRef as never,
  );
  /** One pass every 10 minutes from [from] for [hours]; the first start. */
  const runFor = async (from: Date, hours: number) => {
    for (let m = 0; m <= hours * 60; m += 10) {
      store.delete('ops:infra-auto:lock');
      const at = new Date(from.getTime() + m * 60_000);
      const r = await auto.check(at);
      if (r.started) return { at, want: r.started, held: r.held };
    }
    return null;
  };
  /** The workflow run: take the job, send the plan, apply if told to. */
  const workflow = async (
    plan: { address: string; action: string }[],
    runId: string,
  ) => {
    const req = rows.find((r) => r.status === 'requested')!;
    const caller = {
      runId,
      runUrl: `https://github.com/o/r/actions/runs/${runId}`,
    };
    const job = await infra.jobStart(req.id, caller);
    const count = (a: string) =>
      plan.filter((x) => x.action.includes(a)).length;
    const view = await infra.planReady(req.id, caller, {
      add: count('create'),
      change: count('update'),
      destroy: count('delete'),
      resources: plan,
      fileBefore: {},
    });
    const decision = (await infra.decision(req.id, caller)).decision;
    if (decision === 'apply') {
      await infra.report(req.id, caller, { status: 'applying' });
      await infra.report(req.id, caller, { status: 'done' });
    }
    return { job, status: view.status, decision, row: req };
  };
  return { auto, infra, rows, seed, runFor, workflow, moves };
}

const TASK_DEFS = ['api', 'worker', 'migrate'].map((s) => ({
  address: `module.stack.aws_ecs_task_definition.${s}`,
  action: 'delete-create',
}));
const SERVICES = ['api', 'worker'].map((s) => ({
  address: `module.stack.aws_ecs_service.${s}`,
  action: 'update',
}));
/** Plan of growth.rds_read_replicas 1 → 0 (infra/modules/growth). */
const REPLICA_OFF_PLAN = [
  {
    address: 'module.stack.module.growth.aws_db_instance.replica[0]',
    action: 'delete',
  },
  {
    address: 'module.stack.module.growth.aws_iam_role.replica_monitoring[0]',
    action: 'delete',
  },
  {
    address:
      'module.stack.module.growth.aws_iam_role_policy_attachment.replica_monitoring[0]',
    action: 'delete',
  },
  {
    address:
      'module.stack.module.growth.aws_cloudwatch_metric_alarm.replica_lag[0]',
    action: 'delete',
  },
  ...TASK_DEFS,
  ...SERVICES,
];
/** Plan of db_shards 1 → 0 as applied on prod 13.11 15:38–15:45 UTC
 * (CloudTrail: DeleteDBInstance lawbid-prod-db1-postgres with a final
 * snapshot, RegisterTaskDefinition api / worker / migrate = «3 added»). */
const SHARD_OFF_PLAN = [
  {
    address: 'module.stack.module.postgres_shard[0].aws_db_instance.this',
    action: 'delete',
  },
  {
    address:
      'module.stack.module.postgres_shard[0].aws_secretsmanager_secret.master',
    action: 'delete',
  },
  {
    address: 'module.stack.module.postgres_shard[0].aws_security_group.db',
    action: 'delete',
  },
  ...TASK_DEFS,
  ...SERVICES,
];

const H = 3_600_000;
// Prod: the read copy's automatic «Вкл» b91839e4 was applied 11.11 20:16 UTC.
const REPLICA_ON = '2026-11-11T20:16:02Z';
const T0 = new Date('2026-11-11T20:20:00Z');

describe('«Авто» removes database servers at low load (rows 8, 85)', () => {
  it('row 8: the read copy it switched on goes after 72 h without db_cpu, plan applied without a tap', async () => {
    const { seed, runFor, workflow, infra } = make({
      pressures: ['replica_idle'],
    });
    seed({
      item: 'aws.rds_replicas',
      to: 'on',
      status: 'done',
      by: SYSTEM_ACTOR_ID,
      at: REPLICA_ON,
    });
    const first = await runFor(T0, 80);
    expect(first?.want).toMatchObject({ id: 'aws.rds_replicas', to: 'off' });
    const waited = (first!.at.getTime() - T0.getTime()) / H;
    expect(waited).toBeGreaterThanOrEqual(72);
    expect(waited).toBeLessThan(72.2);
    const run = await workflow(REPLICA_OFF_PLAN, '501');
    expect(run.job.changes).toEqual({ 'growth.rds_read_replicas': 0 });
    expect(run.status).toBe('confirmed');
    expect(run.decision).toBe('apply');
    expect((await infra.liveStates()).get('aws.rds_replicas')).toBe('off');
    console.log(
      `row 8: off started at ${first!.at.toISOString()} (${waited.toFixed(2)} h calm), plan auto-confirmed, live = off`,
    );
  });

  it('row 8: copies 2..5 go one at a time, highest first, then the first copy', async () => {
    const { seed, runFor, workflow, infra } = make({
      pressures: ['replica_idle'],
    });
    seed({
      item: 'aws.rds_replicas',
      to: 'on',
      status: 'done',
      by: SYSTEM_ACTOR_ID,
      at: '2026-11-11T20:00:00Z',
    });
    seed({
      item: 'aws.rds_replicas_2',
      to: 'on',
      status: 'done',
      by: OWNER,
      at: REPLICA_ON,
    });
    const a = await runFor(T0, 80);
    expect(a?.want).toMatchObject({ id: 'aws.rds_replicas_2', to: 'off' });
    const runA = await workflow(
      [
        {
          address: 'module.stack.module.growth.aws_db_instance.replica[1]',
          action: 'delete',
        },
        ...TASK_DEFS,
      ],
      '502',
    );
    expect(runA.job.changes).toEqual({ 'growth.rds_read_replicas': 1 });
    expect(runA.decision).toBe('apply');
    const b = await runFor(new Date(a!.at.getTime() + 10 * 60_000), 80);
    expect(b?.want).toMatchObject({ id: 'aws.rds_replicas', to: 'off' });
    expect((b!.at.getTime() - a!.at.getTime()) / H).toBeGreaterThanOrEqual(72);
    const runB = await workflow(REPLICA_OFF_PLAN, '503');
    expect(runB.decision).toBe('apply');
    const live = await infra.liveStates();
    expect([
      live.get('aws.rds_replicas_2'),
      live.get('aws.rds_replicas'),
    ]).toEqual(['off', 'off']);
    console.log(
      `row 8: copy 2 off at ${a!.at.toISOString()}, copy 1 off at ${b!.at.toISOString()}`,
    );
  });

  it('row 8: «Вкл» picked on «Масштаб» keeps the copy (never off by itself)', async () => {
    const { seed, runFor } = make({
      pressures: ['replica_idle'],
      modes: { 'infra.mode.rds_replicas': 'on' },
    });
    seed({
      item: 'aws.rds_replicas',
      to: 'on',
      status: 'done',
      by: SYSTEM_ACTOR_ID,
      at: REPLICA_ON,
    });
    expect(await runFor(T0, 80)).toBeNull();
  });

  it('row 85: an empty extra database server goes after 72 h, even one the owner switched on by hand', async () => {
    const { seed, runFor, workflow, infra } = make({
      pressures: [],
      servers: ['db1'],
      empty: ['db1'],
    });
    // Prod: d0887b31 (manual, 11.11 23:20 UTC) set db_shards = 1.
    seed({
      item: 'aws.db_shards',
      to: 'on',
      status: 'done',
      by: OWNER,
      at: '2026-11-11T23:20:54Z',
    });
    const from = new Date('2026-11-11T23:30:00Z');
    const first = await runFor(from, 80);
    expect(first?.want).toMatchObject({ id: 'aws.db_shards', to: 'off' });
    const waited = (first!.at.getTime() - from.getTime()) / H;
    expect(waited).toBeGreaterThanOrEqual(72);
    const run = await workflow(SHARD_OFF_PLAN, '504');
    expect(run.job.changes).toEqual({ db_shards: 0 });
    expect(run.status).toBe('confirmed');
    expect(run.decision).toBe('apply');
    expect((await infra.liveStates()).get('aws.db_shards')).toBe('off');
    console.log(
      `row 85: off started at ${first!.at.toISOString()} (${waited.toFixed(2)} h), plan with the shard delete auto-confirmed, live = off`,
    );
  });

  it('row 85: a server that holds data is never removed', async () => {
    const { seed, runFor } = make({
      pressures: [],
      servers: ['db1'],
      empty: [],
    });
    seed({
      item: 'aws.db_shards',
      to: 'on',
      status: 'done',
      by: OWNER,
      at: '2026-11-11T23:20:54Z',
    });
    expect(await runFor(new Date('2026-11-11T23:30:00Z'), 80)).toBeNull();
  });

  it('row 85: the plan guard refuses a shard delete the request did not ask for', async () => {
    const { seed, runFor, workflow, rows } = make({
      pressures: ['replica_idle'],
    });
    seed({
      item: 'aws.rds_replicas',
      to: 'on',
      status: 'done',
      by: SYSTEM_ACTOR_ID,
      at: REPLICA_ON,
    });
    expect((await runFor(T0, 80))?.want.id).toBe('aws.rds_replicas');
    await expect(
      workflow([...REPLICA_OFF_PLAN, SHARD_OFF_PLAN[0]], '505'),
    ).rejects.toThrow('plan destroys protected data');
    expect(rows.at(-1)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('postgres_shard[0]'),
    });
  });

  it("row 9 class: an item whose automatic «Вкл» failed after creating it is still the automation's own", async () => {
    // Prod 12.11: every automatic «Вкл» of the search domain failed on Redis;
    // the first one created the domain, the later plans touched nothing of it.
    const { seed, runFor } = make({ pressures: [] });
    seed({
      item: 'aws.opensearch',
      to: 'on',
      status: 'failed',
      by: SYSTEM_ACTOR_ID,
      at: '2026-11-12T07:50:00Z',
      plan: [
        {
          address: 'module.stack.module.growth.aws_opensearch_domain.search[0]',
          action: 'create',
        },
      ],
    });
    seed({
      item: 'aws.opensearch',
      to: 'on',
      status: 'failed',
      by: SYSTEM_ACTOR_ID,
      at: '2026-11-12T11:55:00Z',
      plan: [
        {
          address: 'module.stack.aws_elasticache_replication_group.redis',
          action: 'update',
        },
      ],
    });
    const from = new Date('2026-11-12T12:00:00Z');
    const first = await runFor(from, 80);
    expect(first?.want).toMatchObject({ id: 'aws.opensearch', to: 'off' });
    console.log(
      `row 9 class: search domain off started at ${first!.at.toISOString()}`,
    );
  });

  it('a request left active by a cancelled run does not hold «Авто» back for ever', async () => {
    const { seed, runFor, rows } = make({ pressures: ['replica_idle'] });
    seed({
      item: 'aws.rds_replicas',
      to: 'on',
      status: 'done',
      by: SYSTEM_ACTOR_ID,
      at: REPLICA_ON,
    });
    // Prod 13.11 01:24 UTC: an infra-apply run was cancelled mid-way.
    seed({
      item: 'aws.graviton_spot',
      to: 'on',
      status: 'done',
      active: 'applying',
      by: OWNER,
      at: '2026-11-13T01:24:28Z',
    });
    const first = await runFor(T0, 80);
    expect(first?.want).toMatchObject({ id: 'aws.rds_replicas', to: 'off' });
    expect(rows.find((r) => r.item_id === 'aws.graviton_spot')?.status).toBe(
      'failed',
    );
  });
});
