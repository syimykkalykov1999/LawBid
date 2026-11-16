import { AwsCapacityService } from './aws-capacity.service';

/** Owner 15.11 («Сейчас» on «Масштаб»): the Redis node count and the read
 * copies come from the reads the capacity snapshot already makes. */
const NOW = new Date('2026-11-15T12:00:00Z');

function make(env: Record<string, string>) {
  const svc = new AwsCapacityService(
    { get: (k: string) => env[k] } as never,
    undefined,
    {
      hget: jest.fn().mockResolvedValue(null),
      info: jest.fn().mockResolvedValue(''),
    } as never,
  );
  const cw = jest.fn();
  const rds = jest.fn();
  const cache = jest.fn();
  Object.assign(svc as unknown as Record<string, unknown>, {
    cw: { send: cw },
    rds: { send: rds },
    cache: { send: cache },
  });
  return { svc, cw, rds, cache };
}

describe('AwsCapacityService: what runs now', () => {
  it('info: Redis node type and node count from one DescribeReplicationGroups', async () => {
    const { svc, rds, cache } = make({
      OPS_DB_INSTANCE: 'db',
      OPS_REDIS_GROUP: 'redis',
    });
    rds.mockResolvedValue({
      DBInstances: [
        {
          DBInstanceClass: 'db.t4g.medium',
          AllocatedStorage: 20,
          MultiAZ: false,
        },
      ],
    });
    cache.mockResolvedValue({
      ReplicationGroups: [
        {
          CacheNodeType: 'cache.t4g.small',
          MemberClusters: ['redis-001', 'redis-002'],
          NodeGroups: [
            {
              NodeGroupMembers: [
                { CacheClusterId: 'redis-001', CurrentRole: 'primary' },
              ],
            },
          ],
        },
      ],
    });
    expect(await svc.info()).toEqual({
      dbClass: 'db.t4g.medium',
      dbStorageGb: 20,
      dbMultiAz: false,
      redisClass: 'cache.t4g.small',
      redisNodes: 2,
    });
    expect(cache).toHaveBeenCalledTimes(1);
  });

  it('info: no Redis group here = no node count', async () => {
    const { svc } = make({});
    expect((await svc.info()).redisNodes).toBeNull();
  });

  it('metrics: replicaCount = the read copies that report CPU', async () => {
    const { svc, cw, rds } = make({ OPS_DB_INSTANCE: 'db' });
    rds.mockResolvedValue({
      DBInstances: [{ DBInstanceClass: 'db.t4g.medium' }],
    });
    cw.mockImplementation(
      (cmd: { input: { Dimensions?: { Value: string }[] } }) => {
        const id = cmd.input.Dimensions?.[0]?.Value ?? '';
        const has =
          id === 'db' || id === 'db-replica-1' || id === 'db-replica-2';
        return Promise.resolve({
          Datapoints: has
            ? [{ Timestamp: new Date(NOW.getTime() - 5 * 60_000), Average: 10 }]
            : [],
        });
      },
    );
    const m = await svc.metrics(NOW);
    expect(m.replicaCount).toBe(2);
  });
});
