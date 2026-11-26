import {
  COST_REGISTRY,
  INFRA_MODE_KEYS,
} from '../../../common/ops/cost-registry';
import { switchFor } from '../../../common/ops/infra-switches';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import {
  CDC_PREPARE_ON_API_TASKS,
  EDGE_ON_API_TASKS,
  TRACING_MIN_REQUESTS,
  TRACING_ON_ERROR_PCT,
  TRACING_ON_P95_MS,
  tracingSignal,
} from './infra-auto-growth.logic';
import {
  AUTO_SCOPE,
  autoApplyBlockers,
  autoWants,
  dueWants,
  type AutoSignals,
} from './infra-auto.logic';

/**
 * Owner 26.11 («автоматизируй их не мучая меня»): the growth items that were
 * a tfvars line each, made «Авто» with the existing mechanism. Thresholds
 * and hysteresis (decision), the ladder, the modes, and the plans «Авто» may
 * apply without the owner's code.
 */
const base = {
  pressures: [],
  budgetRatio: null,
  searchEngine: 'postgres',
  partitionNeedsRunner: false,
} as unknown as AutoSignals;

const allOff = (): 'off' => 'off';
const liveOf =
  (on: string[]) =>
  (id: string): 'on' | 'off' =>
    on.includes(id) ? 'on' : 'off';
const ids = (
  s: AutoSignals,
  live = allOff as (id: string) => 'on' | 'off',
  autoOn = new Set<string>(),
) => autoWants(s, live, autoOn).map((w) => `${w.id}:${w.to}`);

const http = (p95Ms: number | null, errorRatePct = 0, requests = 1000) => ({
  p95Ms,
  errorRatePct,
  requests,
});

