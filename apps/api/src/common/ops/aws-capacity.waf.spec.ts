import { AwsCapacityService } from './aws-capacity.service';
import { SLO_REDIS_PREFIX } from './slo-metrics.service';

/**
 * Owner 2026-11-12 («Авто» for the two WAF protections): the attack signal
 * is read from what already exists — AWS/WAFV2 BlockedRequests of the
 * load-balancer web ACL and the `authFailed` SLO counter in Redis.
 */
const NOW = new Date('2026-11-12T12:00:30Z');

function make(env: Record<string, string>, hashes: Record<string, string>) {
  const config = { get: (k: string) => env[k] };
  const redis = {
    hget: jest.fn((key: string, field: string) =>
      Promise.resolve(field === 'authFailed' ? (hashes[key] ?? null) : null),
    ),
    info: jest.fn().mockResolvedValue(''),
  };
  const svc = new AwsCapacityService(
    config as never,
    undefined,
    redis as never,
  );
  const send = jest.fn();
  (svc as unknown as { cw: unknown }).cw = { send };
  return { svc, send, redis };
}

describe('AwsCapacityService.metrics: WAF attack readings', () => {
  const minute = Math.floor(NOW.getTime() / 60_000);

  it('blocked requests: the busiest 5-minute sum of the web ACL (Rule=ALL)', async () => {
    const { svc, send } = make({ OPS_WAF_ACL: 'lawbid-prod-waf' }, {});
    send.mockResolvedValue({
      Datapoints: [
        { Timestamp: new Date(NOW.getTime() - 10 * 60_000), Sum: 1200 },
        { Timestamp: new Date(NOW.getTime() - 5 * 60_000), Sum: 300 },
      ],
    });
    const m = await svc.metrics(NOW);
    expect(m.wafBlockedPer5m).toBe(1200);
    const input = (
      send.mock.calls[0][0] as {
        input: {
          Namespace: string;
          MetricName: string;
          Dimensions: { Name: string; Value: string }[];
          Statistics: string[];
        };
      }
    ).input;
    expect(input.Namespace).toBe('AWS/WAFV2');
    expect(input.MetricName).toBe('BlockedRequests');
    expect(input.Statistics).toEqual(['Sum']);
    expect(input.Dimensions).toEqual([
      { Name: 'WebACL', Value: 'lawbid-prod-waf' },
      { Name: 'Region', Value: 'us-east-1' },
      { Name: 'Rule', Value: 'ALL' },
    ]);
  });

  it('no datapoints = nothing blocked (AWS publishes only non-zero periods)', async () => {
    const { svc, send } = make({ OPS_WAF_ACL: 'lawbid-prod-waf' }, {});
    send.mockResolvedValue({ Datapoints: [] });
    expect((await svc.metrics(NOW)).wafBlockedPer5m).toBe(0);
  });

  it('CloudWatch fails = unknown; no web ACL = not read', async () => {
    const a = make({ OPS_WAF_ACL: 'lawbid-prod-waf' }, {});
    a.send.mockRejectedValue(new Error('AccessDenied'));
    expect((await a.svc.metrics(NOW)).wafBlockedPer5m).toBeNull();
    const b = make({}, {});
    expect((await b.svc.metrics(NOW)).wafBlockedPer5m).toBeUndefined();
    expect(b.send).not.toHaveBeenCalled();
  });

  it('failed sign-ins: the last 5 full minutes of the SLO counter', async () => {
    const { svc, redis } = make(
      {},
      {
        [SLO_REDIS_PREFIX + minute]: '999', // the minute still running: not read
        [SLO_REDIS_PREFIX + (minute - 1)]: '10',
        [SLO_REDIS_PREFIX + (minute - 3)]: '7',
        [SLO_REDIS_PREFIX + (minute - 5)]: '3',
        [SLO_REDIS_PREFIX + (minute - 6)]: '500', // older than 5 minutes
      },
    );
    expect((await svc.metrics(NOW)).authFailedPer5m).toBe(20);
    expect(redis.hget).toHaveBeenCalledTimes(5);
  });
});
