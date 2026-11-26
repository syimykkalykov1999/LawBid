import {
  DescribeScalingPoliciesCommand,
  GetPredictiveScalingForecastCommand,
  PutScalingPolicyCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { ConfigService } from '@nestjs/config';
import {
  PREDICTIVE_NOTE_KEY,
  PredictiveScalingService,
  toCloudWatchQueries,
} from './predictive-scaling.service';

const NOW = new Date('2026-11-25T10:30:00Z');
const H = 3_600_000;
const POLICY = {
  api: {
    name: 'lawbid-prod-api-predictive',
    resource_id: 'service/lawbid-prod/api',
    dimension: 'ecs:service:DesiredCount',
  },
};
const LOAD_QUERIES = [
  {
    Id: 'rb',
    ReturnData: false,
    MetricStat: {
      Stat: 'Sum',
      Metric: {
        Namespace: 'AWS/ApplicationELB',
        MetricName: 'RequestCount',
        Dimensions: [{ Name: 'TargetGroup', Value: 'targetgroup/api/1' }],
      },
    },
  },
  { Id: 'load', Expression: 'FILL(rb, 0)', ReturnData: true },
];

function setup(o: {
  setting: string;
  mode?: string;
  error?: number;
  days?: number;
}) {
  const env: Record<string, string> = {
    OPS_ECS_PREDICTIVE_POLICIES: JSON.stringify(POLICY),
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const redis = {
    set: jest.fn(() => Promise.resolve<string | null>('OK')),
  };
  const nums: Record<string, number> = {
    'infra.predictive_max_error_pct': 20,
    'infra.predictive_good_days': 3,
    'infra.predictive_check_minutes': 60,
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(o.setting)),
    number: jest.fn((k: string) => Promise.resolve(nums[k])),
  };
  const svc = new PredictiveScalingService(
    config,
    redis as never,
    settings as never,
  );
  const live = {
    Mode: o.mode ?? 'ForecastOnly',
    SchedulingBufferTime: 300,
    MaxCapacityBreachBehavior: 'HonorMaxCapacity',
    MetricSpecifications: [
      {
        TargetValue: 3000,
        CustomizedLoadMetricSpecification: { MetricDataQueries: LOAD_QUERIES },
      },
    ],
  };
  const days = o.days ?? 4;
  const start = Date.parse('2026-11-25T00:00:00Z') - days * 24 * H;
  const ts = Array.from(
    { length: days * 24 },
    (_, i) => new Date(start + i * H),
  );
  const err = o.error ?? 5;
  const scalingReply = (cmd: unknown): unknown => {
    if (cmd instanceof DescribeScalingPoliciesCommand) {
      return {
        ScalingPolicies: [{ PredictiveScalingPolicyConfiguration: live }],
      };
    }
    if (cmd instanceof GetPredictiveScalingForecastCommand) {
      return {
        LoadForecast: [{ Timestamps: ts, Values: ts.map(() => 100 + err) }],
      };
    }
    return {};
  };
  const cwReply = (cmd: unknown): unknown =>
    cmd instanceof GetMetricDataCommand
      ? {
          MetricDataResults: [
            { Id: 'load', Timestamps: ts, Values: ts.map(() => 100) },
          ],
        }
      : {};
  const scalingSend = jest.fn((cmd: unknown) =>
    Promise.resolve(scalingReply(cmd)),
  );
  const cwSend = jest.fn((cmd: unknown) => Promise.resolve(cwReply(cmd)));
  Object.assign(svc as unknown as Record<string, unknown>, {
    scaling: { send: scalingSend },
    cw: { send: cwSend },
  });
  return { svc, scalingSend, cwSend, redis, live };
}

const puts = (send: jest.Mock<Promise<unknown>, [unknown]>) =>
  send.mock.calls
    .map((c) => c[0])
    .filter(
      (c): c is PutScalingPolicyCommand => c instanceof PutScalingPolicyCommand,
    );

describe('PredictiveScalingService.check', () => {
  it('auto: after N good days the policy goes ForecastAndScale, the rest of the live config kept', async () => {
    const t = setup({ setting: 'auto', error: 5 });
    const r = await t.svc.check(NOW);
    expect(r.api).toMatchObject({
      mode: 'ForecastAndScale',
      reason: 'auto_good_days',
      changed: true,
    });
    const [put] = puts(t.scalingSend);
    expect(put.input).toMatchObject({
      PolicyName: 'lawbid-prod-api-predictive',
      PolicyType: 'PredictiveScaling',
      PredictiveScalingPolicyConfiguration: {
        ...t.live,
        Mode: 'ForecastAndScale',
      },
    });
    expect(t.redis.set).toHaveBeenCalledWith(
      PREDICTIVE_NOTE_KEY,
      expect.stringContaining('добавляет серверы заранее'),
      'EX',
      expect.any(Number),
    );
  });

  it('auto: a forecast 30 % off stays forecast only, no write to AWS', async () => {
    const t = setup({ setting: 'auto', error: 30 });
    const r = await t.svc.check(NOW);
    expect(r.api).toMatchObject({ mode: 'ForecastOnly', changed: false });
    expect(puts(t.scalingSend)).toHaveLength(0);
  });

  it('forecast (Выкл) brings a scaling policy back to forecast only', async () => {
    const t = setup({ setting: 'forecast', mode: 'ForecastAndScale' });
    await t.svc.check(NOW);
    expect(
      puts(t.scalingSend)[0].input.PredictiveScalingPolicyConfiguration?.Mode,
    ).toBe('ForecastOnly');
  });

  it("the actual load is read with the policy's own queries, hourly", async () => {
    const t = setup({ setting: 'auto' });
    await t.svc.check(NOW);
    const q = (t.cwSend.mock.calls[0][0] as GetMetricDataCommand).input
      .MetricDataQueries!;
    expect(q.find((x) => x.Id === 'rb')?.MetricStat?.Period).toBe(3600);
    expect(q.find((x) => x.Id === 'load')?.Expression).toBe('FILL(rb, 0)');
  });

  it('another task holds the pass: nothing is read or written', async () => {
    const t = setup({ setting: 'on' });
    t.redis.set.mockResolvedValueOnce(null);
    expect(await t.svc.check(NOW)).toEqual({});
    expect(t.scalingSend).not.toHaveBeenCalled();
  });
});

describe('toCloudWatchQueries', () => {
  it('keeps ids, expressions and dimensions and adds the hourly period', () => {
    const out = toCloudWatchQueries(LOAD_QUERIES);
    expect(out[0]).toMatchObject({
      Id: 'rb',
      ReturnData: false,
      MetricStat: {
        Stat: 'Sum',
        Period: 3600,
        Metric: {
          MetricName: 'RequestCount',
          Dimensions: [{ Name: 'TargetGroup', Value: 'targetgroup/api/1' }],
        },
      },
    });
    expect(out[1]).toEqual({
      Id: 'load',
      Label: undefined,
      ReturnData: true,
      Expression: 'FILL(rb, 0)',
    });
  });
});
