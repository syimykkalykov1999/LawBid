import {
  compareValkey,
  nodeMonthlyUsd,
  serverlessMonthlyUsd,
  valkeyNote,
  type ValkeyDayLoad,
} from './valkey-serverless.logic';
import { dayLoads } from './valkey-serverless.service';

// AWS ElastiCache pricing, us-east-1, read 25.11.2026.
const P = { gbHourUsd: 0.084, millionEcpuUsd: 0.0023, ecpuFactor: 1.5 };
const day = (i: number, gb: number, cps: number): ValkeyDayLoad => ({
  day: `2026-11-${String(10 + i).padStart(2, '0')}`,
  gbStored: gb,
  commandsPerSec: cps,
  bytesPerSec: cps * 200,
});

describe('Valkey: nodes vs Serverless prices (item 29)', () => {
  it('Serverless bills at least 100 MB and ECPU per KB / per command', () => {
    // 0.05 GB is billed as 0.1 GB: 0.1 x 0.084 x 730 = $6.13.
    expect(
      serverlessMonthlyUsd(
        { gbStored: 0.05, commandsPerSec: 0, bytesPerSec: 0 },
        P,
      ),
    ).toEqual({
      storageUsd: 6.13,
      ecpuUsd: 0,
      totalUsd: 6.13,
    });
    // 100 commands/s x 1.5 = 150 ECPU/s -> 394.2 M ECPU a month -> $0.91.
    expect(
      serverlessMonthlyUsd(
        { gbStored: 1, commandsPerSec: 100, bytesPerSec: 0 },
        P,
      ).ecpuUsd,
    ).toBe(0.91);
    // Big values: bytes / 1 KB wins over the command count.
    expect(
      serverlessMonthlyUsd(
        { gbStored: 1, commandsPerSec: 10, bytesPerSec: 1024 * 1000 },
        P,
      ).ecpuUsd,
    ).toBe(6.04);
  });

  it('node prices are the redis-autoscale ladder (Valkey, on demand)', () => {
    expect(nodeMonthlyUsd('cache.t4g.micro', 1)).toBe(9.34);
    expect(nodeMonthlyUsd('cache.r7g.large', 2)).toBe(255.79);
    expect(nodeMonthlyUsd('cache.x99.huge', 1)).toBeNull();
  });

  it('today-size load (0.08 GB, 30 commands/s) on one t4g.micro: Serverless is cheaper every day', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i, 0.08, 30));
    const v = compareValkey(days, 'cache.t4g.micro', 1, P, 10, 7);
    expect(v.verdict).toBe('serverless');
    expect(v.nodeUsd).toBe(9.34);
    expect(v.serverlessUsd).toBeLessThan(8.41); // under the 10 % line
    expect(valkeyNote(v, 7)).toContain('пора переходить');
  });

  it('10x (2 GB on a t4g.medium pair) and 100x (20 GB on an r7g.xlarge pair): nodes win', () => {
    const ten = Array.from({ length: 7 }, (_, i) => day(i, 2, 300));
    expect(compareValkey(ten, 'cache.t4g.medium', 2, P, 10, 7).verdict).toBe(
      'nodes',
    );
    const hundred = Array.from({ length: 7 }, (_, i) => day(i, 20, 3000));
    expect(
      compareValkey(hundred, 'cache.r7g.xlarge', 2, P, 10, 7).verdict,
    ).toBe('nodes');
  });

  it('one expensive day keeps the nodes; too few days = no verdict', () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      day(i, i === 3 ? 0.5 : 0.08, 30),
    );
    expect(compareValkey(days, 'cache.t4g.micro', 1, P, 10, 7).verdict).toBe(
      'nodes',
    );
    expect(
      compareValkey(days.slice(0, 3), 'cache.t4g.micro', 1, P, 10, 7).verdict,
    ).toBe('unknown');
  });

  it('hourly CloudWatch points become whole days (today and short days left out)', () => {
    const H = 3_600_000;
    const now = new Date('2026-11-25T08:00:00Z');
    const start = Date.parse('2026-11-23T00:00:00Z');
    const pts = (n: number, v: number) =>
      Array.from({ length: n }, (_, i) => ({ t: new Date(start + i * H), v }));
    const loads = dayLoads(
      { bytes: pts(56, 2e8), cmds: pts(56, 3600), net: pts(56, 3600 * 500) },
      now,
    );
    expect(loads).toEqual([
      { day: '2026-11-23', gbStored: 0.2, commandsPerSec: 1, bytesPerSec: 500 },
      { day: '2026-11-24', gbStored: 0.2, commandsPerSec: 1, bytesPerSec: 500 },
    ]);
  });
});
