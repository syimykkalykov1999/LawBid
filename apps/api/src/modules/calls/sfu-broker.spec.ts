import { FakeCloudflare } from './cloudflare-sfu.fake';
import { CloudflareSfuProvider } from './cloudflare-sfu.provider';
import { SfuBrokerService, type SfuCtx } from './sfu-broker.service';

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

describe('SfuBrokerService.decide (fallback at call start)', () => {
  const S = {
    'calls.video_provider': 'cloudflare',
    'calls.sfu_fallback_mesh_max': 4,
  };

  it('healthy Cloudflare: SFU for a group call, p2p for anything else', async () => {
    const { broker } = setup(S);
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 12 }),
    ).toMatchObject({ mediaProvider: 'cloudflare', video: true });
    expect(
      await broker.decide({ isGroup: false, video: true, headcount: 2 }),
    ).toMatchObject({ mediaProvider: 'p2p' });
  });

  it('Cloudflare 5xx: 3 people keep video on mesh, 6 become audio, never rejected', async () => {
    const { cf, broker } = setup(S);
    cf.failStatus = 503;
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 3 }),
    ).toEqual({ mediaProvider: 'p2p', video: true, degraded: true });
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 6 }),
    ).toEqual({ mediaProvider: 'p2p', video: false, degraded: true });
  });

  it('not configured: same fallback, and Cloudflare is not even asked', async () => {
    const cf = new FakeCloudflare();
    const broker = new SfuBrokerService(
      { get: () => Promise.resolve(null) } as never,
      undefined,
      undefined,
      {
        string: () => Promise.resolve('cloudflare'),
        number: () => Promise.resolve(4),
      } as never,
    );
    expect(
      await broker.decide({ isGroup: true, video: true, headcount: 9 }),
    ).toMatchObject({ mediaProvider: 'p2p', video: false });
    expect(cf.calls).toHaveLength(0);
  });

  it('the admin did not choose cloudflare: Cloudflare is never probed', async () => {
    const { cf, broker } = setup({ 'calls.video_provider': 'p2p' });
    await broker.decide({ isGroup: true, video: true, headcount: 6 });
    expect(cf.calls).toHaveLength(0);
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
