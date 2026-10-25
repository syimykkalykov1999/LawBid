import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  fetchBunnyUsage,
  fetchTurnEgressBytes,
  monthRange,
  usageLevel,
  GB,
} from '../../common/ops/usage/usage-clients';
import type { SecretsService } from '../../common/secrets/secrets.service';
import { UsagePollJob, USAGE_SNAPSHOT_KEY } from './usage-poll.job';

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) }) as never;

describe('usage clients (Batch C items 11 and 16)', () => {
  it('month range is the whole UTC month', () => {
    expect(monthRange(new Date('2026-02-10T12:00:00Z'))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('sums callsTurnUsageAdaptiveGroups egress and sends the account tag', async () => {
    const fetchFn = jest.fn().mockReturnValue(
      json({
        data: {
          viewer: {
            accounts: [
              {
                callsTurnUsageAdaptiveGroups: [
                  { sum: { egressBytes: 2 * GB, ingressBytes: 1 } },
                  { sum: { egressBytes: 3 * GB, ingressBytes: 1 } },
                ],
              },
            ],
          },
        },
      }),
    );
    const out = await fetchTurnEgressBytes(
      'acc1',
      'tok',
      new Date('2026-10-24T00:00:00Z'),
      fetchFn,
    );
    expect(out.egressBytes).toBe(5 * GB);
    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toMatchObject({
      variables: { accountTag: 'acc1', from: '2026-10-01', to: '2026-10-31' },
    });
    expect(init.body).toContain('callsTurnUsageAdaptiveGroups');
  });

  it('GraphQL errors and HTTP errors throw without the token', async () => {
    await expect(
      fetchTurnEgressBytes(
        'a',
        'secret-token',
        new Date(),
        jest.fn().mockReturnValue(json({ errors: [{ message: 'denied' }] })),
      ),
    ).rejects.toThrow('denied');
    await expect(
      fetchTurnEgressBytes(
        'a',
        'secret-token',
        new Date(),
        jest.fn().mockReturnValue(json({}, false, 403)),
      ),
    ).rejects.toThrow('HTTP 403');
  });

  it('reads Bunny statistics and library storage with the account key', async () => {
    const fetchFn = jest
      .fn()
      .mockReturnValueOnce(json({ TotalBandwidthUsed: 7 * GB }))
      .mockReturnValueOnce(json({ StorageUsage: 2 * GB }));
    const out = await fetchBunnyUsage(
      'k',
      '123',
      new Date('2026-10-24T00:00:00Z'),
      fetchFn,
    );
    expect(out).toEqual({ bandwidthBytes: 7 * GB, storageBytes: 2 * GB });
    expect(fetchFn.mock.calls[0][0]).toContain(
      'https://api.bunny.net/statistics?dateFrom=2026-10-01&dateTo=2026-10-31',
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      'https://api.bunny.net/videolibrary/123',
    );
  });

  it('usageLevel: 0 switches a level off', () => {
    expect(usageLevel(699, 700, 950)).toBe('ok');
    expect(usageLevel(700, 700, 950)).toBe('warn');
    expect(usageLevel(950, 700, 950)).toBe('crit');
    expect(usageLevel(5000, 0, 0)).toBe('ok');
  });
});

describe('UsagePollJob', () => {
  function make(secrets: Record<string, Record<string, string>>) {
    const logs: { level: string; obj: Record<string, unknown> }[] = [];
    const logger = {
      setContext: jest.fn(),
      info: (obj: Record<string, unknown>) => logs.push({ level: 'info', obj }),
      warn: (obj: Record<string, unknown>) => logs.push({ level: 'warn', obj }),
    } as unknown as PinoLogger;
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const values: Record<string, number> = {
      'usage.cloudflare_egress_warn_gb': 700,
      'usage.cloudflare_egress_crit_gb': 950,
      'usage.bunny_bandwidth_warn_gb': 1000,
      'usage.bunny_bandwidth_crit_gb': 2000,
      'usage.bunny_storage_warn_gb': 200,
      'usage.bunny_storage_crit_gb': 500,
    };
    const job = new UsagePollJob(
      {
        get: (p: string) =>
          Promise.resolve(secrets[p] ? { fields: secrets[p] } : null),
      } as unknown as SecretsService,
      {
        number: (k: string) => Promise.resolve(values[k]),
      } as unknown as AppSettingsService,
      { get: () => undefined } as unknown as ConfigService,
      redis as unknown as Redis,
      logger,
    );
    return { job, logs, redis };
  }
  const cf = (gb: number) =>
    jest.fn().mockReturnValue(
      json({
        data: {
          viewer: {
            accounts: [
              {
                callsTurnUsageAdaptiveGroups: [
                  { sum: { egressBytes: gb * GB } },
                ],
              },
            ],
          },
        },
      }),
    );

  it('is skipped without keys', async () => {
    const { job, logs } = make({});
    const snap = await job.run(new Date());
    expect(snap.cloudflare).toBeUndefined();
    expect(snap.bunny).toBeUndefined();
    expect(logs).toHaveLength(0);
  });

  it('logs the metric below 700 GB and no alert', async () => {
    const { job, logs, redis } = make({
      cloudflare_turn: { accountId: 'a', analyticsToken: 't' },
    });
    const snap = await job.run(new Date(), cf(400));
    expect(snap.cloudflare).toMatchObject({ ok: true, level: 'ok' });
    expect(logs.some((l) => l.obj.metric === 'cf_realtime_egress_gb')).toBe(
      true,
    );
    expect(logs.some((l) => l.obj.alert)).toBe(false);
    expect(redis.set).toHaveBeenCalledWith(
      USAGE_SNAPSHOT_KEY,
      expect.any(String),
      'EX',
      expect.any(Number),
    );
  });

  it('alerts at 700 GB (warn) and at 950 GB (crit)', async () => {
    const warn = make({
      cloudflare_turn: { accountId: 'a', analyticsToken: 't' },
    });
    await warn.job.run(new Date(), cf(720));
    expect(warn.logs.find((l) => l.obj.alert)?.obj.alert).toBe('usage_cf_warn');
    const crit = make({
      cloudflare_turn: { accountId: 'a', analyticsToken: 't' },
    });
    await crit.job.run(new Date(), cf(960));
    expect(crit.logs.find((l) => l.obj.alert)?.obj.alert).toBe('usage_cf_crit');
  });

  it('a failing provider is a warning line, never a throw', async () => {
    const { job, logs } = make({
      cloudflare_turn: { accountId: 'a', analyticsToken: 't' },
    });
    const snap = await job.run(
      new Date(),
      jest.fn().mockRejectedValue(new Error('network')),
    );
    expect(snap.cloudflare?.ok).toBe(false);
    expect(logs.find((l) => l.obj.alert)?.obj.alert).toBe('usage_poll_failed');
  });

  it('Bunny alerts on bandwidth and storage thresholds', async () => {
    const { job, logs } = make({
      bunny_stream: { accountApiKey: 'k', libraryId: '9' },
    });
    const fetchFn = jest
      .fn()
      .mockReturnValueOnce(json({ TotalBandwidthUsed: 1200 * GB }))
      .mockReturnValueOnce(json({ StorageUsage: 600 * GB }));
    await job.run(new Date(), fetchFn);
    const alerts = logs.map((l) => l.obj.alert).filter(Boolean);
    expect(alerts).toEqual([
      'usage_bunny_bandwidth_warn',
      'usage_bunny_storage_crit',
    ]);
  });
});
