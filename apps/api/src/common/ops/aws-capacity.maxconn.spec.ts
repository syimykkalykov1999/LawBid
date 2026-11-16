import { AwsCapacityService } from './aws-capacity.service';
import { pressures } from '../economy/economy.rules';

/**
 * 16.11 real load test (KNOWN_ERRORS 187): 146 connections on a db.t4g.small
 * whose live max_connections is 181 (81 %). The class formula said 225
 * (65 %), so «Авто» did not see the pressure. The live setting wins.
 */
const NOW = new Date('2026-11-16T18:05:00Z');

function make(liveMax: number | null) {
  const query = jest
    .fn()
    .mockResolvedValue(
      liveMax == null ? [] : [{ connections: 140, max: liveMax }],
    );
  const svc = new AwsCapacityService(
    { get: (k: string) => ({ OPS_DB_INSTANCE: 'db' })[k] } as never,
    { global: () => ({ $queryRaw: query }) } as never,
    {
      hget: jest.fn().mockResolvedValue(null),
      info: jest.fn().mockResolvedValue(''),
    } as never,
  );
  const cw = jest
    .fn()
    .mockImplementation((cmd: { input: { MetricName?: string } }) =>
      Promise.resolve({
        Datapoints:
          cmd.input.MetricName === 'DatabaseConnections'
            ? [{ Average: 146, Timestamp: NOW }]
            : [{ Average: 5, Timestamp: NOW }],
      }),
    );
  const rds = jest.fn().mockResolvedValue({
    DBInstances: [{ DBInstanceClass: 'db.t4g.small' }],
  });
  Object.assign(svc as unknown as Record<string, unknown>, {
    cw: { send: cw },
    rds: { send: rds },
    cache: { send: jest.fn().mockResolvedValue({}) },
  });
  return svc;
}

describe('AwsCapacityService: database connection limit', () => {
  it('uses the live max_connections (181), so 146 is above the 80 % line', async () => {
    const m = await make(181).metrics(NOW);
    expect(m.dbMaxConnections).toBe(181);
    expect(pressures(m).map((p) => p.kind)).toContain('db_connections');
  });

  it('falls back to the class formula when the database does not answer', async () => {
    const m = await make(null).metrics(NOW);
    expect(m.dbMaxConnections).toBe(225);
  });
});