describe('growth «Авто»: defaults match the admin settings', () => {
  it('the code defaults are the setting defaults', () => {
    expect(APP_SETTINGS['infra.edge_on_api_tasks']).toBe(EDGE_ON_API_TASKS);
    expect(APP_SETTINGS['infra.tracing_on_p95_ms']).toBe(TRACING_ON_P95_MS);
    expect(APP_SETTINGS['infra.tracing_on_error_pct']).toBe(
      TRACING_ON_ERROR_PCT,
    );
    expect(APP_SETTINGS['infra.tracing_min_requests']).toBe(
      TRACING_MIN_REQUESTS,
    );
    expect(APP_SETTINGS['infra.cdc_prepare_on_api_tasks']).toBe(
      CDC_PREPARE_ON_API_TASKS,
    );
  });

  it('every new row is a registry row with a price, a switch and (except the canary step) a mode', () => {
    for (const id of [
      'aws.alb_balancing',
      'aws.api_canary_prepare',
      'aws.api_canary',
      'aws.tracing',
      'aws.db_logical_replication',
    ]) {
      const e = COST_REGISTRY.find((x) => x.id === id)!;
      expect(e).toBeDefined();
      expect(e.price.sourceUrl).toMatch(/^https:\/\//);
      expect(switchFor(id)).toBeDefined();
      if (id === 'aws.api_canary') {
        expect(e.states).toEqual(['off', 'on']);
        expect(INFRA_MODE_KEYS[id]).toBeUndefined();
        expect(AUTO_SCOPE[id]).toBeUndefined();
      } else {
        expect(e.states).toEqual(['off', 'on', 'auto']);
        expect(
          APP_SETTINGS[INFRA_MODE_KEYS[id] as keyof typeof APP_SETTINGS],
        ).toBe('auto');
        expect(AUTO_SCOPE[id]).toBeDefined();
      }
    }
  });
});

describe('tracing: p95 / 5xx line with a band (hysteresis)', () => {
  it.each([
    [http(600), 'slow'],
    [http(599), 'keep'],
    [http(480), 'keep'],
    [http(479), 'calm'],
    [http(100, 2), 'slow'],
    [http(100, 1), 'keep'],
    [http(100, 0.9), 'calm'],
    // too few requests in 15 minutes: never slow (no noise at night)
    [http(5000, 50, 299), 'calm'],
    [http(null, 0, 0), 'calm'],
  ] as const)('%j -> %s', (w, want) => {
    expect(tracingSignal({ http15: w })).toBe(want);
  });

  it('unknown readings switch nothing', () => {
    expect(tracingSignal({ http15: null })).toBeNull();
    expect(ids({ ...base, http15: null })).toEqual([]);
  });

  it('the owner lines from Настройки win over the defaults', () => {
    const s = {
      http15: http(300, 0, 50),
      tracingOnP95Ms: 250,
      tracingMinRequests: 10,
    };
    expect(tracingSignal(s)).toBe('slow');
    expect(
      tracingSignal({ ...s, tracingOnErrorPct: 1, http15: http(10, 1, 50) }),
    ).toBe('slow');
  });

  it('slow switches it on; it waits infra.auto_on_minutes first', () => {
    const wants = autoWants({ ...base, http15: http(900) }, allOff, new Set());
    expect(wants.map((w) => `${w.id}:${w.to}`)).toEqual(['aws.tracing:on']);
    const on = 30 * 60_000;
    const first = dueWants(wants, {}, 0, on, 72 * 3600_000);
    expect(first.due).toEqual([]);
    expect(dueWants(wants, first.seen, on, on, 72 * 3600_000).due).toHaveLength(
      1,
    );
  });

  it('calm takes it off again only when «Авто» owns it; keep holds it', () => {
    const live = liveOf(['aws.tracing']);
    const owned = new Set(['aws.tracing']);
    expect(ids({ ...base, http15: http(100) }, live, owned)).toEqual([
      'aws.tracing:off',
    ]);
    expect(ids({ ...base, http15: http(500) }, live, owned)).toEqual([]);
    // unknown reading: kept
    expect(ids({ ...base, http15: null }, live, owned)).toEqual([]);
    // switched on by hand earlier (not owned, Авто not stored): kept
    expect(ids({ ...base, http15: http(100) }, live, new Set())).toEqual([]);
    // «Вкл» keeps it
    expect(
      ids(
        { ...base, http15: http(100), modes: { 'aws.tracing': 'on' } },
        live,
        owned,
      ),
    ).toEqual([]);
  });

  it('«Выкл» never switches it on', () => {
    expect(
      ids({ ...base, http15: http(5000, 40), modes: { 'aws.tracing': 'off' } }),
    ).toEqual([]);
  });
});

describe('ALB balancing -> canary preparation (api desired count)', () => {
  it('two API tasks switch the balancing on first, then the preparation', () => {
    expect(ids({ ...base, apiDesired: 2 })).toEqual(['aws.alb_balancing:on']);
    expect(
      ids({ ...base, apiDesired: 2 }, liveOf(['aws.alb_balancing'])),
    ).toEqual(['aws.api_canary_prepare:on']);
    expect(
      ids(
        { ...base, apiDesired: 2 },
        liveOf(['aws.alb_balancing', 'aws.api_canary_prepare']),
      ),
    ).toEqual([]);
  });

  it('one task or an unknown count: nothing', () => {
    expect(ids({ ...base, apiDesired: 1 })).toEqual([]);
    expect(ids({ ...base, apiDesired: null })).toEqual([]);
    expect(ids({ ...base, apiDesired: 3, edgeOnApiTasks: 4 })).toEqual([]);
  });

  it('never switched off by itself, also with the load gone', () => {
    const live = liveOf(['aws.alb_balancing', 'aws.api_canary_prepare']);
    const owned = new Set(['aws.alb_balancing', 'aws.api_canary_prepare']);
    expect(ids({ ...base, apiDesired: 1 }, live, owned)).toEqual([]);
  });

  it('the canary step itself is never asked for by «Авто»', () => {
    const live = liveOf(['aws.alb_balancing', 'aws.api_canary_prepare']);
    expect(
      ids({ ...base, apiDesired: 50 }, live).filter((x) =>
        x.startsWith('aws.api_canary:'),
      ),
    ).toEqual([]);
  });

  it('ladder: «Вкл» on the preparation waits for the balancing', () => {
    expect(
      ids({
        ...base,
        modes: { 'aws.api_canary_prepare': 'on', 'aws.alb_balancing': 'off' },
      }),
    ).toEqual([]);
    expect(
      ids({ ...base, apiDesired: 2, modes: { 'aws.alb_balancing': 'off' } }),
    ).toEqual([]);
  });
});

describe('database change log: prepare only, never off', () => {
  it('infra.cdc_prepare_on_api_tasks API tasks prepare it (a cache node alone does not)', () => {
    expect(ids({ ...base, cacheNodeLive: true })).toEqual([]);
    expect(ids({ ...base, apiDesired: 4, edgeOnApiTasks: 99 })).toEqual([
      'aws.db_logical_replication:on',
    ]);
    expect(ids({ ...base, apiDesired: 3, edgeOnApiTasks: 99 })).toEqual([]);
  });

  it('never off by itself', () => {
    const live = liveOf(['aws.db_logical_replication']);
    expect(
      ids({ ...base }, live, new Set(['aws.db_logical_replication'])),
    ).toEqual([]);
  });
});

/** Plans as Terraform names them under infra/envs/prod (module.stack). */
const M = 'module.stack.module.';
const rolling = [
  { address: `${M}ecs.aws_ecs_task_definition.api`, action: 'delete-create' },
  {
    address: `${M}ecs.aws_ecs_task_definition.worker`,
    action: 'delete-create',
  },
  { address: `${M}ecs.aws_ecs_service.api`, action: 'update' },
  { address: `${M}ecs.aws_ecs_service.worker`, action: 'update' },
];

describe('plans «Авто» applies without the owner (and the ones it never does)', () => {
  it('balancing on: socket group + rule created, api group updated in place', () => {
    const plan = [
      ...rolling,
      { address: `${M}alb.aws_lb_target_group.api`, action: 'update' },
      { address: `${M}alb.aws_lb_target_group.api_ws[0]`, action: 'create' },
      { address: `${M}alb.aws_lb_listener_rule.api_ws[0]`, action: 'create' },
      {
        address: `${M}monitoring.aws_cloudwatch_metric_alarm.x`,
        action: 'create',
      },
    ];
    expect(autoApplyBlockers('on', plan, 'aws.alb_balancing')).toEqual([]);
  });

  it('a replaced ECS service or a removed listener rule waits for the owner', () => {
    expect(
      autoApplyBlockers(
        'on',
        [{ address: `${M}ecs.aws_ecs_service.api`, action: 'delete-create' }],
        'aws.alb_balancing',
      ),
    ).toHaveLength(1);
    expect(
      autoApplyBlockers(
        'off',
        [
          {
            address: `${M}alb.aws_lb_listener_rule.api_ws[0]`,
            action: 'delete',
          },
        ],
        'aws.alb_balancing',
      ),
    ).toHaveLength(1);
  });

  it('canary preparation: green group, rule 11, both scaling policies', () => {
    const plan = [
      ...rolling,
      { address: `${M}alb.aws_lb_target_group.api_green[0]`, action: 'create' },
      {
        address: `${M}alb.aws_lb_listener_rule.api_weighted[0]`,
        action: 'create',
      },
      {
        address: `${M}alb.aws_lb_target_group.api_ws_green[0]`,
        action: 'create',
      },
      {
        address: `${M}alb.aws_lb_listener_rule.api_ws_weighted[0]`,
        action: 'create',
      },
      {
        address: `${M}ecs.aws_appautoscaling_policy.api_requests`,
        action: 'update',
      },
      {
        address: `${M}ecs.aws_appautoscaling_policy.api_predictive[0]`,
        action: 'update',
      },
      {
        address: `${M}monitoring.aws_cloudwatch_metric_alarm.api_p95`,
        action: 'update',
      },
    ];
    expect(autoApplyBlockers('on', plan, 'aws.api_canary_prepare')).toEqual([]);
  });

  it('the canary step (rule 10 removed) always waits for the owner', () => {
    const plan = [
      { address: `${M}alb.aws_lb_listener_rule.api[0]`, action: 'delete' },
      { address: `${M}ecs.aws_iam_role.ecs_lb_infra[0]`, action: 'create' },
    ];
    expect(
      autoApplyBlockers('on', plan, 'aws.api_canary').length,
    ).toBeGreaterThan(0);
  });

  it('tracing on and off', () => {
    const on = [
      ...rolling,
      { address: `${M}ecs.aws_iam_role_policy.xray[0]`, action: 'create' },
      {
        address: `${M}ecs.aws_iam_role_policy.split_xray["worker"]`,
        action: 'create',
      },
    ];
    expect(autoApplyBlockers('on', on, 'aws.tracing')).toEqual([]);
    const off = on.map((r) =>
      r.action === 'create' ? { ...r, action: 'delete' } : r,
    );
    expect(autoApplyBlockers('off', off, 'aws.tracing')).toEqual([]);
    // anything else of the stack waits
    expect(
      autoApplyBlockers(
        'on',
        [
          ...on,
          {
            address: `${M}alb.aws_lb_target_group.api_ws[0]`,
            action: 'create',
          },
        ],
        'aws.tracing',
      ),
    ).toHaveLength(1);
  });

  it('database change log: only the parameter groups, never the database', () => {
    const plan = [
      {
        address: `${M}postgres[0].aws_db_parameter_group.pg18[0]`,
        action: 'update',
      },
      {
        address: `${M}postgres[0].aws_db_parameter_group.this`,
        action: 'update',
      },
      {
        address: `${M}monitoring.aws_cloudwatch_metric_alarm.cdc_lag`,
        action: 'create',
      },
    ];
    expect(autoApplyBlockers('on', plan, 'aws.db_logical_replication')).toEqual(
      [],
    );
    expect(
      autoApplyBlockers(
        'on',
        [{ address: `${M}postgres[0].aws_db_instance.this`, action: 'update' }],
        'aws.db_logical_replication',
      ),
    ).toHaveLength(1);
  });
});
