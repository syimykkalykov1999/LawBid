import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Redis from 'ioredis';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { HotlineConflictService } from './hotline-conflict.service';
import type { HotlineCallBridge } from './hotline-call-bridge';
import { HotlineGateway } from './hotline.gateway';
import { HotlineSweeper } from './hotline-sweeper.service';
import { HotlineService } from './hotline.service';
import { bucketOf, HotlineKeys } from './hotline.store';
import { AdminHotlineController } from './admin-hotline.controller';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
jest.setTimeout(60_000);

/**
 * Owner row 87 — the numbered use cases of the PR, end to end through the
 * service and the sweeper, on a real Valkey (skipped without one). The
 * database, flags, settings and sockets are fakes; time is a test clock.
 */
describe('hotline use cases (real Valkey)', () => {
  let redis: Redis;
  let up = false;
  let n = 0;
  let now = 1_800_000_000_000;
  let cfg: Record<string, unknown>;
  let flagOn: boolean;
  let events: { to: string[]; event: string; data: Record<string, unknown> }[];
  let rooms: { room: string; event: string; data: unknown }[];
  let licences: Record<string, { state_code: string; bar_number: string }[]>;
  let pastCases: Record<string, { title: string; description: string }[]>;
  let blocks: [string, string][];
  let users: Record<
    string,
    { first_name: string; last_name: string; phone_verified_at: Date | null }
  >;
  let svc: HotlineService;
  let sweeper: HotlineSweeper;
  let k: HotlineKeys;
  let entitlementValues: Record<string, unknown>;
  let build: (bridge?: HotlineCallBridge) => void;
  /** The fake 1:1 calls (plan PR 4): what the bridge was asked to do. */
  let calls: Map<
    string,
    {
      req: string;
      status: string;
      beat: number;
      dur: number | null;
      end: string | null;
    }
  >;
  let bridgeLog: string[];
  /** hotline_calls rows (the bridge writes them; the call-back reads). */
  let hotlineCalls: {
    client_id: string;
    attorney_id: string;
    ended_at: Date;
    state_code: string;
    practice_area: string;
  }[];
  /** Slows the fake bridge's open (the double «Взять» race). */
  let openDelayMs: number;
  /** attorney_profiles.languages; absent = he speaks every test language. */
  let spoken: Record<string, string[]>;
  /** hotline_calls rows by request (offer-case, review). */
  let callRows: Map<string, Record<string, unknown>>;
  let caseOffers: string[];
  let busyIn: Set<string>;

  const attorney = (id: string): RequestUser =>
    ({ sub: id, role: 'attorney' }) as RequestUser;
  const client = (id: string): RequestUser =>
    ({ sub: id, role: 'client' }) as RequestUser;

  beforeAll(async () => {
    redis = new Redis(URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      await redis.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  afterAll(() => redis.disconnect());

  beforeEach(() => {
    n += 1;
    now = 1_800_000_000_000;
    cfg = {};
    flagOn = true;
    events = [];
    rooms = [];
    licences = {};
    pastCases = {};
    blocks = [];
    users = {};
    entitlementValues = {};
    hotlineCalls = [];
    openDelayMs = 0;
    spoken = {};
    callRows = new Map();
    caseOffers = [];
    busyIn = new Set();
    k = new HotlineKeys(`hltest:{hls${process.pid}x${n}}`);
    const prisma = {
      attorneyProfile: {
        findUnique: ({ where }: { where: { user_id: string } }) =>
          Promise.resolve({
            languages: spoken[where.user_id] ?? ['en', 'es', 'ru'],
          }),
      },
      attorneyLicense: {
        findMany: ({ where }: { where: { attorney_id: string } }) =>
          Promise.resolve(licences[where.attorney_id] ?? []),
      },
      user: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(users[where.id] ?? null),
      },
      hotlineCall: {
        findUnique: ({ where }: { where: { request_id: string } }) =>
          Promise.resolve(callRows.get(where.request_id) ?? null),
        updateMany: ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const row = callRows.get(where.request_id as string);
          const match =
            !!row &&
            Object.entries(where).every(
              ([key, v]) => key === 'request_id' || (row[key] ?? null) === v,
            );
          if (match) Object.assign(row, data);
          return Promise.resolve({ count: match ? 1 : 0 });
        },
        findFirst: ({
          where,
        }: {
          where: {
            client_id: string;
            attorney_id: string;
            ended_at: { gte?: Date };
          };
        }) =>
          Promise.resolve(
            hotlineCalls
              .filter(
                (h) =>
                  h.client_id === where.client_id &&
                  h.attorney_id === where.attorney_id &&
                  (!where.ended_at.gte || h.ended_at >= where.ended_at.gte),
              )
              .at(-1) ?? null,
          ),
      },
      practiceArea: {
        findMany: () =>
          Promise.resolve([{ code: 'family' }, { code: 'immigration' }]),
      },
      state: {
        findMany: () => Promise.resolve([{ code: 'CA' }, { code: 'NY' }]),
      },
      case: {
        findMany: ({
          where,
        }: {
          where: { accepted_bid: { is: { attorney_id: string } } };
        }) =>
          Promise.resolve(pastCases[where.accepted_bid.is.attorney_id] ?? []),
      },
      userBlock: {
        findFirst: ({
          where,
        }: {
          where: { OR: { blocker_id: string; blocked_id: string }[] };
        }) =>
          Promise.resolve(
            blocks.some(([a, b]) =>
              where.OR.some((o) => o.blocker_id === a && o.blocked_id === b),
            )
              ? { blocker_id: 'x' }
              : null,
          ),
      },
    };
    const realtime = {
      toUsers: (to: string[], event: string, data: Record<string, unknown>) =>
        events.push({ to, event, data }),
      toRoom: (room: string, event: string, data: unknown) =>
        rooms.push({ room, event, data }),
    };
    build = (bridge?: HotlineCallBridge) => {
      svc = new HotlineService(
        redis,
        prisma as never,
        { isEnabled: () => Promise.resolve(flagOn) } as never,
        { all: () => Promise.resolve(cfg) } as never,
        realtime as never,
        new HotlineConflictService(prisma as never, redis),
        {
          forUser: () => Promise.resolve({ values: entitlementValues }),
        } as never,
        undefined,
        k,
        () => now,
        bridge,
      );
      sweeper = new HotlineSweeper(
        svc,
        realtime as never,
        {
          setContext: () => undefined,
          warn: () => undefined,
        } as never,
      );
    };
    build();
    calls = new Map();
    bridgeLog = [];
  });

  /** A bridge with the 1:1 calls faked in memory (the real one: e2e). */
  const fakeBridge = (): HotlineCallBridge => ({
    open: async (i) => {
      if (openDelayMs) await new Promise((ok) => setTimeout(ok, openDelayMs));
      const id = `call-${i.requestId.slice(0, 8)}-${calls.size}`;
      calls.set(id, {
        req: i.requestId,
        status: 'active',
        beat: now,
        dur: null,
        end: null,
      });
      bridgeLog.push(`open ${i.clientId}->${i.attorneyId} at ${i.answeredAt}`);
      callRows.set(i.requestId, {
        client_id: i.clientId,
        attorney_id: i.attorneyId,
        state_code: i.state,
        practice_area: i.practiceArea,
        topic: i.topic ?? null,
        case_id: null,
        case_invite_id: null,
        reviewed_at: null,
      });
      return { callId: id };
    },
    inOtherCall: (id) => Promise.resolve(busyIn.has(id)),
    avatarUrl: (fileId) =>
      Promise.resolve(fileId ? `https://cdn.test/${fileId}.jpg` : null),
    offerCase: async (i) => {
      caseOffers.push(`${i.client.sub}->${i.attorneyId} ${i.topic}`);
      // a slow case service: the double tap races the first one
      await new Promise((ok) => setTimeout(ok, 30));
      return {
        caseId: `case-${caseOffers.length}`,
        inviteId: `inv-${caseOffers.length}`,
      };
    },
    hangUp: (id, by, reason) => {
      const c = calls.get(id);
      if (c && c.status === 'active') {
        c.status = 'ended';
        c.end = reason;
      }
      bridgeLog.push(`hangUp ${by} ${reason}`);
      return Promise.resolve();
    },
    states: (ids) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const c = calls.get(id);
            return c
              ? [
                  [
                    id,
                    {
                      live: c.status === 'active',
                      status: c.status,
                      heartbeatAt: c.beat,
                      durationSec: c.dur,
                      endReason: c.end,
                    },
                  ] as const,
                ]
              : [];
          }),
        ),
      ),
    finish: (i) => {
      bridgeLog.push(`finish ${i.reason} ${i.durationSec}`);
      hotlineCalls.push({
        client_id: i.clientId,
        attorney_id: i.attorneyId,
        ended_at: new Date(i.endedAt),
        state_code: 'CA',
        practice_area: 'family',
      });
      return Promise.resolve({ conversationId: `conv-${i.clientId}` });
    },
  });

  afterEach(async () => {
    if (!up) return;
    const keys = await redis.keys(`hltest:{hls${process.pid}x${n}}*`);
    if (keys.length) await redis.del(...keys);
  });

  const lawyerReady = (id: string, states = ['CA']) => {
    licences[id] = states.map((s) => ({
      state_code: s,
      bar_number: `B-${id}`,
    }));
    users[id] = { first_name: 'Ann', last_name: id, phone_verified_at: null };
  };
  const goLine = async (id: string, langs = ['en'], states = ['CA']) => {
    lawyerReady(id, states);
    return svc.goOnline(attorney(id), {
      states,
      practiceAreas: ['family'],
      languages: langs,
    });
  };
  const ask = async (id: string, langs = ['en'], topic = 'Divorce papers') => {
    users[id] ??= {
      first_name: 'Bob',
      last_name: `Client${id}`,
      phone_verified_at: new Date(1),
    };
    return svc.createRequest(client(id), {
      state: 'CA',
      practiceArea: 'family',
      languages: langs,
      topic,
    });
  };
  const offersTo = (lw: string) =>
    events.filter((e) => e.event === 'hotline:offer' && e.to.includes(lw));
  const tick = (ms = 0) => {
    now += ms;
    return sweeper.sweep(redis, now);
  };

  it('UC 1: switch off → 403 FEATURE_DISABLED for the attorney and the client', async () => {
    if (!up) return;
    flagOn = false;
    lawyerReady('L1');
    await expect(
      svc.goOnline(attorney('L1'), {
        states: ['CA'],
        practiceAreas: ['family'],
        languages: ['en'],
      }),
    ).rejects.toMatchObject({ response: { code: 'FEATURE_DISABLED' } });
    await expect(ask('C1')).rejects.toMatchObject({
      response: { code: 'FEATURE_DISABLED' },
    });
  });

  it('UC 2: only the attorney himself, only states of his VERIFIED licences (UPL)', async () => {
    if (!up) return;
    lawyerReady('L1', ['CA']);
    await expect(
      svc.goOnline(attorney('L1'), {
        states: ['NY'],
        practiceAreas: ['family'],
        languages: ['en'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'ATTORNEY_NOT_VERIFIED', details: { states: ['NY'] } },
    });
    await expect(
      svc.goOnline(client('C1'), {
        states: ['CA'],
        practiceAreas: ['family'],
        languages: ['en'],
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      svc.goOnline({ sub: 'L1', role: 'attorney', assistant: {} } as never, {
        states: ['CA'],
        practiceAreas: ['family'],
        languages: ['en'],
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      svc.goOnline(attorney('L1'), {
        states: ['CA'],
        practiceAreas: ['nope'],
        languages: ['en'],
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('UC 3: access in the plan builder’s 3 modes — Вкл для всех (start) / По подписке (included, add-on, unavailable, trial) / Выкл для всех', async () => {
    if (!up) return;
    expect((await goLine('L1')).via).toBe('free');
    cfg['hotline.mode'] = 'by_subscription';
    await expect(goLine('L2')).rejects.toMatchObject({
      response: {
        code: 'ENTITLEMENT_REQUIRED',
        details: { reason: 'not_in_plan' },
      },
    });
    entitlementValues = { hotline_addon_price_cents: 1900 };
    await expect(goLine('L2')).rejects.toMatchObject({
      response: { details: { reason: 'addon_required' } },
    });
    cfg['hotline.trial_days'] = 7;
    expect((await goLine('L2')).via).toBe('trial');
    entitlementValues = { hotline: true };
    expect((await goLine('L3')).via).toBe('plan');
    cfg['hotline.mode'] = 'off_for_all';
    await expect(goLine('L4')).rejects.toMatchObject({
      response: { details: { reason: 'off_for_all' } },
    });
  });

  it('UC 4: client, no attorney on the line → waits; the disclosure shows until he taps «Понятно» (audit #11)', async () => {
    if (!up) return;
    const v = await ask('C1');
    expect(v.status).toBe('queued');
    expect(v.positionBand).toBe('1');
    expect(v.waitBand).toBe('5to15'); // 1 × 5 min avg / max(1, 0)
    expect(v.disclosure).toMatchObject({
      key: 'hotline.disclosure.client_wait',
      kind: 'full',
    });
    expect(v.disclosure?.ru).toContain('Звонки не записываются');
    await svc.cancelRequest(client('C1'), v.id);
    // the answer was delivered, but nobody tapped «Понятно»: shown again
    const shown = await ask('C1');
    expect(shown.disclosure).toMatchObject({ kind: 'full' });
    await svc.cancelRequest(client('C1'), shown.id);
    expect(
      await svc.ackDisclosure(client('C1'), v.disclosure!.version),
    ).toMatchObject({ key: null, kind: null });
    const again = await ask('C1');
    expect(again.disclosure).toMatchObject({ key: null, kind: null });
    // TTLs on every key (audit #12): the «seen» mark expires too
    expect(await redis.ttl(k.ack('C1'))).toBeGreaterThan(300 * 86_400);
    // the owner edits the text and bumps the version → shown once more
    cfg['hotline.disclosure_version'] = 2;
    expect(
      (await svc.getRequest(client('C1'), again.id)).disclosure?.kind,
    ).toBe('full');
    // optional short line on repeat calls
    cfg['hotline.disclosure_version'] = 1;
    cfg['hotline.short_notice_enabled'] = true;
    expect(
      (await svc.getRequest(client('C1'), again.id)).disclosure,
    ).toMatchObject({
      key: 'hotline.notice.short',
      ru: 'Звонки не записываются',
    });
  });

  it('UC 5 (owner a): an attorney joins, 2 online waiting → the OLDEST gets him; offer shows topic and the one-time disclosure', async () => {
    if (!up) return;
    const a = await ask('C1', ['en'], 'Custody');
    now += 1000;
    await ask('C2', ['en'], 'Alimony');
    await goLine('L1');
    const offers = offersTo('L1');
    expect(offers).toHaveLength(1);
    expect(offers[0].data).toMatchObject({
      requestId: a.id,
      topic: 'Custody',
      state: 'CA',
      practiceArea: 'family',
      clientName: 'Bob C',
      disclosure: { key: 'hotline.disclosure.attorney_offer', kind: 'full' },
    });
    expect(offers[0].data.disclosure).toMatchObject({
      ru: expect.stringContaining('проверьте конфликт интересов'),
    });
    // the client still sees «searching» (an attorney is being asked)
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('searching');
    // not opened / not confirmed: the next offer shows it again (audit #11)
    await svc.decline(attorney('L1'), a.id);
    expect(offersTo('L1')[1].data.disclosure).toMatchObject({ kind: 'full' });
    // «Понятно» of an OLDER text version does not count
    await svc.ackDisclosure(attorney('L1'), 99);
    await svc.decline(
      attorney('L1'),
      offersTo('L1')[1].data.requestId as string,
    );
    await ask('C3', ['en'], 'Wills');
    expect(offersTo('L1')[2].data.disclosure).toMatchObject({ kind: 'full' });
    await svc.ackDisclosure(attorney('L1'), 1);
    await svc.decline(
      attorney('L1'),
      offersTo('L1')[2].data.requestId as string,
    );
    await ask('C4', ['en'], 'Lease');
    expect(offersTo('L1')[3].data.disclosure).toMatchObject({ key: null });
  });

  it('UC 6: «Взять» → connected (billing starts here); end → seconds; attorney takes the next waiting client', async () => {
    if (!up) return;
    const a = await ask('C1');
    now += 1;
    const b = await ask('C2');
    await goLine('L1');
    now += 5000; // ringing time is not billed
    expect(await svc.accept(attorney('L1'), a.id)).toEqual({
      ok: true,
      state: 'connected',
    });
    expect(await svc.accept(attorney('L1'), a.id)).toEqual({
      ok: true,
      state: 'connected',
    }); // idempotent
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v.status).toBe('connected');
    expect(v.lawyer).toEqual({
      id: 'L1',
      name: 'Ann L1',
      username: null,
      avatarUrl: null,
      state: 'CA',
      barNumber: 'B-L1',
    });
    expect(events.some((e) => e.event === 'hotline:connected')).toBe(true);
    for (let i = 0; i < 5; i++) {
      now += 25_000;
      await svc.heartbeat('L1'); // the line stays alive during the call
    }
    expect(await svc.endCall(a.id, 'ended', 'C1')).toEqual({
      ok: true,
      seconds: 125,
    });
    expect(await svc.endCall(a.id, 'ended', 'L1')).toEqual({
      ok: true,
      seconds: 0,
    }); // both pressed red
    expect(events.find((e) => e.event === 'hotline:ended')?.data).toMatchObject(
      { seconds: 125, review: true },
    );
    expect(offersTo('L1').at(-1)?.data.requestId).toBe(b.id);
    expect(await redis.hget(k.trial('L1'), 'seconds')).toBe('125');
  });

  it('UC 7: «Пропустить» → the next attorney; the same one is never asked again', async () => {
    if (!up) return;
    await goLine('L1');
    now += 1;
    await goLine('L2');
    const a = await ask('C1');
    expect(offersTo('L1')).toHaveLength(1);
    await svc.decline(attorney('L1'), a.id);
    expect(offersTo('L2')[0].data.requestId).toBe(a.id);
    await svc.decline(attorney('L2'), a.id);
    expect(offersTo('L1')).toHaveLength(1);
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('queued');
  });

  it('UC 8: no answer in 10 s → next attorney; 3 misses in a row → off the line', async () => {
    if (!up) return;
    await goLine('L1');
    for (let i = 0; i < 3; i++) {
      await ask(`C${i}`);
      await tick(10_001);
      // keep the client alive meanwhile
    }
    expect(
      events.filter(
        (e) => e.event === 'hotline:offer_ended' && e.data.reason === 'timeout',
      ),
    ).toHaveLength(3);
    expect((await svc.lineView('L1', null)).online).toBe(false);
    expect(events.find((e) => e.event === 'hotline:line')?.data).toMatchObject({
      online: false,
      reason: 'missed',
    });
  });

  it('UC 9: pause after a miss (admin), then back', async () => {
    if (!up) return;
    cfg['hotline.no_answer_pause_sec'] = 30;
    await goLine('L1');
    await ask('C1');
    await tick(10_001);
    expect((await svc.lineView('L1', null)).state).toBe('paused');
    await ask('C2');
    expect(offersTo('L1')).toHaveLength(1);
    await svc.heartbeat('L1');
    await tick(30_001);
    expect(offersTo('L1')).toHaveLength(2);
  });

  it('UC 10: the attorney leaves the section mid-offer → off at once, the client goes to the next', async () => {
    if (!up) return;
    await goLine('L1');
    now += 1;
    await goLine('L2');
    const a = await ask('C1');
    await svc.goOffline('L1', 'away');
    expect(offersTo('L2')[0].data.requestId).toBe(a.id);
    expect((await svc.lineView('L1', null)).online).toBe(false);
  });

  it('UC 11: screen off / no heartbeat → off the line by TTL, never offered', async () => {
    if (!up) return;
    await goLine('L1');
    await tick(61_000);
    await ask('C1');
    expect(offersTo('L1')).toHaveLength(0);
    expect((await svc.lineView('L1', null)).online).toBe(false);
    // heartbeat in time keeps him
    await goLine('L2');
    now += 40_000;
    await svc.heartbeat('L2');
    await tick(40_000);
    expect((await svc.lineView('L2', null)).online).toBe(true);
  });

  it('UC 12 (audit #3, P8): a socket drop / deploy is NOT off at once — presence_ttl_sec to come back; after it his choice is kept for resume', async () => {
    if (!up) return;
    await goLine('L1', ['en', 'es']);
    await svc.heartbeat('L1', 'sock-1');
    await svc.lineSocketClosed('L1', 'sock-other');
    expect((await svc.lineView('L1', null)).online).toBe(true);
    // the deploy closes his socket: still on the line
    now += 20_000;
    await svc.lineSocketClosed('L1', 'sock-1');
    expect((await svc.lineView('L1', null)).online).toBe(true);
    // a client calls within the window → he still gets it
    const a = await ask('C1');
    expect(offersTo('L1')[0].data.requestId).toBe(a.id);
    await svc.decline(attorney('L1'), a.id);
    // the new socket's heartbeat within the window keeps him
    now += 50_000;
    await tick();
    expect((await svc.lineView('L1', null)).online).toBe(true);
    await svc.heartbeat('L1', 'sock-2');
    // the app is killed: no socket, no heartbeat → off after the window …
    await svc.lineSocketClosed('L1', 'sock-2');
    await tick(61_000);
    expect((await svc.lineView('L1', null)).online).toBe(false);
    expect(
      events.filter((e) => e.event === 'hotline:line').at(-1)?.data,
    ).toMatchObject({ online: false, reason: 'lost', resumable: true });
    // … but his choice is kept: the next heartbeat says «resumable», and
    // one call puts him back with the same states / areas / languages
    expect(await svc.heartbeat('L1', 'sock-3')).toMatchObject({
      line: false,
      resumable: true,
    });
    expect(await redis.ttl(k.saved('L1'))).toBeGreaterThan(0);
    const back = await svc.resumeLine(attorney('L1'), 'sock-3');
    expect(back).toMatchObject({
      online: true,
      states: ['CA'],
      languages: ['en', 'es'],
    });
    // «Выключить линию» forgets it: resume does nothing
    await svc.goOfflineByUser(attorney('L1'));
    expect((await svc.resumeLine(attorney('L1'))).online).toBe(false);
    // leaving the section (`hotline:away`) is off at once, nothing kept
    await goLine('L2');
    await svc.goOffline('L2', 'away');
    expect((await svc.lineView('L2', null)).online).toBe(false);
    expect((await svc.resumeLine(attorney('L2'))).online).toBe(false);
  });

  it('UC 13: client cancels during an offer → the attorney is freed and gets the next', async () => {
    if (!up) return;
    const a = await ask('C1');
    now += 1;
    const b = await ask('C2');
    await goLine('L1');
    const v = await svc.cancelRequest(client('C1'), a.id);
    expect(v.status).toBe('cancelled');
    expect(
      events.some(
        (e) =>
          e.event === 'hotline:offer_ended' && e.data.reason === 'cancelled',
      ),
    ).toBe(true);
    expect(offersTo('L1').at(-1)?.data.requestId).toBe(b.id);
    expect((await svc.accept(attorney('L1'), a.id)).state).toBe('gone');
  });

  it('UC 14: the waiting client loses the connection → removed after TTL; back in time → keeps his place', async () => {
    if (!up) return;
    const a = await ask('C1');
    const b = await ask('C2');
    now += 40_000;
    await svc.heartbeat('C2');
    await tick(25_000);
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('cancelled');
    expect((await svc.getRequest(client('C1'), a.id)).endReason).toBe('lost');
    expect((await svc.getRequest(client('C2'), b.id)).status).toBe('queued');
  });

  it('UC 15: both sides gone during the call → the call ends «lost»; the call reconnecting keeps it', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    now += 40_000;
    await svc.heartbeat('C1'); // one side is enough
    await tick(10_000);
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
    await tick(61_000);
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v.status).toBe('ended');
    expect(v.endReason).toBe('lost');
  });

  it('UC 16: abusive client → 429 after hotline.client_requests_per_hour; one active request per client', async () => {
    if (!up) return;
    cfg['hotline.client_requests_per_hour'] = 1;
    const a = await ask('C1');
    expect((await ask('C1')).id).toBe(a.id); // double tap = same request
    await svc.cancelRequest(client('C1'), a.id);
    await expect(ask('C1')).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });

  it('UC 17: client without an SMS-verified phone → 403', async () => {
    if (!up) return;
    users.C9 = { first_name: 'X', last_name: 'Y', phone_verified_at: null };
    await expect(ask('C9')).rejects.toMatchObject({
      response: {
        code: 'FORBIDDEN',
        details: { reason: 'phone_not_verified' },
      },
    });
  });

  it('UC 18: conflict hook — the client is named in a case the attorney handled, or a block → skipped', async () => {
    if (!up) return;
    await goLine('L1');
    now += 1;
    await goLine('L2');
    now += 1;
    await goLine('L3');
    pastCases.L1 = [
      { title: 'Smith v. Bob ClientC1', description: 'custody dispute' },
    ];
    blocks.push(['C1', 'L2']);
    const a = await ask('C1');
    expect(offersTo('L1')).toHaveLength(0);
    expect(offersTo('L2')).toHaveLength(0);
    expect(offersTo('L3')[0].data.requestId).toBe(a.id);
  });

  it('scenarios 24.11 (blocked users): a block made after a remembered «no conflict» applies at the very next offer', async () => {
    if (!up) return;
    cfg['hotline.conflict_cache_sec'] = 3600;
    await goLine('L1');
    const first = await ask('C1');
    // the pair is now remembered as «no conflict» for an hour
    expect(offersTo('L1').map((e) => e.data.requestId)).toEqual([first.id]);
    await svc.decline(attorney('L1'), first.id);
    await svc.cancelRequest(client('C1'), first.id);
    // «Заблокировать и пожаловаться» in that call
    blocks.push(['L1', 'C1']);
    now += 60_000;
    const again = await ask('C1');
    expect(offersTo('L1').map((e) => e.data.requestId)).not.toContain(again.id);
    // and the other way round: the client blocked the attorney
    blocks.length = 0;
    await svc.cancelRequest(client('C1'), again.id);
    blocks.push(['C1', 'L1']);
    now += 60_000;
    const third = await ask('C1');
    expect(offersTo('L1').map((e) => e.data.requestId)).not.toContain(third.id);
  });

  it('UC 19 (owner b): 3 attorneys join, 2 online + offline list → 2 online served, offline notified for the 3rd', async () => {
    if (!up) return;
    const offs: string[] = [];
    for (const id of ['O1', 'O2', 'O3']) {
      const v = await ask(id);
      await svc.notifyMe(client(id), v.id, 'UTC', true);
      offs.push(v.id);
      now += 1;
    }
    const on1 = await ask('C1');
    now += 1;
    const on2 = await ask('C2');
    await goLine('L1');
    now += 1;
    await goLine('L2');
    now += 1;
    await goLine('L3');
    expect(offersTo('L1')[0].data.requestId).toBe(on1.id);
    expect(offersTo('L2')[0].data.requestId).toBe(on2.id);
    expect(offersTo('L3')).toHaveLength(0);
    await tick();
    const notices = events.filter((e) => e.event === 'hotline:notify');
    // ceil(1 free × 150 %) = 2, oldest first
    expect(notices.map((e) => e.data.requestId)).toEqual([offs[0], offs[1]]);
    expect(notices[0].data.token).toEqual(expect.any(String));
  });

  it('UC 20 (owner d): the notified client taps after the attorney was taken → online with his ORIGINAL time, served next', async () => {
    if (!up) return;
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    expect((await svc.getRequest(client('O1'), off.id)).status).toBe('offline');
    await goLine('L1');
    await tick();
    expect(events.filter((e) => e.event === 'hotline:notify')).toHaveLength(1);
    now += 5000;
    await ask('LIVE'); // a live caller takes L1 meanwhile
    expect(offersTo('L1')).toHaveLength(1);
    now += 5000;
    await ask('NEWER');
    const v = await svc.claim(client('O1'), off.id);
    expect(v.status).toBe('queued');
    expect(await svc.claim(client('O1'), off.id)).toMatchObject({
      status: 'queued',
    }); // double tap
    await goLine('L2');
    expect(offersTo('L2')[0].data.requestId).toBe(off.id);
  });

  it('UC 21: 3 notices without coming online → closed «Мы не дозвонились…» (notify_exhausted)', async () => {
    if (!up) return;
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    await goLine('L1');
    for (let i = 0; i < 4; i++) {
      if (i > 0) now += 30_000;
      await svc.heartbeat('L1');
      if (i > 0) now += 30_001;
      await svc.heartbeat('L1');
      await tick();
    }
    expect(events.filter((e) => e.event === 'hotline:notify')).toHaveLength(3);
    const v = await svc.getRequest(client('O1'), off.id);
    expect(v.status).toBe('cancelled');
    expect(v.endReason).toBe('notify_exhausted');
  });

  it('UC 22: no notices at night in the client’s time zone unless he allowed it', async () => {
    if (!up) return;
    // now = 08:00 UTC = 00:00 in Los Angeles (night 21–8)
    const night = await ask('O1');
    await svc.notifyMe(client('O1'), night.id, 'America/Los_Angeles', false);
    const ok = await ask('O2');
    await svc.notifyMe(client('O2'), ok.id, 'America/Los_Angeles', true);
    await goLine('L1');
    await tick();
    expect(
      events
        .filter((e) => e.event === 'hotline:notify')
        .map((e) => e.data.requestId),
    ).toEqual([ok.id]);
  });

  it('UC 23: «Сообщите мне» expires after hotline.notify_max_wait_sec (a day)', async () => {
    if (!up) return;
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    await tick(86_400_001);
    const v = await svc.getRequest(client('O1'), off.id);
    expect(v.status).toBe('cancelled');
    expect(v.endReason).toBe('notify_expired');
  });

  it('UC 24: «Принимать звонки» off in a call → no new offers after it; on → the next waiting client', async () => {
    if (!up) return;
    const a = await ask('C1');
    now += 1;
    const b = await ask('C2');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    await svc.setAccepting(attorney('L1'), false);
    await svc.endCall(a.id, 'ended', 'L1');
    expect((await svc.lineView('L1', null)).state).toBe('not_accepting');
    expect(offersTo('L1')).toHaveLength(1);
    await svc.setAccepting(attorney('L1'), true);
    expect(offersTo('L1').at(-1)?.data.requestId).toBe(b.id);
  });

  it('UC 25: the attorney drops off the line during a call → the call goes on; afterwards he is not on the line', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    await svc.goOffline('L1', 'disconnected');
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
    await svc.endCall(a.id, 'ended', 'C1');
    await ask('C2');
    expect(offersTo('L1')).toHaveLength(1);
    expect((await svc.lineView('L1', null)).online).toBe(false);
  });

  it('UC 26: max queue length per bucket → «все заняты» (queue_full)', async () => {
    if (!up) return;
    cfg['hotline.max_queue_per_bucket'] = 1;
    await ask('C1');
    const v = await ask('C2');
    expect(v.status).toBe('cancelled');
    expect(v.endReason).toBe('queue_full');
  });

  it('UC 27: «Поменять язык» keeps the original place', async () => {
    if (!up) return;
    const a = await ask('C1', ['en']);
    now += 1000;
    await ask('C2', ['es']);
    await svc.changeLanguages(client('C1'), a.id, ['es']);
    await goLine('L1', ['es']);
    expect(offersTo('L1')[0].data.requestId).toBe(a.id);
  });

  it('UC 28: counters — banded, only watched keys, pushed only when the shown value changes', async () => {
    if (!up) return;
    const key = `b:${bucketOf('CA', 'family', 'en')}`;
    await redis.zadd(k.watch, now + 60_000, key);
    for (let i = 0; i < 12; i++) await goLine(`L${i}`);
    expect(await svc.counters([key])).toEqual({
      [key]: { lawyers: '10+', clients: '0' },
    });
    expect(await sweeper.pushCounters(redis, now, [1, 10, 50, 100])).toBe(1);
    expect(rooms[0]).toMatchObject({
      room: `hotline:c:${key}`,
      data: { lawyers: '10+' },
    });
    await goLine('L99'); // 13 attorneys: still «10+» → nothing sent
    expect(await sweeper.pushCounters(redis, now, [1, 10, 50, 100])).toBe(0);
    // nobody watching → nothing computed
    await redis.del(k.watch);
    expect(await sweeper.pushCounters(redis, now, [1, 10, 50, 100])).toBe(0);
  });

  it('UC 29 (owner c): burst — 200 online waiting + 220 attorneys joining → each client one attorney, 20 idle', async () => {
    if (!up) return;
    const reqs: string[] = [];
    for (let i = 0; i < 200; i++) {
      reqs.push((await ask(`C${i}`)).id);
      now += 1;
    }
    for (let i = 0; i < 220; i++) await goLine(`L${i}`);
    const offered = events.filter((e) => e.event === 'hotline:offer');
    expect(offered).toHaveLength(200);
    expect(new Set(offered.map((e) => e.data.requestId)).size).toBe(200);
    expect(offered[0].data.requestId).toBe(reqs[0]);
  });

  it('UC 30: the sweeper works on ONE instance at a time (Valkey lock) and not at all while the switch is off', async () => {
    if (!up) return;
    const other = new HotlineSweeper(
      svc,
      { toRoom: () => 0 } as never,
      {
        setContext: () => undefined,
        warn: () => undefined,
      } as never,
    );
    const [a, b] = await Promise.all([sweeper.tick(), other.tick()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    flagOn = false;
    await redis.del(k.tick);
    expect(await sweeper.tick()).toBe(false);
  });

  it('UC 31: admin live view — exact numbers from Valkey only', async () => {
    if (!up) return;
    await goLine('L1');
    const a = await ask('C1');
    await svc.accept(attorney('L1'), a.id);
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    const live = await new AdminHotlineController(
      svc,
      {} as never,
    ).adminHotlineLive();
    expect(live).toMatchObject({
      inCall: 1,
      callsNow: 1,
      waitingOffline: 1,
    });
    expect(live.idle + live.offered).toBe(0);
    expect(live.buckets[0]).toMatchObject({ lawyers: 1, waiting: 1 });
    expect(live.hours[0].requests).toBe(2);
  });

  it('UC 32: GET /hotline/requests/:id tag changes only when what the client sees changes (ETag / 304)', async () => {
    if (!up) return;
    const a = await ask('C1');
    const t1 = await svc.requestTag(client('C1'), a.id);
    expect(await svc.requestTag(client('C1'), a.id)).toBe(t1);
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    expect(await svc.requestTag(client('C1'), a.id)).not.toBe(t1);
    expect(await svc.requestTag(client('C2'), a.id)).toBeNull();
  });

  it('UC 33: only the bridge reaches the 1:1 calls, and only their public service', () => {
    const dir = __dirname;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.spec.ts')) continue;
      const text = readFileSync(join(dir, f), 'utf8');
      const imports = [...text.matchAll(/from '(\.\.\/calls\/[^']+)'/g)].map(
        (m) => m[1],
      );
      if (f === 'hotline-call-bridge.ts') {
        expect(imports).toEqual(['../calls/calls.service']);
      } else {
        expect([f, imports]).toEqual([f, []]);
      }
    }
  });

  it('UC 34 (PR 4): «Взять» opens ONE real voice call (client → attorney, answered at «Взять»); the client sees it', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    now += 4000; // the offer rang 4 s: not billed
    const res = await svc.accept(attorney('L1'), a.id);
    expect(res).toMatchObject({ ok: true, state: 'connected' });
    const callId = (res as { callId: string }).callId;
    expect(callId).toMatch(/^call-/);
    expect(bridgeLog).toEqual([`open C1->L1 at ${now}`]);
    // a repeated «Взять» is the same call
    expect(await svc.accept(attorney('L1'), a.id)).toMatchObject({ callId });
    expect(bridgeLog).toHaveLength(1);
    expect(
      events.find((e) => e.event === 'hotline:connected')?.data,
    ).toMatchObject({ requestId: a.id, callId, video: false });
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v).toMatchObject({ status: 'connected', callId });
  });

  it('scenarios 24.11: an attorney in a 1:1 call (any device) gets no offer — the client goes to the next one, he is asked again after one heartbeat', async () => {
    if (!up) return;
    build(fakeBridge());
    cfg['hotline.heartbeat_sec'] = 5;
    await goLine('L1');
    now += 1;
    await goLine('L2');
    busyIn.add('L1'); // a chat call on his laptop
    const a = await ask('C1');
    expect(offersTo('L1')).toHaveLength(0);
    expect(offersTo('L2').map((e) => e.data.requestId)).toEqual([a.id]);
    // the 1:1 call is over; after the rest the line asks him again
    busyIn.delete('L1');
    now += 6000;
    await tick();
    const b = await ask('C2');
    expect(offersTo('L1').map((e) => e.data.requestId)).toEqual([b.id]);
  });

  it('scenarios 24.11: two attorneys tap «Взять» on one client at the same instant → only the attorney the line reserved gets the call', async () => {
    if (!up) return;
    build(fakeBridge());
    await goLine('L1');
    now += 1;
    await goLine('L2');
    const a = await ask('C1');
    // the offer is reserved for L1 only (Twilio TaskRouter reservation)
    expect(offersTo('L1').map((e) => e.data.requestId)).toEqual([a.id]);
    expect(offersTo('L2')).toHaveLength(0);
    const [one, two] = await Promise.all([
      svc.accept(attorney('L1'), a.id),
      svc.accept(attorney('L2'), a.id),
    ]);
    expect(one).toMatchObject({ ok: true, state: 'connected' });
    expect(two).toMatchObject({ ok: false });
    expect(bridgeLog.filter((l) => l.startsWith('open'))).toEqual([
      `open C1->L1 at ${now}`,
    ]);
  });

  it('UC 35 (PR 4): the red button on the hotline ends the 1:1 call too; billing from «Взять»; the direct chat opens', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    now += 3000;
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    now += 90_000;
    expect(await svc.endCall(a.id, 'ended', 'L1')).toEqual({
      ok: true,
      seconds: 90,
      conversationId: 'conv-C1',
    });
    expect(bridgeLog.slice(1)).toEqual(['hangUp L1 hangup', 'finish ended 90']);
    expect(calls.get(callId)?.status).toBe('ended');
    expect(events.find((e) => e.event === 'hotline:ended')?.data).toMatchObject(
      { callId, conversationId: 'conv-C1', seconds: 90 },
    );
    expect((await svc.getRequest(client('C1'), a.id)).conversationId).toBe(
      'conv-C1',
    );
  });

  it('UC 36 (PR 4): hung up on the CALL screen (POST /calls/:id/end) → the sync ends the hotline call with the call’s own seconds', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    // the call screens beat (GET /calls/:id) — the hotline call stays up
    // without any hotline heartbeat
    for (let i = 0; i < 4; i++) {
      now += 20_000;
      calls.get(callId)!.beat = now;
      await tick(0);
    }
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
    Object.assign(calls.get(callId)!, {
      status: 'ended',
      dur: 80,
      end: 'hangup',
    });
    await tick(2001);
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v).toMatchObject({ status: 'ended', endReason: 'ended' });
    expect(bridgeLog).toContain('finish ended 80');
    expect(bridgeLog.some((l) => l.startsWith('hangUp'))).toBe(false);
    expect(await redis.hget(k.trial('L1'), 'seconds')).toBe('80');
  });

  it('UC 37 (PR 4): the voice never came up 3 times in a row → the attorney is off the line (like 3 unanswered offers)', async () => {
    if (!up) return;
    build(fakeBridge());
    await goLine('L1');
    for (let i = 0; i < 3; i++) {
      const a = await ask(`C${i}`);
      const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
        callId: string;
      };
      now += 20_000;
      await svc.heartbeat('L1'); // he stays on the hotline screen
      // the app gave up connecting: `failed` → ended / link_lost, 20 s
      Object.assign(calls.get(callId)!, {
        status: 'ended',
        dur: 20,
        end: 'link_lost',
      });
      await tick(2001);
      expect((await svc.getRequest(client(`C${i}`), a.id)).endReason).toBe(
        'failed',
      );
    }
    expect((await svc.lineView('L1', null)).online).toBe(false);
    expect(
      events.filter((e) => e.event === 'hotline:line').at(-1)?.data,
    ).toMatchObject({ online: false, reason: 'missed' });
  });

  it('UC 38 (PR 4): a real conversation breaks the «no answer» row', async () => {
    if (!up) return;
    build(fakeBridge());
    await goLine('L1');
    await ask('C1');
    await tick(10_001); // miss 1 (no «Взять»); C1 never goes to L1 again
    const b = await ask('C2');
    const { callId } = (await svc.accept(attorney('L1'), b.id)) as {
      callId: string;
    };
    expect(await redis.hget(k.lawyer('L1'), 'misses')).toBe('1');
    for (let i = 0; i < 4; i++) {
      now += 30_000;
      await svc.heartbeat('L1');
      calls.get(callId)!.beat = now;
      await tick(0);
    }
    Object.assign(calls.get(callId)!, {
      status: 'ended',
      dur: 120,
      end: 'hangup',
    });
    await tick(2001);
    expect(await redis.hget(k.lawyer('L1'), 'misses')).toBe('0');
  });

  // ── audit 17.11 (docs/dev/HOTLINE_AUDIT_2026-11-17.md): each failed
  // before its fix ────────────────────────────────────────────────────────

  it('audit #2 (P1): a LOST call is billed to its last sign of life — talked 30 s, both gone → 30 s, not 30 + the 60 s window', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    now += 30_000;
    await svc.heartbeat('C1'); // the last beat: 30 s into the call
    await tick(61_000);
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v).toMatchObject({ status: 'ended', endReason: 'lost' });
    expect(await redis.hget(k.request(a.id), 'seconds')).toBe('30');
    expect(await redis.hget(k.trial('L1'), 'seconds')).toBe('30');
    expect(events.find((e) => e.event === 'hotline:ended')?.data.seconds).toBe(
      30,
    );
  });

  it('audit #2 (P2): the switch off for an hour, the call hung up at 30 s meanwhile → after «on» the sweeper syncs FIRST: 30 s, not 3630 s', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    flagOn = false;
    expect(await sweeper.tick()).toBe(false); // the sweeper sees «off»
    // hung up on the call screen 30 s in; the hotline heard nothing
    Object.assign(calls.get(callId)!, {
      status: 'ended',
      dur: 30,
      end: 'hangup',
      beat: now + 30_000,
    });
    now += 3_600_000;
    flagOn = true;
    await redis.del(k.tick);
    expect(await sweeper.tick()).toBe(true);
    const v = await svc.getRequest(client('C1'), a.id);
    expect(v).toMatchObject({ status: 'ended', endReason: 'ended' });
    expect(await redis.hget(k.request(a.id), 'seconds')).toBe('30');
    expect(bridgeLog).toContain('finish ended 30');
  });

  it('audit #2: after «on» a call that is still up is NOT closed as lost (its phones get one window to beat again)', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    flagOn = false;
    await sweeper.tick();
    now += 3_600_000; // heartbeats refused while off
    flagOn = true;
    await redis.del(k.tick);
    await sweeper.tick();
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
    now += 20_000;
    await svc.heartbeat('L1'); // the phone beats again: the call goes on
    await redis.del(k.tick);
    now += 50_000;
    await sweeper.tick();
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
  });

  it('audit #4 (P3, P9, licence): access is re-checked after each call and every N heartbeats — lost → off the line with the reason', async () => {
    if (!up) return;
    cfg['hotline.access_check_beats'] = 3;
    // «Выкл для всех» while he waits (P9)
    await goLine('L1');
    cfg['hotline.mode'] = 'off_for_all';
    for (let i = 0; i < 3; i++) {
      now += 1000;
      await svc.heartbeat('L1');
    }
    expect((await svc.lineView('L1', null)).online).toBe(false);
    expect(
      events.filter((e) => e.event === 'hotline:line').at(-1)?.data,
    ).toMatchObject({ online: false, reason: 'access', detail: 'off_for_all' });
    await ask('C9');
    expect(offersTo('L1')).toHaveLength(0);
    // the trial ran out during a call (P3): off right after it
    cfg['hotline.mode'] = 'by_subscription';
    cfg['hotline.trial_minutes'] = 1;
    await svc.cancelRequest(client('C9'), (await ask('C9')).id);
    await goLine('L2');
    const a = await ask('C1');
    await svc.accept(attorney('L2'), a.id);
    now += 180_000;
    await svc.endCall(a.id, 'ended', 'C1');
    expect((await svc.lineView('L2', null)).online).toBe(false);
    expect(
      events.filter((e) => e.event === 'hotline:line').at(-1)?.data,
    ).toMatchObject({ reason: 'access', detail: 'not_in_plan' });
    await ask('C2');
    expect(offersTo('L2')).toHaveLength(1);
    // the licence was revoked while he waits
    cfg['hotline.mode'] = 'on_for_all';
    await goLine('L3');
    licences.L3 = [];
    for (let i = 0; i < 3; i++) {
      now += 1000;
      await svc.heartbeat('L3');
    }
    expect((await svc.lineView('L3', null)).online).toBe(false);
    expect(
      events.filter((e) => e.event === 'hotline:line').at(-1)?.data,
    ).toMatchObject({ reason: 'access', detail: 'licence' });
  });

  it('audit #5 (P7): two «Взять» in the same instant open exactly ONE call; both get its id', async () => {
    if (!up) return;
    build(fakeBridge());
    openDelayMs = 80; // the database is slow: the race window is wide open
    const a = await ask('C1');
    await goLine('L1');
    const [x, y] = await Promise.all([
      svc.accept(attorney('L1'), a.id),
      svc.accept(attorney('L1'), a.id),
    ]);
    expect(bridgeLog.filter((l) => l.startsWith('open'))).toHaveLength(1);
    expect(calls.size).toBe(1);
    expect((x as { callId: string }).callId).toBe(
      (y as { callId: string }).callId,
    );
    expect(await redis.exists(k.callLock(a.id))).toBe(0);
  });

  it('audit #6: only the CLIENT calls back — through the hotline, to that same attorney, within hotline.callback_window_hours', async () => {
    if (!up) return;
    build(fakeBridge());
    await goLine('L1');
    const a = await ask('C1');
    expect(offersTo('L1')[0].data.requestId).toBe(a.id);
    await svc.accept(attorney('L1'), a.id);
    now += 30_000;
    await svc.heartbeat('L1');
    await svc.endCall(a.id, 'ended', 'C1');
    // L1 is busy with somebody else now; L2 idle — the call-back still
    // waits for L1 only
    const other = await ask('C2');
    expect(offersTo('L1').at(-1)?.data.requestId).toBe(other.id);
    await svc.accept(attorney('L1'), other.id);
    await goLine('L2'); // another attorney, idle, same filters
    const back = await svc.callBack(client('C1'), {
      attorneyId: 'L1',
      languages: ['en'],
      topic: 'One more question',
    });
    expect(back.status).toBe('queued');
    expect(offersTo('L2').some((e) => e.data.requestId === back.id)).toBe(
      false,
    );
    now += 30_000;
    await svc.heartbeat('C1');
    await svc.endCall(other.id, 'ended', 'L1');
    expect(offersTo('L1').at(-1)?.data).toMatchObject({
      requestId: back.id,
      topic: 'One more question',
      state: 'CA',
    });
    // nobody else can «call back» an attorney he never talked to
    await expect(
      svc.callBack(client('C3'), {
        attorneyId: 'L1',
        languages: ['en'],
        topic: 'x',
      }),
    ).rejects.toMatchObject({ status: 403 });
    // the window closes
    cfg['hotline.callback_window_hours'] = 1;
    now += 2 * 3_600_000;
    await expect(
      svc.callBack(client('C2'), {
        attorneyId: 'L1',
        languages: ['en'],
        topic: 'x',
      }),
    ).rejects.toMatchObject({ status: 403 });
    // an attorney has no such door at all (assertClient)
    await expect(
      svc.callBack(attorney('L1'), {
        attorneyId: 'L1',
        languages: ['en'],
        topic: 'x',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('audit #7 (P5a): zone unknown (phone and account) → the zone of the request’s state; nothing known → the widest US night', async () => {
    if (!up) return;
    // now = 08:00 UTC = 00:00 in California (night 21–8)
    const night = await ask('O1');
    await svc.notifyMe(client('O1'), night.id, undefined, false);
    await goLine('L1');
    await tick();
    expect(events.filter((e) => e.event === 'hotline:notify')).toHaveLength(0);
    expect(await redis.hget(k.nq, night.id)).toMatch(/^-4[28]0,1260,480$/);
    // 16:00 UTC = 08:00 in California: the morning notice goes out
    now += 8 * 3_600_000;
    await goLine('L1');
    await tick();
    expect(
      events
        .filter((e) => e.event === 'hotline:notify')
        .map((e) => e.data.requestId),
    ).toEqual([night.id]);
  });

  it('audit #8 (P4): hotline.queue_max_wait_sec is used — an online waiter is closed «queue_timeout»; «Сообщите мне» is not', async () => {
    if (!up) return;
    cfg['hotline.queue_max_wait_sec'] = 60;
    const a = await ask('C1');
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    for (let i = 0; i < 3; i++) {
      now += 25_000;
      await svc.heartbeat('C1');
      await tick();
    }
    expect(await svc.getRequest(client('C1'), a.id)).toMatchObject({
      status: 'cancelled',
      endReason: 'queue_timeout',
    });
    expect((await svc.getRequest(client('O1'), off.id)).status).toBe('offline');
  });

  it('audit #8: the place / wait / «Ещё звонят» steps, the «Пропустить» memory, the key life and the batch come from the admin', async () => {
    if (!up) return;
    cfg['hotline.position_bands'] = [3];
    cfg['hotline.wait_band_minutes'] = [100];
    cfg['hotline.key_ttl_hours'] = 100;
    const a = await ask('C1');
    expect(a).toMatchObject({ positionBand: '1-3', waitBand: 'lt100' });
    expect(await redis.ttl(k.request(a.id))).toBeGreaterThan(99 * 3600);
    expect(await redis.ttl(k.client('C1'))).toBeGreaterThan(99 * 3600);
    cfg['hotline.waiting_more_bands'] = [1, 1000];
    now += 1; // C1 is the older one
    await ask('C2');
    await goLine('L1');
    expect(offersTo('L1')[0].data.waitingMore).toBe('1');
    expect(await redis.ttl(k.lawyer('L1'))).toBeGreaterThan(99 * 3600);
    cfg['hotline.skip_memory_sec'] = 120;
    await svc.decline(attorney('L1'), a.id);
    const skipped = await redis.zscore(k.rqd, `${a.id}|L1`);
    expect(Number(skipped)).toBe(now + 120_000);
  });

  it('audit #9: the sweeper lock is held (renewed) for the whole pass — a pass longer than the lease never overlaps another instance', async () => {
    if (!up) return;
    cfg['hotline.sweep_interval_ms'] = 200;
    const other = new HotlineSweeper(
      svc,
      { toRoom: () => 0 } as never,
      { setContext: () => undefined, warn: () => undefined } as never,
    );
    let release!: () => void;
    jest
      .spyOn(sweeper, 'sweep')
      .mockImplementation(() => new Promise<void>((ok) => (release = ok)));
    // the first tick reads the interval; the lease is 1000 ms
    const first = sweeper.tick();
    await new Promise((ok) => setTimeout(ok, 1500)); // > the lease
    expect(await other.tick()).toBe(false); // still held: renewed
    release();
    expect(await first).toBe(true);
    // after the pass the lock lives only what is left of the interval
    expect(await redis.pttl(k.tick)).toBeLessThanOrEqual(200);
  });

  it('audit #10 (P6): a tap on an OLDER notice of the same request works; another request’s token does not', async () => {
    if (!up) return;
    const off = await ask('O1');
    await svc.notifyMe(client('O1'), off.id, 'UTC', true);
    await svc.notify(off.id, 60);
    const firstToken = events.at(-1)!.data.token as string;
    await svc.notify(off.id, 60);
    expect(events.at(-1)!.data.token).not.toBe(firstToken);
    expect((await svc.claim(client('O1'), off.id, firstToken)).status).toBe(
      'queued',
    );
    expect(await redis.ttl(k.tokens(off.id))).toBeGreaterThan(0);
    const other = await ask('O2');
    await expect(
      svc.claim(client('O2'), other.id, firstToken),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('audit #12: TTLs on every per-person key (trial, kept line, tokens) and counters nobody watches are dropped', async () => {
    if (!up) return;
    await goLine('L1');
    expect(await redis.ttl(k.trial('L1'))).toBeGreaterThan(399 * 86_400);
    await redis.zadd(k.watch, now - 1, 'b:CA~family~en');
    await redis.hset(k.cnt, 'b:CA~family~en', '1|0');
    await sweeper.pushCounters(redis, now, [1, 10]);
    expect(await redis.hexists(k.cnt, 'b:CA~family~en')).toBe(0);
  });

  it('audit P12: the ETag of GET /hotline/requests/:id is built without the whole view, and changes exactly with it', async () => {
    if (!up) return;
    const a = await ask('C1');
    const viewSpy = jest.spyOn(svc, 'view');
    const t1 = await svc.requestTag(client('C1'), a.id);
    expect(viewSpy).not.toHaveBeenCalled();
    expect(await svc.requestTag(client('C1'), a.id)).toBe(t1);
    // a second waiter ahead? no — behind: the place stays «1»
    now += 1;
    await ask('C2');
    expect(await svc.requestTag(client('C1'), a.id)).toBe(t1);
    // «Понятно» hides the disclosure: the view changed, so the tag did
    await svc.ackDisclosure(client('C1'));
    const t2 = await svc.requestTag(client('C1'), a.id);
    expect(t2).not.toBe(t1);
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    expect(await svc.requestTag(client('C1'), a.id)).not.toBe(t2);
    expect(await svc.requestTag(client('C2'), a.id)).toBeNull();
    viewSpy.mockRestore();
  });

  // ── verify 17.11 (batch 5b): each failed before its fix ────────────────

  it('verify H1: «Взять» renews the request / client key TTL', async () => {
    if (!up) return;
    const a = await ask('C1');
    // the creation TTL nearly spent when he takes it
    await redis.expire(k.request(a.id), 5);
    await redis.expire(k.client('C1'), 5);
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    expect(await redis.ttl(k.request(a.id))).toBeGreaterThan(5);
    expect(await redis.ttl(k.client('C1'))).toBeGreaterThan(5);
  });

  it('verify H1: a request hash expired under a call → cleaned, the sweeper goes on', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    now += 1;
    const b = await ask('C2');
    await goLine('L2');
    await svc.accept(attorney('L2'), b.id);
    await redis.del(k.request(a.id)); // the hash expired mid-call
    await expect(tick(61_000)).resolves.toBeUndefined();
    expect(await redis.zscore(k.conn, a.id)).toBeNull();
    expect(await redis.zscore(`${k.p}:connmax`, a.id)).toBeNull();
    expect(await svc.store.requestState(a.id)).toBeNull();
    expect(await svc.store.lawyerState('L1')).not.toBe(`b|${a.id}`);
    // the other lost call was still ended by the same pass
    expect((await svc.getRequest(client('C2'), b.id)).status).toBe('ended');
    // and a throwing item never stops the pass
    const spy = jest
      .spyOn(svc, 'endCall')
      .mockRejectedValueOnce(new Error('boom'));
    now += 1;
    const c = await ask('C3');
    await goLine('L3');
    await svc.accept(attorney('L3'), c.id);
    await expect(tick(61_000)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('verify H2: the 1:1 call ended first with dead air → billed to the last beat; voice never up → 0', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    for (let i = 0; i < 2; i++) {
      now += 20_000;
      calls.get(callId)!.beat = now;
      await tick(0);
    }
    // the link died at 40 s; the calls sweep closed it for silence later
    Object.assign(calls.get(callId)!, {
      status: 'ended',
      dur: 200,
      end: 'silent',
    });
    await tick(2001);
    expect(await redis.hget(k.request(a.id), 'seconds')).toBe('40');
    expect(bridgeLog).toContain('finish ended 40');
    // voice never came up (link lost at 20 s): nothing billed
    now += 1;
    const b = await ask('C2');
    await svc.heartbeat('L1');
    const r2 = (await svc.accept(attorney('L1'), b.id)) as { callId: string };
    now += 20_000;
    calls.get(r2.callId)!.beat = now;
    Object.assign(calls.get(r2.callId)!, {
      status: 'ended',
      dur: 20,
      end: 'link_lost',
    });
    await tick(2001);
    expect(await redis.hget(k.request(b.id), 'endReason')).toBe('failed');
    expect(await redis.hget(k.request(b.id), 'seconds')).toBe('0');
  });

  it('fix #1235: a hang-up on the call screen is billed in full, not to the last beat', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    now += 20_000;
    calls.get(callId)!.beat = now;
    await tick(0);
    // hung up 7 s after the last beat (beats come every few seconds)
    Object.assign(calls.get(callId)!, {
      status: 'ended',
      dur: 27,
      end: null,
    });
    await tick(2001);
    expect(await redis.hget(k.request(a.id), 'seconds')).toBe('27');
  });

  it('verify H3: two racing ends of one failed call count ONE miss', async () => {
    if (!up) return;
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    await Promise.all([
      svc.endCall(a.id, 'failed'),
      svc.endCall(a.id, 'failed'),
    ]);
    expect(await redis.hget(k.lawyer('L1'), 'misses')).toBe('1');
  });

  it('verify H4: raiseBeat is an atomic max (a late smaller beat never lowers it) and never recreates an expired hash', async () => {
    if (!up) return;
    const a = await ask('C1');
    const raise = (at: number) =>
      (
        svc as unknown as { raiseBeat(r: string, at: number): Promise<void> }
      ).raiseBeat(a.id, at);
    await Promise.all([raise(2000), raise(1000)]);
    expect(await redis.hget(k.request(a.id), 'beatAt')).toBe('2000');
    await redis.del(k.request(a.id));
    await raise(3000);
    expect(await redis.exists(k.request(a.id))).toBe(0);
  });

  it('verify H5: «away» from one device keeps him on the line while another device still holds a line socket', async () => {
    if (!up) return;
    await goLine('L1');
    const gw = new HotlineGateway(svc);
    const sock = (id: string) =>
      ({ id, data: { user: { sub: 'L1' } } }) as never;
    const phone = sock('s-phone');
    const tablet = sock('s-tablet');
    now += 1000;
    expect((await gw.heartbeat(phone)).line).toBe(true);
    now += 1000;
    expect((await gw.heartbeat(tablet)).line).toBe(true);
    await gw.away(phone);
    expect((await svc.lineView('L1', null)).online).toBe(true);
    await gw.away(tablet);
    expect((await svc.lineView('L1', null)).online).toBe(false);
  });

  it('verify H6: a long call keeps the busy attorney alive (call beats only, no line beats)', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    const { callId } = (await svc.accept(attorney('L1'), a.id)) as {
      callId: string;
    };
    for (let i = 0; i < 6; i++) {
      now += 20_000;
      calls.get(callId)!.beat = now;
      await tick(0);
    }
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('connected');
    expect(Number(await redis.zscore(k.alive, 'L1'))).toBeGreaterThan(now);
  });

  it('verify batch 13 (R1): an hour with a lawyer online and no other event still gets a TTL on its stats hash', async () => {
    if (!up) return;
    await goLine('L1');
    await tick();
    const aggKey = k.agg(new Date(now).toISOString().slice(0, 13));
    expect(await redis.hget(aggKey, 'peakOnline')).toBe('1');
    expect(await redis.ttl(aggKey)).toBeGreaterThan(0);
  });

  // ── plan PR 6–7: the attorney screens (owner 18.11 mockup) ─────────

  it('PR 6: only languages of his own profile put the attorney on the line (owner: the language matters)', async () => {
    if (!up) return;
    spoken.L1 = ['ru'];
    lawyerReady('L1');
    await expect(
      svc.goOnline(attorney('L1'), {
        states: ['CA'],
        practiceAreas: ['family'],
        languages: ['ru', 'en'],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        details: { reason: 'language_not_in_profile', languages: ['en'] },
      },
    });
    expect((await svc.lineView('L1', null)).online).toBe(false);
    await goLine('L1', ['ru']);
    expect((await svc.lineView('L1', null)).languages).toEqual(['ru']);
  });

  it('PR 6: a client asking in English never reaches an attorney on the line in Russian only', async () => {
    if (!up) return;
    spoken.L1 = ['ru'];
    await goLine('L1', ['ru']);
    const a = await ask('C1', ['en']);
    expect(offersTo('L1')).toHaveLength(0);
    expect((await svc.getRequest(client('C1'), a.id)).status).toBe('queued');
    const b = await ask('C2', ['es', 'ru']);
    const offer = offersTo('L1').at(-1)!.data;
    expect(offer.requestId).toBe(b.id);
    // the call's language is the one that matched his line
    expect(offer.language).toBe('ru');
    expect(offer.languages).toEqual(['es', 'ru']);
  });

  it('PR 6: a language he removes from his profile takes him off the line at the next check', async () => {
    if (!up) return;
    await goLine('L1', ['en', 'es']);
    expect(await svc.recheckAccess('L1')).toBe(true);
    spoken.L1 = ['en'];
    expect(await svc.recheckAccess('L1')).toBe(false);
    const off = events.filter((e) => e.event === 'hotline:line').at(-1)!;
    expect(off.data).toMatchObject({
      online: false,
      reason: 'access',
      detail: 'language',
    });
  });

  it('PR 6: GET /hotline/config tells the attorney whether and how he may wait for calls', async () => {
    if (!up) return;
    expect((await svc.config(attorney('L1'))).access).toEqual({
      mode: 'on_for_all',
      allowed: true,
      via: 'free',
      reason: null,
    });
    cfg['hotline.mode'] = 'off_for_all';
    expect((await svc.config(attorney('L1'))).access).toEqual({
      mode: 'off_for_all',
      allowed: false,
      via: null,
      reason: 'off_for_all',
    });
    expect((await svc.config(client('C1'))).access).toBeNull();
    // the mode itself for every role (the client's button hides too)
    expect((await svc.config(client('C1'))).mode).toBe('off_for_all');
  });

  it('PR 6: the offer and the connected call carry the topic, language, names, usernames and photos', async () => {
    if (!up) return;
    build(fakeBridge());
    users.C1 = {
      first_name: 'Anna',
      last_name: 'Koval',
      phone_verified_at: new Date(1),
      avatar_file_id: 'f-c1',
      client_profile: { username: 'anna.k' },
    } as never;
    const a = await ask('C1', ['en'], 'Divorce, flat split');
    licences.L1 = [{ state_code: 'CA', bar_number: 'B-L1' }];
    users.L1 = {
      first_name: 'Dan',
      last_name: 'Rivera',
      phone_verified_at: null,
      avatar_file_id: 'f-l1',
      attorney_profile: { username: 'daniel.rivera' },
    } as never;
    await svc.goOnline(attorney('L1'), {
      states: ['CA'],
      practiceAreas: ['family'],
      languages: ['en'],
    });
    expect(offersTo('L1').at(-1)!.data).toMatchObject({
      requestId: a.id,
      topic: 'Divorce, flat split',
      state: 'CA',
      practiceArea: 'family',
      language: 'en',
      clientName: 'Anna K',
      clientUsername: 'anna.k',
      clientAvatarUrl: 'https://cdn.test/f-c1.jpg',
    });
    await svc.accept(attorney('L1'), a.id);
    const conn = events.find((e) => e.event === 'hotline:connected')!;
    expect(conn.to.sort()).toEqual(['C1', 'L1']);
    expect(conn.data).toMatchObject({
      topic: 'Divorce, flat split',
      language: 'en',
      client: { id: 'C1', username: 'anna.k' },
      lawyer: {
        id: 'L1',
        name: 'Dan Rivera',
        username: 'daniel.rivera',
        avatarUrl: 'https://cdn.test/f-l1.jpg',
      },
    });
    const view = await svc.getRequest(client('C1'), a.id);
    expect(view.lawyer).toMatchObject({
      username: 'daniel.rivera',
      avatarUrl: 'https://cdn.test/f-l1.jpg',
    });
  });

  it('PR 6: «Клиент ждёт» — in a call with «Принимать звонки» on, the heartbeat names the longest-waiting client', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1', ['en', 'es']);
    await svc.accept(attorney('L1'), a.id);
    expect((await svc.heartbeat('L1')).waiting).toBeNull();
    now += 1000;
    const b = await ask('C2', ['es'], 'Inheritance');
    now += 1000;
    await ask('C3', ['en'], 'Later one');
    const hb = await svc.heartbeat('L1');
    expect(hb.waiting).toMatchObject({
      requestId: b.id,
      topic: 'Inheritance',
      language: 'es',
      state: 'CA',
      practiceArea: 'family',
    });
    // «Принимать звонки» off: nobody is shown
    await svc.setAccepting(attorney('L1'), false);
    expect((await svc.heartbeat('L1')).waiting).toBeNull();
    // an idle attorney's heartbeat has no «waiting» at all
    await goLine('L2');
    expect((await svc.heartbeat('L2')).waiting).toBeUndefined();
  });

  it('PR 7: «Предложить дело» — one case per call to ITS attorney, a double tap gets the same case', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1', ['en'], 'Divorce, flat split');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    const meta = {};
    const [x, y] = await Promise.all([
      svc.offerCase(client('C1'), a.id, { budgetAmountDollars: 1500 }, meta),
      svc.offerCase(client('C1'), a.id, {}, meta),
    ]);
    expect(x).toEqual({ caseId: 'case-1', inviteId: 'inv-1' });
    expect(y).toEqual(x);
    expect(caseOffers).toEqual(['C1->L1 Divorce, flat split']);
    const sent = events.filter((e) => e.event === 'hotline:case_offered');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['L1']);
    expect(sent[0].data).toMatchObject({
      requestId: a.id,
      caseId: 'case-1',
      topic: 'Divorce, flat split',
      state: 'CA',
      budgetCents: 150_000,
    });
    // after the call too, the same case
    await svc.endCall(a.id, 'ended', 'C1');
    expect(await svc.offerCase(client('C1'), a.id, {}, meta)).toEqual(x);
    // nobody else's call, and never the attorney
    await expect(
      svc.offerCase(client('C9'), a.id, {}, meta),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(
      svc.offerCase(attorney('L1'), a.id, {}, meta),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('PR 7: the review — only the client of the call, first answer wins, off with hotline.review_enabled', async () => {
    if (!up) return;
    build(fakeBridge());
    const a = await ask('C1');
    await goLine('L1');
    await svc.accept(attorney('L1'), a.id);
    await svc.endCall(a.id, 'ended', 'L1');
    await expect(
      svc.review(client('C1'), a.id, { stars: 5, comment: ' Great ' }),
    ).resolves.toEqual({ ok: true });
    await svc.review(client('C1'), a.id, { stars: 1 });
    expect(callRows.get(a.id)).toMatchObject({
      review_stars: 5,
      review_comment: 'Great',
    });
    await expect(
      svc.review(client('C2'), a.id, { stars: 3 }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    cfg['hotline.review_enabled'] = false;
    await expect(
      svc.review(client('C1'), a.id, { stars: 3 }),
    ).rejects.toMatchObject({ response: { code: 'FEATURE_DISABLED' } });
  });
});
