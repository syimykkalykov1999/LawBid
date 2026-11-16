import {
  DescribeScalingPoliciesCommand,
  PutScalingPolicyCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { AwsOpsService } from './aws-ops.service';

/**
 * Owner 14.11: the ECS target-tracking target and pauses from the admin.
 * The API applies them with PutScalingPolicy, keeping each policy's metric;
 * an emptied admin field = the Terraform default from OPS_ECS_SCALING_POLICIES.
 */
describe('AwsOpsService.applyScaling (admin ECS numbers)', () => {
  const POLICIES = {
    api_cpu: {
      name: 'p-api-cpu60',
      resource_id: 'service/c/api',
      dimension: 'ecs:service:DesiredCount',
      target: 60,
      in_s: 600,
      out_s: 180,
    },
    worker_cpu: {
      name: 'p-worker-cpu60',
      resource_id: 'service/c/worker',
      dimension: 'ecs:service:DesiredCount',
      target: 60,
      in_s: 600,
      out_s: 180,
    },
    gone: {
      name: 'p-gone',
      resource_id: 'service/c/x',
      dimension: 'ecs:service:DesiredCount',
      target: 50,
      in_s: 600,
      out_s: 180,
    },
  };
  const env: Record<string, string> = {
    OPS_ECS_CLUSTER: 'c',
    OPS_WORKER_SERVICE: 'worker',
    OPS_ECS_SCALING_POLICIES: JSON.stringify(POLICIES),
  };
  const LIVE: Record<string, Record<string, unknown>> = {
    'p-api-cpu60': {
      TargetValue: 60,
      ScaleInCooldown: 600,
      ScaleOutCooldown: 180,
      PredefinedMetricSpecification: {
        PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
      },
    },
    'p-worker-cpu60': {
      TargetValue: 55,
      ScaleInCooldown: 600,
      ScaleOutCooldown: 180,
      PredefinedMetricSpecification: {
        PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
      },
    },
  };

  function build() {
    const put: Record<string, unknown>[] = [];
    const s = new AwsOpsService({ get: (k: string) => env[k] } as never);
    const send = jest.fn((cmd: unknown) => {
      if (cmd instanceof DescribeScalingPoliciesCommand) {
        const name = cmd.input.PolicyNames![0];
        const cfg = LIVE[name];
        return Promise.resolve({
          ScalingPolicies: cfg
            ? [
                {
                  PolicyName: name,
                  TargetTrackingScalingPolicyConfiguration: cfg,
                },
              ]
            : [],
        });
      }
      if (cmd instanceof PutScalingPolicyCommand) put.push({ ...cmd.input });
      return Promise.resolve({});
    });
    (s as unknown as { scaling: unknown }).scaling = { send };
    return { s, put };
  }

  it('applies the admin numbers, keeps the metric, resets a drifted default, skips what is equal or gone', async () => {
    const { s, put } = build();
    const r = await s.applyScaling({
      'api_cpu.target': 45,
      'api_cpu.out_s': 120,
    });
    expect(r).toEqual({
      changed: ['api_cpu', 'worker_cpu'],
      missing: ['gone'],
    });
    expect(put).toEqual([
      {
        PolicyName: 'p-api-cpu60',
        ServiceNamespace: 'ecs',
        ResourceId: 'service/c/api',
        ScalableDimension: 'ecs:service:DesiredCount',
        PolicyType: 'TargetTrackingScaling',
        TargetTrackingScalingPolicyConfiguration: {
          TargetValue: 45,
          ScaleInCooldown: 600,
          ScaleOutCooldown: 120,
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
        },
      },
      expect.objectContaining({
        PolicyName: 'p-worker-cpu60',
        TargetTrackingScalingPolicyConfiguration: expect.objectContaining({
          TargetValue: 60,
        }),
      }),
    ]);
  });

  it('nothing configured off AWS', async () => {
    const s = new AwsOpsService({ get: () => undefined } as never);
    await expect(s.applyScaling({})).resolves.toEqual({
      changed: [],
      missing: [],
    });
  });
});
