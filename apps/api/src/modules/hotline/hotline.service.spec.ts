import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Redis from 'ioredis';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { HotlineConflictService } from './hotline-conflict.service';
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
    k = new HotlineKeys(`hltest:{hls${process.pid}x${n}}`);
    const prisma = {
      attorneyLicense: {
        findMany: ({ where }: { where: { attorney_id: string } }) =>
          Promise.resolve(licences[where.attorney_id] ?? []),
      },
      user: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(users[where.id] ?? null),
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
    );
    sweeper = new HotlineSweeper(
      svc,
      realtime as never,
      {
        setContext: () => undefined,
        warn: () => undefined,
      } as never,
    );
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

  it('UC 4: client, no attorney on the line → waits; the disclosure shows the FIRST time only', async () => {
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
    const again = await ask('C1');
    expect(again.disclosure).toMatchObject({ key: null, kind: null });
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
    // the next offer to the same attorney: no disclosure
    await svc.decline(attorney('L1'), a.id);
    expect(offersTo('L1')[1].data.disclosure).toMatchObject({ key: null });
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

  it('UC 12: the line socket closes (network gone) → off at once; another socket does not', async () => {
    if (!up) return;
    await goLine('L1');
    await svc.heartbeat('L1', 'sock-1');
    await svc.lineSocketClosed('L1', 'sock-other');
    expect((await svc.lineView('L1', null)).online).toBe(true);
    await svc.lineSocketClosed('L1', 'sock-1');
    expect((await svc.lineView('L1', null)).online).toBe(false);
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
    const live = await new AdminHotlineController(svc).adminHotlineLive();
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

  it('UC 33: the hotline never imports or changes the 1:1 calls code', () => {
    const dir = __dirname;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(join(dir, f), 'utf8');
      expect([f, /from '\.\.\/calls\//.test(text)]).toEqual([f, false]);
    }
  });
});
