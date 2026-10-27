import { FakeCloudflare } from './cloudflare-sfu.fake';
import { CloudflareSfuProvider } from './cloudflare-sfu.provider';
import { SfuBrokerService, type SfuCtx } from './sfu-broker.service';
import { CloudflareSfuError } from './cloudflare-sfu.client';

const SDP = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n';
const APP = 'b'.repeat(32);

function setup(settings?: Record<string, string | number>) {
  const cf = new FakeCloudflare();
  const secrets = {
    get: jest
      .fn()
      .mockResolvedValue({ fields: { appId: APP, appToken: 'good-secret' } }),
  };
  const st = {
    string: jest.fn((k: string) => Promise.resolve(settings?.[k] ?? 'p2p')),
    number: jest.fn((k: string) => Promise.resolve(Number(settings?.[k] ?? 4))),
  };
  const broker = new SfuBrokerService(
    secrets as never,
    undefined,
    undefined,
    settings ? (st as never) : undefined,
  );
  (broker as unknown as { provider: CloudflareSfuProvider }).provider =
    new CloudflareSfuProvider(secrets, undefined, cf.fetch);
  return { cf, broker };
}

const USERS = ['u1', 'u2', 'u3', 'u4'];
const ctx = (userId: string, joined = USERS, canPublish = true): SfuCtx => ({
  callId: 'call-1',
  userId,
  canPublish,
  joinedUserIds: joined,
});

async function join(b: SfuBrokerService, u: string) {
  await b.createSession(ctx(u));
  await b.publish(ctx(u), {
    sdp: SDP,
    tracks: [
      { mid: '0', trackName: 'mic' },
      { mid: '1', trackName: 'cam' },
    ],
  });
}

