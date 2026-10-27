/* eslint-disable @typescript-eslint/require-await -- async doubles mirror real Prisma/queue signatures */
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationsService } from '../notifications.service';
import type { CaseAudienceService } from './case-audience.service';
import { CaseFanoutService, type CaseFanoutJob } from './case-fanout.service';
import type { FanoutCandidate } from './case-fanout.scoring';

/**
 * Waves end to end with in-memory stand-ins for the database, the queue
 * and the notification service: the wave job logic, idempotency, stopping,
 * the daily cap, the fraud gate and the newcomer quota.
 */
const CASE = '11111111-1111-4111-8111-111111111111';

interface World {
  svc: CaseFanoutService;
  sent: Map<string, string>; // user -> dedupe key
  emitted: { ids: string[]; type: string }[];
  digests: string[][];
  jobs: { job: CaseFanoutJob; delay: number }[];
  state: {
    status: string;
    bids: number;
    fraud?: string;
    alerts24h: Record<string, number>;
    alertsTotal: Record<string, number>;
  };
  overrides: Record<string, unknown>;
  logs: Record<string, unknown>[];
}

function world(
  n: number,
  overrides: Record<string, unknown> = {},
  opts: { withQueue?: boolean; newcomers?: number } = {},
): World {
  const withQueue = opts.withQueue ?? true;
  const sent = new Map<string, string>();
  const emitted: World['emitted'] = [];
  const digests: string[][] = [];
  const jobs: World['jobs'] = [];
  const logs: Record<string, unknown>[] = [];
  const state: World['state'] = {
    status: 'open',
    bids: 0,
    alerts24h: {},
    alertsTotal: {},
  };
  const newcomers = opts.newcomers ?? 0;
  const candidates: FanoutCandidate[] = Array.from({ length: n }, (_, i) => ({
    id: `a${String(i).padStart(3, '0')}`,
    exactPractice: true,
    primaryState: true,
    trustLevel: i < n - newcomers ? 3 - (i % 3) : 0,
    ratingAvg: 4.5,
    ratingCount: 10,
  }));
  // The last `newcomers` people are new: no alerts yet; the rest are old hands.
  candidates.forEach((c, i) => {
    state.alertsTotal[c.id] = i >= n - newcomers ? 0 : 500;
  });
  const prisma = {
    case: {
      findUnique: async () => ({
        status: state.status,
        deleted_at: null,
        paused_at: null,
        bids_count: state.bids,
        created_at: new Date(),
        client_id: 'client-1',
      }),
    },
    clientFraudProfile: {
      findUnique: async () => (state.fraud ? { status: state.fraud } : null),
    },
    notification: {
      findMany: async (args: {
        where: { dedupe_key: string; user_id: { in: string[] } };
      }) =>
        args.where.user_id.in
          .filter((id) => sent.get(id) === args.where.dedupe_key)
          .map((user_id) => ({ user_id })),
      // The 24 h window and the 30 day window are told apart by the date.
      groupBy: async (args: {
        where: { user_id: { in: string[] }; created_at: { gte: Date } };
      }) => {
        const ageDays =
          (Date.now() - args.where.created_at.gte.getTime()) / 86_400_000;
        const src = ageDays < 2 ? state.alerts24h : state.alertsTotal;
        return args.where.user_id.in
          .filter((id) => (src[id] ?? 0) > 0)
          .map((user_id) => ({ user_id, _count: { _all: src[user_id] } }));
      },
    },
    bid: { findFirst: async () => null, groupBy: async () => [] },
    $queryRaw: async () => [],
  } as unknown as PrismaService;
  const notifications = {
    emitMany: async (i: {
      type: string;
      recipientIds: string[];
      dedupeKey: string;
    }) => {
      emitted.push({ ids: i.recipientIds, type: i.type });
      let c = 0;
      for (const id of i.recipientIds) {
        if (!sent.has(id)) {
          sent.set(id, i.dedupeKey);
          c++;
        }
      }
      return c;
    },
    emitDigest: async (i: { recipientIds: string[] }) => {
      digests.push(i.recipientIds);
      return i.recipientIds.length;
    },
  } as unknown as NotificationsService;
  const audience = {
    forCase: async () => ({
      found: true,
      urgent: false,
      clientId: 'client-1',
      candidates,
    }),
  } as unknown as CaseAudienceService;
  const settings = {
    number: async (k: keyof typeof APP_SETTINGS) =>
      (overrides[k] as number | undefined) ?? (APP_SETTINGS[k] as number),
    boolean: async (k: keyof typeof APP_SETTINGS) =>
      // the waves switch is OFF by default in production; these specs test
      // the waves, so they turn it on unless a test says otherwise.
      (overrides[k] as boolean | undefined) ??
      (k === 'case_fanout.enabled' ? true : (APP_SETTINGS[k] as boolean)),
    string: async (k: keyof typeof APP_SETTINGS) =>
      (overrides[k] as string | undefined) ?? String(APP_SETTINGS[k]),
  } as unknown as AppSettingsService;
  const logger = {
    setContext: () => undefined,
    info: (o: Record<string, unknown>) => logs.push(o),
    warn: () => undefined,
    error: () => undefined,
  } as unknown as PinoLogger;
  const svc = new CaseFanoutService(
    { get: () => undefined } as unknown as ConfigService,
    prisma,
    notifications,
    audience,
    logger,
    settings,
  );
  if (withQueue) {
    (svc as unknown as { queue: unknown }).queue = {
      add: async (
        _n: string,
        job: CaseFanoutJob,
        o: { delay: number; jobId: string },
      ) => {
        jobs.push({ job, delay: o.delay });
      },
    };
  }
  return { svc, sent, emitted, digests, jobs, state, overrides, logs };
}

