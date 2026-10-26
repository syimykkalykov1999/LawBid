/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call, CallParticipant } from '@prisma/client';
import { CallsService } from './calls.service';
import { FakeCloudflare } from './cloudflare-sfu.fake';
import { CloudflareSfuProvider } from './cloudflare-sfu.provider';
import { SfuBrokerService } from './sfu-broker.service';
import { clearCloudflareTurnCache } from './cloudflare-turn';
import {
  CF_CLIENT_REPORT_MIN,
  CloudflareTransport,
} from './cloudflare-transport';
import type { RelayCheck } from './cloudflare-relay-probe';

/**
 * Owner 2026-10-26: «when Cloudflare goes down, people must not notice the
 * switch». Chaos tests: the Cloudflare mock dies in the middle of a group
 * call — the call keeps its id and stays active, it moves to our own path,
 * and every phone hears `call:participants` with mediaProvider p2p.
 */

const SDP = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n';
const APP = 'b'.repeat(32);

type Svc = CallsService & {
  sfuSession(u: { sub: string }, id: string): Promise<unknown>;
  sfuPublish(u: { sub: string }, id: string, dto: unknown): Promise<unknown>;
  sfuSubscribe(u: { sub: string }, id: string, dto: unknown): Promise<unknown>;
};

function world(opts?: { calls?: Array<Partial<Call>>; joined?: number }) {
  const cf = new FakeCloudflare();
  const keys = { appId: APP, appToken: 'good-secret' };
  const secrets = {
    get: jest.fn(async (id: string) =>
      id === 'cloudflare_sfu' ? { fields: keys } : null,
    ),
  };
  const settingsMap: Record<string, string | number> = {
    'calls.transport': 'auto',
    'calls.transport_fail_limit': 5,
    'calls.transport_fail_window_sec': 120,
    'calls.sfu_fallback_mesh_max': 4,
    'calls.sfu_max_participants': 20,
  };
  const settings = {
    string: jest.fn(async (k: string) => String(settingsMap[k] ?? 'p2p')),
    number: jest.fn(async (k: string) => Number(settingsMap[k] ?? 9)),
  };
  const broker = new SfuBrokerService(
    secrets as never,
    undefined,
    undefined,
    settings as never,
  );
  (broker as unknown as { provider: CloudflareSfuProvider }).provider =
    new CloudflareSfuProvider(secrets as never, undefined, cf.fetch);

  const users = Array.from(
    { length: opts?.joined ?? 3 },
    (_, i) => `u${i + 1}`,
  );
  const calls = new Map<string, Call>();
  for (const c of opts?.calls ?? [{ id: 'call-1' }]) {
    calls.set(c.id!, {
      status: 'active',
      is_group: true,
      video: true,
      media_provider: 'cloudflare',
      channel_id: null,
      solo_since: null,
      ...c,
    } as Call);
  }
  const rows = users.map(
    (u) => ({ user_id: u, status: 'joined' }) as CallParticipant,
  );
  const matches = (c: Call, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = (c as unknown as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'in' in v) {
        return (v as { in: unknown[] }).in.includes(val);
      }
      return val === v;
    });
  const prisma = {
    call: {
      findUnique: jest.fn(async (a: { where: { id: string } }) => {
        const c = calls.get(a.where.id);
        return c ? { ...c } : null;
      }),
      findMany: jest.fn(async (a: { where: Record<string, unknown> }) =>
        [...calls.values()].filter((c) => matches(c, a.where)),
      ),
      update: jest.fn(
        async (a: { where: { id: string }; data: Partial<Call> }) => {
          const c = calls.get(a.where.id)!;
          Object.assign(c, a.data);
          return { ...c };
        },
      ),
      updateMany: jest.fn(
        async (a: { where: Record<string, unknown>; data: Partial<Call> }) => {
          let count = 0;
          for (const c of calls.values()) {
            if (matches(c, a.where)) {
              Object.assign(c, a.data);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };
  const realtime = { toUsers: jest.fn() };
  const svc = Object.create(CallsService.prototype) as Svc;
  Object.assign(svc, {
    prisma,
    sfu: broker,
    settings,
    realtime,
    logger: { warn: jest.fn(), log: jest.fn() },
    rowsOf: async () => rows,
    isCallAdmin: async () => true,
    audience: () => users,
    hostFor: async () => 'u1',
    participantDtos: async () => users.map((u) => ({ userId: u })),
    announceGroupCall: async () => undefined,
    clearSolo: async () => undefined,
    activeVideoProvider: async () => broker.provider,
  });
  // The constructor's hook, as in production.
  broker.transport.onOpen((part) => {
    if (part === 'sfu') void svc.moveSfuCallsToOwn('breaker_open');
  });
  return { cf, broker, svc, calls, realtime, users };
}

const participantEvents = (rt: { toUsers: jest.Mock }) =>
  rt.toUsers.mock.calls
    .filter((c: unknown[]) => c[1] === 'call:participants')
    .map((c: unknown[]) => c[2] as Record<string, unknown>);

async function joinAll(w: ReturnType<typeof world>, callId = 'call-1') {
  for (const u of w.users) {
    await w.svc.sfuSession({ sub: u }, callId);
    await w.svc.sfuPublish({ sub: u }, callId, {
      sdp: SDP,
      tracks: [{ mid: '0', trackName: 'mic' }],
    });
  }
}

describe('chaos: Cloudflare SFU dies mid-call', () => {
  it('the call keeps its id, stays active, moves to our own path; everyone hears mediaProvider p2p', async () => {
    const w = world();
    await joinAll(w);
    w.realtime.toUsers.mockClear();

    // Kill the Cloudflare mock in the middle of the call.
    w.cf.failStatus = 503;
    await expect(
      w.svc.sfuSubscribe({ sub: 'u2' }, 'call-1', {}),
    ).rejects.toMatchObject({ status: 503 });

    const call = w.calls.get('call-1')!;
    expect(call.id).toBe('call-1');
    expect(call.status).toBe('active');
    expect(call.media_provider).toBe('p2p');
    // Three people: the video stays (mesh keeps video up to 4).
    expect(call.video).toBe(true);

    const events = participantEvents(w.realtime);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      callId: 'call-1',
      mediaProvider: 'p2p',
      mediaFallback: { active: true, reason: 'sfu_unavailable' },
    });
    expect(w.realtime.toUsers.mock.calls[0][0]).toEqual(w.users);

    // A second failing request does not announce the switch again.
    await expect(
      w.svc.sfuSubscribe({ sub: 'u3' }, 'call-1', {}),
    ).rejects.toMatchObject({ status: 409 });
    expect(participantEvents(w.realtime)).toHaveLength(1);
  });

  it('a crowded video call drops to audio only when it moves (mesh keeps video up to 4)', async () => {
    const w = world({ joined: 6 });
    await joinAll(w);
    w.cf.failStatus = 500;
    await expect(
      w.svc.sfuSession({ sub: 'u1' }, 'call-1'),
    ).rejects.toMatchObject({ status: 503 });
    const call = w.calls.get('call-1')!;
    expect(call.media_provider).toBe('p2p');
    expect(call.video).toBe(false);
    expect(participantEvents(w.realtime).at(-1)).toMatchObject({
      mediaProvider: 'p2p',
      video: false,
      mediaFallback: { active: true, videoBlocked: true },
    });
  });

  it('the key is removed from Integrations mid-call: the call moves, it does not end', async () => {
    const w = world();
    await joinAll(w);
    // A refused key (401) is an outage of the Cloudflare path too.
    (w.broker as unknown as { provider: CloudflareSfuProvider }).provider =
      new CloudflareSfuProvider(
        {
          get: async () => ({ fields: { appId: APP, appToken: 'revoked' } }),
        } as never,
        undefined,
        w.cf.fetch,
      );
    await expect(
      w.svc.sfuSubscribe({ sub: 'u1' }, 'call-1', {}),
    ).rejects.toMatchObject({ status: 503 });
    expect(w.calls.get('call-1')).toMatchObject({
      id: 'call-1',
      status: 'active',
      media_provider: 'p2p',
    });
  });

  it('the breaker opens: every running Cloudflare group call moves to our own path', async () => {
    const w = world({
      calls: [{ id: 'call-1' }, { id: 'call-2' }, { id: 'call-3' }],
    });
    await joinAll(w, 'call-1');
    w.cf.failStatus = 502;
    // Five failures (calls.transport_fail_limit) open the shared breaker.
    for (let i = 0; i < 5; i++) {
      await w.broker
        .createSession({
          callId: 'other',
          userId: `x${i}`,
          canPublish: true,
          joinedUserIds: [],
        })
        .catch(() => undefined);
    }
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(await w.broker.transport.isOpen('sfu')).toBe(true);
    for (const id of ['call-1', 'call-2', 'call-3']) {
      expect(w.calls.get(id)).toMatchObject({
        id,
        status: 'active',
        media_provider: 'p2p',
      });
    }
    const moved = new Set(participantEvents(w.realtime).map((e) => e.callId));
    expect(moved).toEqual(new Set(['call-1', 'call-2', 'call-3']));
  });

  it('per-call stickiness: Cloudflare comes back, the moved call stays on our own path', async () => {
    const w = world();
    await joinAll(w);
    w.cf.failStatus = 503;
    await w.svc.sfuSubscribe({ sub: 'u1' }, 'call-1', {}).catch(() => 0);
    w.cf.failStatus = null;
    // Nothing moves it back: the SFU routes refuse it as device to device.
    await expect(
      w.svc.sfuSession({ sub: 'u1' }, 'call-1'),
    ).rejects.toMatchObject({ status: 409 });
    expect(w.calls.get('call-1')!.media_provider).toBe('p2p');
  });
});

// --- 1:1 calls: a dead relay mid-call ----------------------------------------

const CF_RESPONSE = {
  iceServers: [
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
      username: 'cf-user',
      credential: 'cf-pass',
    },
  ],
};

/** A relay that answers STUN and allocates (the data plane is fine). */
const relayAlive: RelayCheck = async (target) => ({
  target: `${target.host}:${target.port}`,
  stun: { ok: true, ms: 1 },
  turn: { ok: true, ms: 1 },
});
/** A relay that is gone although the credential API still answers. */
const relayDead: RelayCheck = async (target) => ({
  target: `${target.host}:${target.port}`,
  stun: { ok: false, ms: 2000, error: 'no answer in 2000 ms' },
  turn: { ok: false, ms: 0, error: 'no answer' },
});

function iceSvc(transport?: CloudflareTransport, relayCheck = relayAlive) {
  const svc = Object.create(CallsService.prototype) as CallsService;
  const slo = { count: jest.fn() };
  Object.assign(svc, {
    secrets: {
      get: async (id: string) => ({
        fields:
          id === 'cloudflare_turn'
            ? { keyId: 'key1', apiToken: 'tok' }
            : { urls: 'turn:own.example:3478', secret: 's'.repeat(20) },
      }),
    },
    config: { get: () => undefined },
    slo,
    logger: { warn: jest.fn(), log: jest.fn() },
    cfTransportOwn: transport ?? new CloudflareTransport(),
    relayCheck,
  });
  return svc;
}

const flush = () => new Promise((r) => setTimeout(r, 25));
const first = (r: { iceServers: Array<{ urls: string[] }> }) =>
  r.iceServers[0].urls[0];
const relays = (r: { iceServers: Array<{ urls: string[] }> }) =>
  r.iceServers.filter((s) => /^turn/.test(s.urls[0])).map((s) => s.urls[0]);

describe('1:1: the relay died mid-call (relayFailed)', () => {
  const realFetch = global.fetch;
  beforeEach(() => clearCloudflareTurnCache());
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('a NEW Cloudflare login (not the cached one) and our own TURN first', async () => {
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
    );
    global.fetch = fetchMock as never;
    const svc = iceSvc();
    const user = { sub: 'u1' } as never;
    const normal = await svc.iceServers(user);
    // Cloudflare first; our own TURN is offered too (after it, FO-1).
    expect(relays(normal)).toEqual([
      'turn:turn.cloudflare.com:3478?transport=udp',
      'turn:own.example:3478',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const after = await svc.iceServers(user, { relayFailed: true });
    // The cache was skipped: a second login from Cloudflare.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(after.iceServers[0].urls[0]).toBe('turn:own.example:3478');
    expect(after.iceServers[1].urls[0]).toContain('cloudflare');
  });

  it('FO-1: the Cloudflare relay (data plane) is dead but its credential API answers — a NEW call still has a path: own TURN next to Cloudflare', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
    ) as never;
    const t = new CloudflareTransport();
    const svc = iceSvc(t, relayDead);
    const res = await svc.iceServers({ sub: 'u1' } as never);
    expect(await t.isOpen('turn')).toBe(false); // the API said yes
    expect(first(res)).toContain('cloudflare');
    expect(relays(res)).toContain('turn:own.example:3478');
    // STUN is still there, and the own TURN has its TCP twin.
    expect(res.iceServers.some((s) => /^stun:/.test(s.urls[0]))).toBe(true);
    expect(
      res.iceServers.find((s) => s.urls[0] === 'turn:own.example:3478')?.urls,
    ).toContain('turn:own.example:3478?transport=tcp');
  });

  it('FO-8: breaker open + own TURN — own first, Cloudflare still offered second', async () => {
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
    );
    global.fetch = fetchMock as never;
    const t = new CloudflareTransport(undefined, {
      string: async () => 'auto',
      number: async (k: string) =>
        k === 'calls.transport_fail_limit' ? 1 : 120,
    });
    await t.recordFailure('turn', 'down');
    const svc = iceSvc(t, relayDead);
    const res = await svc.iceServers({ sub: 'u1' } as never);
    expect(relays(res)).toEqual([
      'turn:own.example:3478',
      'turn:turn.cloudflare.com:3478?transport=udp',
    ]);
    await flush();
    // The quick second-place try counts nothing; the minute probe (a dead
    // relay) keeps it open.
    expect(await t.isOpen('turn')).toBe(true);
  });

  it('CF-6: a relayFailed request makes the API check the relay itself; a dead one is a real breaker failure', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
    ) as never;
    const t = new CloudflareTransport();
    const svc = iceSvc(t, relayDead);
    const res = await svc.iceServers({ sub: 'u1' } as never, {
      relayFailed: true,
    });
    expect(first(res)).toBe('turn:own.example:3478');
    await flush();
    expect((await t.state('turn')).failures).toBe(1);
    expect(await t.isOpen('turn')).toBe(false); // one check is not N
    // A relay that allocates: the phone's report alone counts nothing.
    const ok = new CloudflareTransport();
    await iceSvc(ok, relayAlive).iceServers({ sub: 'u2' } as never, {
      relayFailed: true,
    });
    await flush();
    expect((await ok.state('turn')).failures).toBe(0);
  });

  it('TS-2 (launch scale): two phones of the only two Cloudflare calls report — the breaker opens, the next call is own-first', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
    ) as never;
    const t = new CloudflareTransport();
    const svc = iceSvc(t, relayDead);
    await svc.iceServers({ sub: 'a' } as never);
    await svc.iceServers({ sub: 'b' } as never);
    await svc.iceServers({ sub: 'a' } as never, { relayFailed: true });
    await flush();
    expect(await t.isOpen('turn')).toBe(false); // one phone is a lift
    await svc.iceServers({ sub: 'b' } as never, { relayFailed: true });
    await flush();
    expect(await t.isOpen('turn')).toBe(true);
    const next = await svc.iceServers({ sub: 'c' } as never);
    expect(first(next)).toBe('turn:own.example:3478');
  });

  it('one phone reporting never opens the breaker; many phones (a real share of the calls) do', async () => {
    const t = new CloudflareTransport();
    // 30 calls took Cloudflare in the window.
    for (let i = 0; i < 30; i++) await t.noteUse('turn');
    // One phone, many reports: counted once a minute only.
    for (let i = 0; i < 20; i++) {
      await t.recordClientFailure('turn', 'same-user', 'ICE failed');
    }
    expect(await t.isOpen('turn')).toBe(false);
    expect((await t.state('turn')).failures).toBe(0);
    // Many phones: CF_CLIENT_REPORT_MIN distinct phones (a third of the
    // calls; the lone phone above is one of them) open it at once — the
    // phones ARE the outage report.
    for (let i = 0; i < CF_CLIENT_REPORT_MIN - 2; i++) {
      await t.recordClientFailure('turn', `user-${i}`, 'ICE failed');
    }
    expect(await t.isOpen('turn')).toBe(false);
    await t.recordClientFailure('turn', 'user-last', 'ICE failed');
    expect(await t.isOpen('turn')).toBe(true);
  });

  it('a few reports among many healthy calls do not count (a lift is not an outage)', async () => {
    const t = new CloudflareTransport();
    for (let i = 0; i < 1000; i++) await t.noteUse('turn');
    for (let i = 0; i < 50; i++) {
      await t.recordClientFailure('turn', `user-${i}`, 'ICE failed');
    }
    expect((await t.state('turn')).failures).toBe(0);
  });
});
