import { DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { AwsOpsService, serviceNow } from './aws-ops.service';

/** Owner 15.11 («Сейчас» next to every «Авто» on «Масштаб»): every ECS
 * service with running / desired tasks and Spot, from the cached report. */
describe('AwsOpsService.taskCounts: every service now', () => {
  const env: Record<string, string> = {
    OPS_ECS_CLUSTER: 'lawbid-prod',
    OPS_API_SERVICE: 'api',
    OPS_WORKER_SERVICE: 'worker',
    OPS_API_ADMIN_SERVICE: 'api-admin',
    OPS_ADMIN_SERVICE: 'admin',
    OPS_POOLER_SERVICE: 'pgbouncer',
  };
  const spot = [
    { capacityProvider: 'FARGATE', weight: 1, base: 1 },
    { capacityProvider: 'FARGATE_SPOT', weight: 4 },
  ];

  function svc(otherFails = false) {
    const s = new AwsOpsService({ get: (k: string) => env[k] } as never);
    const calls: string[][] = [];
    const send = jest.fn((cmd: unknown) => {
      const names = (cmd as DescribeServicesCommand).input.services ?? [];
      calls.push(names);
      if (names.includes('api')) {
        return Promise.resolve({
          services: [
            {
              serviceName: 'api',
              runningCount: 2,
              desiredCount: 3,
              capacityProviderStrategy: spot,
            },
            {
              serviceName: 'worker',
              runningCount: 1,
              desiredCount: 1,
              launchType: 'FARGATE',
            },
          ],
        });
      }
      if (otherFails) return Promise.reject(new Error('AccessDenied'));
      return Promise.resolve({
        services: [
          {
            serviceName: 'api-admin',
            runningCount: 1,
            desiredCount: 1,
            capacityProviderStrategy: spot,
          },
          {
            serviceName: 'admin',
            runningCount: 1,
            desiredCount: 1,
            capacityProviderStrategy: spot,
          },
          { serviceName: 'pgbouncer', runningCount: 2, desiredCount: 2 },
        ],
      });
    });
    (s as unknown as { ecs: { send: typeof send } }).ecs = { send };
    // Owner 15.11: floor / ceiling from Application Auto Scaling.
    const scalingSend = jest.fn(() =>
      Promise.resolve({
        ScalableTargets: [
          {
            ResourceId: 'service/lawbid-prod/api',
            MinCapacity: 2,
            MaxCapacity: 6,
          },
          {
            ResourceId: 'service/lawbid-prod/worker',
            MinCapacity: 1,
            MaxCapacity: 3,
          },
        ],
      }),
    );
    (s as unknown as { scaling: { send: typeof scalingSend } }).scaling = {
      send: scalingSend,
    };
    return { s, calls };
  }

  it('lists all five services with Spot, api / worker counts unchanged', async () => {
    const { s, calls } = svc();
    const r = await s.taskCounts();
    expect(r?.api).toEqual({ running: 2, desired: 3 });
    expect(r?.worker).toEqual({ running: 1, desired: 1 });
    const strat = { base: 1, fargateWeight: 1, spotWeight: 4 };
    const none = { base: null, fargateWeight: null, spotWeight: null };
    const noTarget = { min: null, max: null };
    expect(r?.services).toEqual([
      {
        kind: 'api',
        running: 2,
        desired: 3,
        spot: true,
        ...strat,
        min: 2,
        max: 6,
      },
      {
        kind: 'worker',
        running: 1,
        desired: 1,
        spot: false,
        ...none,
        min: 1,
        max: 3,
      },
      {
        kind: 'api_admin',
        running: 1,
        desired: 1,
        spot: true,
        ...strat,
        ...noTarget,
      },
      {
        kind: 'admin',
        running: 1,
        desired: 1,
        spot: true,
        ...strat,
        ...noTarget,
      },
      {
        kind: 'pgbouncer',
        running: 2,
        desired: 2,
        spot: null,
        ...none,
        ...noTarget,
      },
    ]);
    expect(calls).toEqual([
      ['api', 'worker'],
      ['api-admin', 'admin', 'pgbouncer'],
    ]);
  });

  it('a refused read of the other three keeps api / worker as before', async () => {
    const { s } = svc(true);
    const r = await s.taskCounts();
    expect(r?.api).toEqual({ running: 2, desired: 3 });
    expect(r?.services.map((x) => x.kind)).toEqual(['api', 'worker']);
  });

  it('off AWS: null', async () => {
    const s = new AwsOpsService({ get: () => undefined } as never);
    expect(await s.taskCounts()).toBeNull();
  });

  it('serviceNow: Spot only when FARGATE_SPOT has a weight', () => {
    expect(
      serviceNow('api', {
        capacityProviderStrategy: [
          { capacityProvider: 'FARGATE', weight: 1 },
          { capacityProvider: 'FARGATE_SPOT', weight: 0 },
        ],
      }).spot,
    ).toBe(false);
  });
});
