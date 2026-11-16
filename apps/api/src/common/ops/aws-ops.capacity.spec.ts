import {
  DescribeScalableTargetsCommand,
  DescribeScheduledActionsCommand,
  PutScheduledActionCommand,
  RegisterScalableTargetCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { AwsOpsService } from './aws-ops.service';

/**
 * Owner 15.11 («надеюсь я могу настраивать количество серверов авто спот и
 * тд … сделай настраиваемыми»): the floor per service is applied by the API
 * on save (RegisterScalableTarget MinCapacity, the morning-up schedule
 * follows); the Spot split goes to the spot-fallback Lambda (one writer).
 */
describe('AwsOpsService: admin floor and Spot split', () => {
  const env: Record<string, string> = {
    OPS_ECS_CLUSTER: 'c',
    OPS_API_SERVICE: 'api',
    OPS_WORKER_SERVICE: 'worker',
    OPS_API_ADMIN_SERVICE: 'api-admin',
    OPS_ADMIN_SERVICE: 'admin',
    OPS_POOLER_SERVICE: 'pgbouncer',
  };
  const TARGETS: Record<string, { MinCapacity: number; MaxCapacity: number }> =
    {
      'service/c/api': { MinCapacity: 2, MaxCapacity: 4 },
      'service/c/worker': { MinCapacity: 1, MaxCapacity: 2 },
      'service/c/pgbouncer': { MinCapacity: 1, MaxCapacity: 2 },
    };

  function svc(opts: { denySchedule?: boolean } = {}) {
    const s = new AwsOpsService({ get: (k: string) => env[k] } as never);
    const sent: unknown[] = [];
    const send = jest.fn((cmd: unknown) => {
      sent.push(cmd);
      if (cmd instanceof DescribeScalableTargetsCommand) {
        const id = cmd.input.ResourceIds?.[0] ?? '';
        const t = TARGETS[id];
        return Promise.resolve({
          ScalableTargets: t ? [{ ResourceId: id, ...t }] : [],
        });
      }
      if (cmd instanceof DescribeScheduledActionsCommand) {
        if (opts.denySchedule) {
          return Promise.reject(new Error('AccessDenied'));
        }
        return Promise.resolve({
          ScheduledActions:
            cmd.input.ResourceId === 'service/c/api'
              ? [
                  {
                    ScheduledActionName: 'lawbid-prod-api-night-down',
                    Schedule: 'cron(0 7 * * ? *)',
                    Timezone: 'UTC',
                    ScalableTargetAction: { MinCapacity: 1 },
                  },
                  {
                    ScheduledActionName: 'lawbid-prod-api-morning-up',
                    Schedule: 'cron(0 12 * * ? *)',
                    Timezone: 'UTC',
                    ScalableTargetAction: { MinCapacity: 2 },
                  },
                ]
              : [],
        });
      }
      return Promise.resolve({});
    });
    (s as unknown as { scaling: { send: typeof send } }).scaling = { send };
    return { s, sent };
  }

  it('sets the floor, lifts a lower ceiling, moves only the morning-up action', async () => {
    const { s, sent } = svc();
    const r = await s.applyMinTasks({
      'api.min_tasks': 5,
      'worker.min_tasks': 1,
      'admin.min_tasks': 2,
    });
    expect(r).toEqual({
      changed: ['api'],
      missing: ['admin'],
      morning: ['api'],
      failed: [],
    });
    const reg = sent.filter(
      (c): c is RegisterScalableTargetCommand =>
        c instanceof RegisterScalableTargetCommand,
    );
    expect(reg.map((c) => c.input)).toEqual([
      {
        ServiceNamespace: 'ecs',
        ScalableDimension: 'ecs:service:DesiredCount',
        ResourceId: 'service/c/api',
        MinCapacity: 5,
        MaxCapacity: 5,
      },
    ]);
    const put = sent.filter(
      (c): c is PutScheduledActionCommand =>
        c instanceof PutScheduledActionCommand,
    );
    expect(put).toHaveLength(1);
    expect(put[0].input).toMatchObject({
      ScheduledActionName: 'lawbid-prod-api-morning-up',
      Schedule: 'cron(0 12 * * ? *)',
      Timezone: 'UTC',
      ScalableTargetAction: { MinCapacity: 5 },
    });
  });

  it('a floor inside the ceiling keeps the ceiling as it is', async () => {
    const { s, sent } = svc();
    await s.applyMinTasks({ 'pgbouncer.min_tasks': 2 });
    const reg = sent.find(
      (c): c is RegisterScalableTargetCommand =>
        c instanceof RegisterScalableTargetCommand,
    );
    expect(reg?.input.MinCapacity).toBe(2);
    expect(reg?.input.MaxCapacity).toBeUndefined();
  });

  it('a refused schedule call is reported, the floor still changes', async () => {
    const { s } = svc({ denySchedule: true });
    const r = await s.applyMinTasks({ 'api.min_tasks': 3 });
    expect(r.changed).toEqual(['api']);
    expect(r.failed).toEqual(['api.morning']);
  });

  it('off AWS: nothing is called', async () => {
    const s = new AwsOpsService({ get: () => undefined } as never);
    expect(await s.applyMinTasks({ 'api.min_tasks': 3 })).toEqual({
      changed: [],
      missing: [],
      morning: [],
      failed: [],
    });
  });

  it('spotSplits: only services the admin set, by ECS service name, defaults filled', () => {
    const { s } = svc();
    expect(
      s.spotSplits({
        'api_admin.spot_weight': 0,
        'pgbouncer.spot_base': 2,
        'api.min_tasks': 3,
      }),
    ).toEqual({
      'api-admin': { base: 1, fargate: 1, spot: 0 },
      pgbouncer: { base: 2, fargate: 1, spot: 4 },
    });
  });
});
