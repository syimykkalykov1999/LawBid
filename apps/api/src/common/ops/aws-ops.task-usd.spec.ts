import { AwsOpsService } from './aws-ops.service';

const svc = (env: Record<string, string>) =>
  new AwsOpsService({ get: (k: string) => env[k] } as never);

describe('AwsOpsService.taskUsd (S9-7)', () => {
  it('full price on x86 on-demand', () => {
    expect(svc({ OPS_API_TASK_USD: '18' }).taskUsd('api')).toBe(18);
  });
  it('ARM64 ×0.8, Spot ×0.45, both multiply, per service', () => {
    const e = {
      OPS_API_TASK_USD: '20',
      OPS_WORKER_TASK_USD: '30',
      OPS_CPU_ARCH: 'ARM64',
      OPS_API_SPOT: 'on',
      OPS_WORKER_SPOT: 'off',
    };
    expect(svc(e).taskUsd('api')).toBe(7.2);
    expect(svc(e).taskUsd('worker')).toBe(24);
  });
  it('factors can be overridden from env', () => {
    expect(
      svc({
        OPS_API_TASK_USD: '10',
        OPS_API_SPOT: 'on',
        OPS_SPOT_PRICE_FACTOR: '0.5',
      }).taskUsd('api'),
    ).toBe(5);
  });
});
