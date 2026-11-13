import {
  DescribeScalableTargetsCommand,
  RegisterScalableTargetCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { AwsOpsService } from './aws-ops.service';

/** G1 (automation audit 2026-11-08): the economy tick changes only the
 * ceiling and never overwrites the floor Terraform / the night schedule set. */
describe('AwsOpsService ceilings keep the live floor (G1)', () => {
  const env: Record<string, string> = {
    OPS_ECS_CLUSTER: 'lawbid-prod',
    OPS_API_SERVICE: 'api',
    OPS_WORKER_SERVICE: 'worker',
    OPS_API_MAX_TASKS: '50',
    OPS_WORKER_MAX_TASKS: '20',
    OPS_MIN_TASKS: '1',
    OPS_API_ADMIN_SERVICE: 'api-admin',
    OPS_ADMIN_SERVICE: 'admin',
    OPS_POOLER_SERVICE: 'pgbouncer',
  };
  let live: Record<string, { min: number; max: number } | undefined>;
  let sent: Record<string, unknown>[];

  function svc(): AwsOpsService {
    const s = new AwsOpsService({ get: (k: string) => env[k] } as never);
    const send = jest.fn((cmd: unknown) => {
      if (cmd instanceof DescribeScalableTargetsCommand) {
        const id = cmd.input.ResourceIds![0];
        const t = live[id.split('/').pop()!];
        return Promise.resolve({
          ScalableTargets: t
            ? [{ ResourceId: id, MinCapacity: t.min, MaxCapacity: t.max }]
            : [],
        });
      }
      if (cmd instanceof RegisterScalableTargetCommand) {
        sent.push({ ...cmd.input });
      }
      return Promise.resolve({});
    });
    (s as unknown as { scaling: { send: typeof send } }).scaling = { send };
    return s;
  }

  beforeEach(() => {
    live = { api: { min: 2, max: 10 }, worker: { min: 1, max: 4 } };
    sent = [];
  });

  it('a new ceiling never sends MinCapacity for a registered target', async () => {
    await svc().setCeilings({ api: 15, worker: 6 });
    expect(sent).toEqual([
      expect.objectContaining({
        ResourceId: 'service/lawbid-prod/api',
        MaxCapacity: 15,
      }),
      expect.objectContaining({
        ResourceId: 'service/lawbid-prod/worker',
        MaxCapacity: 6,
      }),
    ]);
    for (const c of sent) expect(c).not.toHaveProperty('MinCapacity');
  });

  it('the ceiling stays at or above the live floor (day floor 2)', async () => {
    await svc().setCeilings({ api: 1, worker: 1 });
    expect(sent[0]).toMatchObject({ MaxCapacity: 2 });
  });

  it("no upper bound: the owner's number goes above the Terraform start ceiling (row 67)", async () => {
    await svc().setCeilings({ api: 500, worker: 500 });
    expect(sent.map((c) => c.MaxCapacity)).toEqual([500, 500]);
  });

  it('nothing is written when the ceiling is already right', async () => {
    await svc().setCeilings({ api: 10, worker: 4 });
    expect(sent).toEqual([]);
  });

  it("'min' drops the ceiling to the live floor without touching it", async () => {
    await svc().setScale('min');
    expect(sent).toEqual([
      expect.objectContaining({
        ResourceId: 'service/lawbid-prod/api',
        MaxCapacity: 2,
      }),
      expect.objectContaining({
        ResourceId: 'service/lawbid-prod/worker',
        MaxCapacity: 1,
      }),
    ]);
    for (const c of sent) expect(c).not.toHaveProperty('MinCapacity');
  });

  it('a target not registered yet gets the floor from OPS_MIN_TASKS', async () => {
    live.worker = undefined;
    await svc().setCeilings({ api: 10, worker: 3 });
    expect(sent).toEqual([
      expect.objectContaining({
        ResourceId: 'service/lawbid-prod/worker',
        MinCapacity: 1,
        MaxCapacity: 3,
      }),
    ]);
  });

  it("the other services get the owner's ceiling, never a floor (row 67)", async () => {
    live = {
      'api-admin': { min: 1, max: 2 },
      admin: { min: 2, max: 2 },
      pgbouncer: { min: 2, max: 4 },
    };
    const out = await svc().setOtherCeilings({
      api_admin: 100,
      admin: 100,
      pgbouncer: 250,
    });
    expect(out).toEqual({ api_admin: 100, admin: 100, pgbouncer: 250 });
    expect(sent.map((c) => [c.ResourceId, c.MaxCapacity])).toEqual([
      ['service/lawbid-prod/api-admin', 100],
      ['service/lawbid-prod/admin', 100],
      ['service/lawbid-prod/pgbouncer', 250],
    ]);
    for (const c of sent) expect(c).not.toHaveProperty('MinCapacity');
  });

  it('a service Terraform did not register (no pooler) is skipped', async () => {
    live = { admin: { min: 2, max: 100 } };
    const out = await svc().setOtherCeilings({ admin: 100, pgbouncer: 100 });
    expect(out).toEqual({ admin: 100 });
    expect(sent).toEqual([]);
  });
});
