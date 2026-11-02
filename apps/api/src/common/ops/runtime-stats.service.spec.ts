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
    // Only the metrics something reads are billed; the rest stay plain fields.
    expect(m.Metrics.map((x) => x.Name)).toEqual([
      'EventLoopP99Ms',
      'HeapUsedMb',
      'HeapLimitMb',
    ]);
    expect((line as unknown as { RssMb: number }).RssMb).toBe(600);
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

  it('adds OpenSockets only when the gateway registered a gauge', () => {
    const base = {
      EventLoopP50Ms: 1,
      EventLoopP99Ms: 2,
      EventLoopMaxMs: 3,
      HeapUsedMb: 4,
      HeapLimitMb: 5,
      RssMb: 6,
      ThreadPoolLagMs: 0,
    };
    const names = (line: string) =>
      (
        JSON.parse(line) as {
          _aws: { CloudWatchMetrics: { Metrics: { Name: string }[] }[] };
        }
      )._aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
    expect(names(emfLine('worker', base))).not.toContain('OpenSockets');
    const withSockets = emfLine('api', { ...base, OpenSockets: 1234 });
    expect(names(withSockets)).toContain('OpenSockets');
    expect(
      (JSON.parse(withSockets) as { OpenSockets: number }).OpenSockets,
    ).toBe(1234);
  });

  it('samples the registered socket gauge', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const s = new RuntimeStatsService();
    s.onApplicationBootstrap();
    s.registerSocketGauge(() => 42);
    const sample = s.sample();
    s.onApplicationShutdown();
    process.env.NODE_ENV = prev;
    expect(sample?.OpenSockets).toBe(42);
  });
});