/** Runs queued wave jobs one after another until none is left. */
async function drain(
  w: World,
  first: CaseFanoutJob = { caseId: CASE, wave: 1 },
) {
  const waves: number[] = [];
  let next: CaseFanoutJob | undefined = first;
  let guard = 0;
  while (next && guard++ < 50) {
    const out = await w.svc.runWave(next);
    if ('sent' in out) waves.push(out.sent);
    else waves.push(-1);
    next = w.jobs.shift()?.job;
  }
  return waves;
}

describe('case fan-out waves', () => {
  it('default settings keep today: one wave reaches everybody', async () => {
    const w = world(40);
    const waves = await drain(w);
    expect(waves).toEqual([40]);
    expect(w.sent.size).toBe(40);
    expect(w.jobs).toHaveLength(0);
  });

  it('waves of N every X minutes until everybody is reached', async () => {
    const w = world(25, {
      'case_fanout.first_wave_size': 10,
      'case_fanout.wave_size': 10,
      'case_fanout.wave_interval_minutes': 7,
      'case_fanout.new_quota_percent': 0,
    });
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    expect(w.sent.size).toBe(10);
    expect(w.jobs).toHaveLength(1);
    expect(w.jobs[0].delay).toBe(7 * 60_000);
    expect(w.jobs[0].job.wave).toBe(2);
    const rest = await drain(w, w.jobs.shift()!.job);
    expect(rest).toEqual([10, 5]);
    expect(w.sent.size).toBe(25);
  });

  it('best-scored people go first', async () => {
    const w = world(30, {
      'case_fanout.first_wave_size': 5,
      'case_fanout.new_quota_percent': 0,
    });
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    // trustLevel 3 = i % 3 === 0 in this world
    for (const id of w.emitted[0].ids) {
      expect(Number(id.slice(1)) % 3).toBe(0);
    }
  });

  it('a retried wave sends nothing twice (idempotent)', async () => {
    const w = world(12, { 'case_fanout.first_wave_size': 5 });
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    const before = w.sent.size;
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    // The retry sends the NEXT five, never the same five again.
    const all = w.emitted.flatMap((e) => e.ids);
    expect(new Set(all).size).toBe(all.length);
    expect(w.sent.size).toBe(before + 5);
  });

  it('stops once the case has K offers', async () => {
    const w = world(30, {
      'case_fanout.first_wave_size': 5,
      'case_fanout.wave_size': 5,
      'case_fanout.stop_at_bids': 3,
    });
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    w.state.bids = 3;
    const out = await w.svc.runWave(w.jobs.shift()!.job);
    expect(out).toEqual({ done: 'enough_bids' });
    expect(w.sent.size).toBe(5);
    expect(w.jobs).toHaveLength(0);
  });

  it('stops when the case is no longer open', async () => {
    const w = world(30, { 'case_fanout.first_wave_size': 5 });
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    w.state.status = 'closed';
    expect(await w.svc.runWave(w.jobs.shift()!.job)).toEqual({
      done: 'closed',
    });
  });

  it('respects the wave limit', async () => {
    const w = world(30, {
      'case_fanout.first_wave_size': 5,
      'case_fanout.wave_size': 5,
      'case_fanout.max_waves': 2,
    });
    const waves = await drain(w);
    expect(waves).toEqual([5, 5]);
    expect(w.sent.size).toBe(10);
  });

  it('reserves a share of every wave for new attorneys', async () => {
    const w = world(
      40,
      {
        'case_fanout.first_wave_size': 10,
        'case_fanout.new_quota_percent': 30,
      },
      { newcomers: 10 },
    );
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    const newIds = new Set(
      Array.from(
        { length: 10 },
        (_, i) => `a${String(30 + i).padStart(3, '0')}`,
      ),
    );
    const got = w.emitted[0].ids.filter((id) => newIds.has(id));
    expect(got.length).toBeGreaterThanOrEqual(3);
    const metric = w.logs.find((l) => l.metric === 'case_fanout_wave');
    expect(metric?.newReached).toBeGreaterThanOrEqual(3);
    expect(metric?.newShare).toBeGreaterThan(0);
  });

  it('daily cap: capped people get one roll-up, not the alert', async () => {
    const w = world(10, { 'case_fanout.daily_cap': 3 });
    w.state.alerts24h['a001'] = 3;
    w.state.alerts24h['a002'] = 9;
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    expect(w.sent.has('a001')).toBe(false);
    expect(w.sent.has('a002')).toBe(false);
    expect(w.sent.size).toBe(8);
    expect(w.digests).toEqual([['a001', 'a002']]);
  });

  it('no daily cap by default', async () => {
    const w = world(5);
    w.state.alerts24h['a001'] = 50;
    await w.svc.runWave({ caseId: CASE, wave: 1 });
    expect(w.sent.size).toBe(5);
    expect(w.digests).toHaveLength(0);
  });

  describe('client fraud gate', () => {
    it('restricted client: no alerts at all', async () => {
      const w = world(10);
      w.state.fraud = 'restricted';
      await w.svc.start(CASE);
      expect(w.jobs).toHaveLength(0);
      expect(w.sent.size).toBe(0);
      expect(await w.svc.runWave({ caseId: CASE, wave: 1 })).toEqual({
        done: 'fraud',
      });
    });

    it('review client with "small": delayed, small, then no more waves', async () => {
      const w = world(30, {
        'case_fanout.fraud_review_action': 'small',
        'case_fanout.fraud_small_wave_size': 4,
        'case_fanout.fraud_delay_minutes': 90,
      });
      w.state.fraud = 'review';
      await w.svc.start(CASE);
      expect(w.jobs).toHaveLength(1);
      expect(w.jobs[0].delay).toBe(90 * 60_000);
      await w.svc.runWave(w.jobs.shift()!.job);
      expect(w.sent.size).toBe(4);
      expect(w.jobs).toHaveLength(0);
    });

    it('review client by default keeps today: alerted as usual', async () => {
      const w = world(10);
      w.state.fraud = 'review';
      await w.svc.start(CASE);
      await drain(w, w.jobs.shift()!.job);
      expect(w.sent.size).toBe(10);
    });

    it('a client cleared before the delayed wave gets the normal flow', async () => {
      const w = world(10, {
        'case_fanout.fraud_review_action': 'small',
        'case_fanout.fraud_small_wave_size': 2,
      });
      w.state.fraud = 'review';
      await w.svc.start(CASE);
      w.state.fraud = undefined;
      await w.svc.runWave(w.jobs.shift()!.job);
      expect(w.sent.size).toBe(10);
    });
  });

  it('start() queues wave 1 under a stable per-wave job id', async () => {
    expect(CaseFanoutService.jobId(CASE, 2)).toBe(`casefanout-${CASE}-w2`);
    expect(CaseFanoutService.key(CASE)).toBe(`case_fanout:${CASE}`);
    const w = world(3);
    await w.svc.start(CASE);
    expect(w.jobs).toHaveLength(1);
    expect(w.jobs[0].job).toMatchObject({ caseId: CASE, wave: 1 });
  });

  it('without a queue (no Redis) wave 1 reaches everybody inline', async () => {
    const w = world(
      15,
      { 'case_fanout.first_wave_size': 3 },
      { withQueue: false },
    );
    await w.svc.start(CASE);
    expect(w.sent.size).toBe(15);
  });

  it('enabled=false is the old behaviour: everybody, no cap, no gate', async () => {
    const w = world(12, {
      'case_fanout.enabled': false,
      'case_fanout.first_wave_size': 2,
      'case_fanout.daily_cap': 1,
    });
    w.state.fraud = 'restricted';
    w.state.alerts24h['a001'] = 9;
    // switch off: sent right in this call, nothing queued
    const loadStats = jest.spyOn(w.svc, 'loadStats');
    expect(await w.svc.start(CASE)).toBe(12);
    expect(w.sent.size).toBe(12);
    // no ranking, so no per-person stats queries (review R-32)
    expect(loadStats).not.toHaveBeenCalled();
    expect(w.jobs).toHaveLength(0);
  });

  it('enabled=false without a queue (no Redis) still sends inline', async () => {
    const w = world(12, { 'case_fanout.enabled': false }, { withQueue: false });
    expect(await w.svc.start(CASE)).toBe(12);
    expect(w.sent.size).toBe(12);
  });
});