describe('SfuBrokerService: a call of four on a mocked Cloudflare', () => {
  it('join, pull everybody, answer; leave and kick close the tracks; finish clears all', async () => {
    const { cf, broker } = setup();
    for (const u of USERS) await join(broker, u);

    const sub = await broker.subscribe(ctx('u1'), {});
    expect(sub.requiresAnswer).toBe(true);
    expect(sub.type).toBe('offer');
    // 3 other people x (mic + cam)
    expect(sub.subscriptions).toHaveLength(6);
    expect(sub.subscriptions.every((s) => s.userId !== 'u1')).toBe(true);
    await broker.answer(ctx('u1'), SDP);
    expect(cf.calls.some((c) => c.path.endsWith('/renegotiate'))).toBe(true);

    // Pulling again does nothing new.
    const again = await broker.subscribe(ctx('u1'), {});
    expect(again.requiresAnswer).toBe(false);
    expect(again.skipped.every((s) => s.reason === 'already_pulled')).toBe(
      true,
    );

    // u3 leaves: everything they published is closed on Cloudflare.
    const s3 = [...cf.sessions.keys()][2];
    await broker.reconcile('call-1', ['u1', 'u2', 'u4']);
    expect(cf.closedMids(s3).sort()).toEqual(['0', '1']);
    expect((await broker.readiness('call-1')).tracksByUser.u3).toBeUndefined();

    // u4 is kicked.
    const s4 = [...cf.sessions.keys()][3];
    await broker.cleanupUser('call-1', 'u4');
    expect(cf.closedMids(s4).sort()).toEqual(['0', '1']);

    // Finish: the rest go too and no state is left.
    await broker.closeCall('call-1');
    expect(cf.closedMids([...cf.sessions.keys()][0]).sort()).toEqual([
      '0',
      '1',
    ]);
    expect(cf.closedMids([...cf.sessions.keys()][1]).sort()).toEqual([
      '0',
      '1',
    ]);
    expect(await broker.store.all('call-1')).toEqual({});
  });

  it('the publisher session comes from our state, not from the request', async () => {
    const { cf, broker } = setup();
    for (const u of USERS) await join(broker, u);
    const s2 = [...cf.sessions.keys()][1];
    await broker.subscribe(ctx('u1'), {
      userIds: ['u2'],
      // @ts-expect-error a hostile body: extra fields are never read
      sessionId: 'sess-evil',
    });
    const pull = cf.calls.filter((c) => c.path.endsWith('/tracks/new')).pop()!;
    const tracks = pull.body!.tracks as Array<{ sessionId: string }>;
    expect(tracks.map((t) => t.sessionId)).toEqual([s2, s2]);
  });

  it('cannot pull someone who is not joined to this call, or yourself', async () => {
    const { broker } = setup();
    for (const u of USERS) await join(broker, u);
    await join(broker, 'outsider'); // has a session (another call's state is separate), but is not in joinedUserIds
    const r = await broker.subscribe(ctx('u1'), {
      userIds: ['outsider', 'u1'],
    });
    expect(r.subscriptions).toEqual([]);
    expect(r.skipped).toEqual([
      { userId: 'outsider', trackName: '*', reason: 'not_in_call' },
    ]);
  });

  it('publishing: whitelist, size, listener, duplicates', async () => {
    const { broker } = setup();
    await broker.createSession(ctx('u1'));
    await expect(
      broker.publish(ctx('u1'), {
        sdp: SDP,
        tracks: [{ mid: '0', trackName: 'screen' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      broker.publish(ctx('u1'), {
        sdp: 'garbage',
        tracks: [{ mid: '0', trackName: 'mic' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      broker.publish(ctx('u1'), {
        sdp: 'v=0' + 'x'.repeat(70_000),
        tracks: [{ mid: '0', trackName: 'mic' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      broker.publish(ctx('u1', USERS, false), {
        sdp: SDP,
        tracks: [{ mid: '0', trackName: 'mic' }],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await broker.publish(ctx('u1'), {
      sdp: SDP,
      tracks: [{ mid: '0', trackName: 'mic' }],
    });
    await expect(
      broker.publish(ctx('u1'), {
        sdp: SDP,
        tracks: [{ mid: '2', trackName: 'mic' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('no session yet = conflict, never a Cloudflare call', async () => {
    const { cf, broker } = setup();
    await expect(broker.subscribe(ctx('u1'), {})).rejects.toMatchObject({
      status: 409,
    });
    expect(cf.calls).toHaveLength(0);
  });

  it('an unanswered offer blocks the next mutation, a stale one does not', async () => {
    const { broker } = setup();
    for (const u of USERS) await join(broker, u);
    await broker.subscribe(ctx('u1'), { userIds: ['u2'] });
    await expect(
      broker.subscribe(ctx('u1'), { userIds: ['u3'] }),
    ).rejects.toMatchObject({ status: 409 });
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000);
    await expect(
      broker.subscribe(ctx('u1'), { userIds: ['u3'] }),
    ).resolves.toMatchObject({ requiresAnswer: true });
    spy.mockRestore();
  });

  it('answer without an offer is refused', async () => {
    const { broker } = setup();
    await broker.createSession(ctx('u1'));
    await expect(broker.answer(ctx('u1'), SDP)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('mutations of one session run one at a time (queue), others in parallel', async () => {
    const { cf, broker } = setup();
    for (const u of USERS) await join(broker, u);
    let inFlight = 0;
    let maxInFlight = 0;
    const orig = cf.fetch;
    (cf as { fetch: typeof fetch }).fetch = async (
      ...a: Parameters<typeof fetch>
    ) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return orig(...a);
    };
    (broker as unknown as { provider: CloudflareSfuProvider }).provider =
      new CloudflareSfuProvider(
        {
          get: () =>
            Promise.resolve({
              fields: { appId: APP, appToken: 'good-secret' },
            }),
        } as never,
        undefined,
        cf.fetch,
      );
    // Five closes of the same session at once never overlap.
    await Promise.all(
      [0, 1, 2, 3, 4].map(() =>
        broker.close(ctx('u1'), { trackNames: ['cam'] }).catch(() => undefined),
      ),
    );
    expect(maxInFlight).toBe(1);
  });

  it('close: own tracks are force-closed and listed; pulls close by mid', async () => {
    const { cf, broker } = setup();
    for (const u of USERS) await join(broker, u);
    await broker.subscribe(ctx('u1'), { userIds: ['u2'] });
    await broker.answer(ctx('u1'), SDP);
    const r = await broker.close(ctx('u2'), { trackNames: ['cam'] });
    expect(r.closed).toEqual(['1']);
    expect((await broker.readiness('call-1')).tracksByUser.u2).toEqual(['mic']);
    const out = await broker.close(ctx('u1'), { userIds: ['u2'], sdp: SDP });
    expect(out.closed.sort()).toEqual(['0', '1']);
    expect(out.type).toBe('answer');
    const last = cf.calls
      .filter((c) => c.path.endsWith('/tracks/close'))
      .pop()!;
    expect(last.body!.force).toBe(false);
  });

  it('a re-opened session closes the previous one first', async () => {
    const { cf, broker } = setup();
    await join(broker, 'u1');
    const first = [...cf.sessions.keys()][0];
    const s = await broker.createSession(ctx('u1'));
    expect(s.sessionId).not.toBe(first);
    expect(cf.closedMids(first).sort()).toEqual(['0', '1']);
    expect(s.iceServers[0].urls[0]).toContain('stun.cloudflare.com');
  });

  it('Cloudflare 5xx becomes 503 CALL_MEDIA_UNAVAILABLE and the message has no secret', async () => {
    const { cf, broker } = setup();
    await broker.createSession(ctx('u1'));
    cf.failStatus = 503;
    const err = (await broker
      .publish(ctx('u1'), {
        sdp: SDP,
        tracks: [{ mid: '0', trackName: 'mic' }],
      })
      .catch((e: unknown) => e)) as { status: number; response: unknown };
    expect(err.status).toBe(503);
    expect(JSON.stringify(err.response)).toContain('CALL_MEDIA_UNAVAILABLE');
    expect(JSON.stringify(err.response)).not.toContain('good-secret');
  });

  it('a per-track pull error is skipped, not fatal', async () => {
    const { cf, broker } = setup();
    for (const u of USERS) await join(broker, u);
    cf.refusePull.add('cam');
    const r = await broker.subscribe(ctx('u1'), { userIds: ['u2'] });
    expect(r.subscriptions.map((s) => s.trackName)).toEqual(['mic']);
    expect(r.skipped).toEqual([
      { userId: 'u2', trackName: 'cam', reason: 'track_not_found' },
    ]);
  });

  it('layer: needs a pulled camera, rid whitelist', async () => {
    const { broker } = setup();
    for (const u of USERS) await join(broker, u);
    await expect(
      broker.setLayer(ctx('u1'), { userId: 'u2', rid: 'h' }),
    ).rejects.toMatchObject({ status: 409 });
    await broker.subscribe(ctx('u1'), { userIds: ['u2'], rid: 'q' });
    await broker.answer(ctx('u1'), SDP);
    await expect(
      broker.setLayer(ctx('u1'), { userId: 'u2', rid: 'x' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      broker.setLayer(ctx('u1'), { userId: 'u2', rid: 'f' }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('SfuBrokerService.decide (owner 2026-10-26: Cloudflare primary)', () => {
  const S = {
    'calls.sfu_fallback_mesh_max': 4,
    'calls.transport_fail_limit': 3,
    'calls.transport_fail_window_sec': 120,
  };

  it('keys present: SFU for a group call with no admin switch and no probe; 1:1 stays p2p', async () => {
    const { cf, broker } = setup(S);
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 12 }),
    ).toMatchObject({ mediaProvider: 'cloudflare', video: true });
    expect(
      await broker.decide({ isGroup: false, video: true, headcount: 2 }),
    ).toMatchObject({ mediaProvider: 'p2p' });
    // Healthy Cloudflare is never asked anything at call start.
    expect(cf.calls).toHaveLength(0);
  });

  it('keys absent: own path (plain mesh), Cloudflare not asked', async () => {
    const cf = new FakeCloudflare();
    const broker = new SfuBrokerService(
      { get: () => Promise.resolve(null) } as never,
      undefined,
      undefined,
      {
        string: () => Promise.resolve('auto'),
        number: () => Promise.resolve(4),
      } as never,
    );
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 9 }),
    ).toEqual({ mediaProvider: 'p2p', video: true, degraded: false });
    expect(cf.calls).toHaveLength(0);
  });

  it('SFU 5xx N times: breaker opens, NEW group calls take the backup (4 keep video, 6 audio)', async () => {
    const { cf, broker } = setup(S);
    cf.failStatus = 503;
    const ctxA = {
      callId: 'c-x',
      userId: 'u1',
      canPublish: true,
      joinedUserIds: ['u1'],
    };
    for (let i = 0; i < 3; i++) {
      await expect(broker.createSession(ctxA)).rejects.toMatchObject({
        status: 503,
      });
    }
    await new Promise((r) => setImmediate(r));
    expect(await broker.transport.isOpen('sfu')).toBe(true);
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 3 }),
    ).toEqual({ mediaProvider: 'p2p', video: true, degraded: true });
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 6 }),
    ).toEqual({ mediaProvider: 'p2p', video: false, degraded: true });
  });

  it('probe success closes the breaker: the next new call is back on Cloudflare', async () => {
    const { cf, broker } = setup(S);
    for (let i = 0; i < 3; i++) {
      await broker.transport.recordFailure('sfu', 'test');
    }
    cf.failStatus = null; // Cloudflare healthy again
    const first = await broker.decide({
      isGroup: true,
      video: true,
      headcount: 3,
    });
    expect(first.mediaProvider).toBe('p2p'); // this call never waits
    await new Promise((r) => setTimeout(r, 10)); // background probe
    expect(await broker.transport.isOpen('sfu')).toBe(false);
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 3 }),
    ).toMatchObject({ mediaProvider: 'cloudflare' });
  });

  it('calls.transport: own never uses Cloudflare; cloudflare ignores an open breaker', async () => {
    const own = setup({ ...S, 'calls.transport': 'own' });
    expect(
      await own.broker.decide({ isGroup: true, video: true, headcount: 3 }),
    ).toEqual({ mediaProvider: 'p2p', video: true, degraded: false });
    expect(await own.broker.cloudflareWanted()).toBe(false);

    const forced = setup({ ...S, 'calls.transport': 'cloudflare' });
    for (let i = 0; i < 3; i++) {
      await forced.broker.transport.recordFailure('sfu', 'test');
    }
    expect(await forced.broker.transport.isOpen('sfu')).toBe(true);
    expect(
      await forced.broker.decide({ isGroup: true, video: true, headcount: 3 }),
    ).toMatchObject({ mediaProvider: 'cloudflare' });
  });

  it('a 4xx that is the caller fault (bad SDP refused) does not count', async () => {
    const { broker } = setup(S);
    const e = new CloudflareSfuError('bad', 400, 'bad');
    for (let i = 0; i < 5; i++) {
      try {
        (broker as unknown as { fail(e: unknown, w: string): never }).fail(
          e,
          'x',
        );
      } catch {
        // expected
      }
    }
    await new Promise((r) => setImmediate(r));
    expect(await broker.transport.isOpen('sfu')).toBe(false);
  });
});

describe('SfuBrokerService hard stop (cost registry V7)', () => {
  const make = (stopped: boolean) =>
    new SfuBrokerService(undefined, undefined, undefined, undefined, {
      stopped: jest.fn().mockResolvedValue(stopped),
    } as never);

  it('turns a cloudflare choice into p2p while the hard stop is on', async () => {
    expect(await make(true).effectiveChoice('cloudflare')).toBe('p2p');
  });

  it('leaves every other choice and the normal case alone', async () => {
    expect(await make(false).effectiveChoice('cloudflare')).toBe('cloudflare');
    expect(await make(true).effectiveChoice('livekit')).toBe('livekit');
    expect(await make(true).effectiveChoice('p2p')).toBe('p2p');
  });
});
