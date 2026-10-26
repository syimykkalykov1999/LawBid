import { emfLine, RuntimeStatsService } from './runtime-stats.service';

describe('runtime stats', () => {
  it('writes valid CloudWatch Embedded Metric Format', () => {
    const line = JSON.parse(
      emfLine(
        'api',
        {
          EventLoopP50Ms: 1,
          EventLoopP99Ms: 12.5,
          EventLoopMaxMs: 80,
          HeapUsedMb: 300,
          HeapLimitMb: 1400,
          RssMb: 600,
          ThreadPoolLagMs: 0.4,
        },
        1_700_000_000_000,
      ),
    ) as {
      _aws: {
        Timestamp: number;
        CloudWatchMetrics: {
          Namespace: string;
          Dimensions: string[][];
          Metrics: { Name: string }[];
        }[];
      };
      Service: string;
      EventLoopP99Ms: number;
    };
    const m = line._aws.CloudWatchMetrics[0];
    expect(m.Namespace).toBe('LawBid/Runtime');
    expect(m.Dimensions).toEqual([['Service']]);
    // Every declared metric has a value on the line (EMF requirement).
    for (const { Name } of m.Metrics) {
      expect(typeof (line as unknown as Record<string, unknown>)[Name]).toBe(
        'number',
      );
    }
    expect(line.Service).toBe('api');
    expect(line.EventLoopP99Ms).toBe(12.5);
  });

  it('measures a blocked event loop', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const s = new RuntimeStatsService();
    s.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 60));
    const end = Date.now() + 150;
    while (Date.now() < end) {
      /* block the loop on purpose */
    }
    await new Promise((r) => setTimeout(r, 60));
    const sample = s.sample();
    s.onApplicationShutdown();
    process.env.NODE_ENV = prev;
    expect(sample).not.toBeNull();
    expect(sample!.EventLoopMaxMs).toBeGreaterThan(50);
    expect(sample!.HeapLimitMb).toBeGreaterThan(100);
  });
});
