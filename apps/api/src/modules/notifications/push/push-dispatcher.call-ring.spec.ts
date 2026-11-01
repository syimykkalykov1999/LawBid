import {
  callPollKey,
  verifyCallPoll,
} from '../../../common/calls/call-poll-token';
import { voipRequest, type VoipCallPayload } from './apns-voip.sender';
import { PushDispatcher } from './push-dispatcher';
import type { PushMessage } from './push.constants';

/**
 * Owner 2026-10-26: «incoming calls either arrive without the avatar, or do
 * not arrive at all on a locked screen». The ring push carries everything
 * the phone's own call screen needs — callId, the caller's name and photo
 * link, the video flag — on an iPhone as a VoIP push (priority 10, the
 * `<bundle>.voip` topic), on Android as a high-priority data-only message.
 */
describe('incoming call ring push', () => {
  const PHOTO = 'https://cdn.example.com/avatars/a1_256.jpg';

  const PEPPER = 'test-call-poll-pepper-at-least-32-chars-x';

  function build(
    opts: { avatar?: boolean; video?: boolean; pepper?: string } = {},
  ) {
    const sent: PushMessage[] = [];
    const voipCalls: VoipCallPayload[] = [];
    const prisma = {
      call: {
        findUnique: () =>
          Promise.resolve({
            status: 'ringing',
            conversation_id: 'conv1',
            group_id: null,
            video: !!opts.video,
            is_group: false,
            caller_id: 'caller1',
            callee: { status: 'active', ui_language: 'en' },
            caller: {
              first_name: 'Ann',
              last_name: 'Lee',
              avatar_file_id: opts.avatar === false ? null : 'file1',
            },
            participants: [],
          }),
      },
      notificationSetting: { findUnique: () => Promise.resolve(null) },
      conversationParticipant: {
        findUnique: () => Promise.resolve({ calls_muted: false }),
      },
    };
    const sender = {
      send: (m: PushMessage) => {
        sent.push(m);
        return Promise.resolve();
      },
    };
    const voip = {
      ringCall: (_u: string, c: VoipCallPayload) => {
        voipCalls.push(c);
        return Promise.resolve([]);
      },
    };
    const files = {
      avatarUrlsMany: jest.fn((ids: (string | null | undefined)[]) =>
        Promise.resolve(
          new Map(
            ids
              .filter((x): x is string => !!x)
              .map((id) => [id, { url: `${PHOTO}.full`, url256: PHOTO }]),
          ),
        ),
      ),
    };
    const config = opts.pepper
      ? {
          get: (k: string) =>
            k === 'AUTH_EVENT_PEPPER' ? opts.pepper : undefined,
        }
      : {};
    const d = new PushDispatcher(
      { mode: 'worker' },
      config as never,
      prisma as never,
      {} as never,
      sender,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setContext: () => undefined, warn: () => undefined } as never,
      undefined,
      undefined,
      undefined,
      voip as never,
      undefined,
      files as never,
    );
    return { d, sent, voipCalls, files };
  }
  const job = { kind: 'call' as const, recipientId: 'u1', callId: 'call-1' };

  it('gives the iPhone VoIP push the name, photo, video flag and call id', async () => {
    const { d, voipCalls } = build({ video: true });
    await d.dispatch(job, 'j');
    expect(voipCalls).toEqual([
      {
        callId: 'call-1',
        conversationId: 'conv1',
        callerName: 'Ann Lee',
        avatarUrl: PHOTO,
        video: true,
        silent: false,
      },
    ]);
  });

  it('sends Android a data-only call message with the photo link', async () => {
    const { d, sent } = build();
    await d.dispatch(job, 'j');
    expect(sent).toHaveLength(1);
    expect(sent[0].call).toBe(true);
    expect(sent[0].data).toMatchObject({
      type: 'incoming_call',
      callId: 'call-1',
      callerName: 'Ann Lee',
      avatarUrl: PHOTO,
    });
    expect(sent[0].data?.video).toBeUndefined();
  });

  it('gives Android a poll ticket for this call and this person only', async () => {
    const { d, sent, voipCalls } = build({ pepper: PEPPER });
    await d.dispatch(job, 'j');
    const t = sent[0].data?.pollToken ?? '';
    expect(t).not.toBe('');
    const key = callPollKey(PEPPER);
    expect(verifyCallPoll(key, t, 'call-1')).toMatchObject({
      c: 'call-1',
      u: 'u1',
    });
    expect(verifyCallPoll(key, t, 'call-2')).toBeNull();
    // The iPhone's VoIP push is unchanged (iOS ends the ring by itself).
    expect(voipCalls[0]).not.toHaveProperty('pollToken');
  });

  it('sends no ticket without the pepper (older setups keep working)', async () => {
    const { d, sent } = build();
    await d.dispatch(job, 'j');
    expect(sent[0].data?.pollToken).toBeUndefined();
  });

  it('rings without a photo when the caller has none', async () => {
    const { d, sent, voipCalls, files } = build({ avatar: false });
    await d.dispatch(job, 'j');
    expect(files.avatarUrlsMany).not.toHaveBeenCalled();
    expect(voipCalls[0].avatarUrl).toBeNull();
    expect(sent[0].data?.avatarUrl).toBeUndefined();
  });

  describe('voipRequest (the request Apple gets)', () => {
    const call: VoipCallPayload = {
      callId: 'call-1',
      conversationId: 'conv1',
      callerName: 'Ann Lee',
      avatarUrl: PHOTO,
      video: true,
      silent: false,
    };
    const device = { token: 'abc123', topic: 'com.lawbid.lawbid.voip' };

    it('is a priority-10 VoIP push on the .voip topic that never waits', () => {
      const { headers } = voipRequest(device, call, 'jwt');
      expect(headers).toMatchObject({
        ':path': '/3/device/abc123',
        authorization: 'bearer jwt',
        'apns-topic': 'com.lawbid.lawbid.voip',
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
        'apns-collapse-id': 'call-1',
      });
    });

    it('carries the keys AppDelegate.swift reads', () => {
      const body = JSON.parse(voipRequest(device, call, 'jwt').body) as Record<
        string,
        unknown
      >;
      expect(body).toEqual({
        aps: {},
        callId: 'call-1',
        conversationId: 'conv1',
        callerName: 'Ann Lee',
        avatarUrl: PHOTO,
        video: '1',
        silent: '0',
      });
    });

    it('leaves the photo out when there is none', () => {
      const body = JSON.parse(
        voipRequest(device, { ...call, avatarUrl: null }, 'jwt').body,
      ) as Record<string, unknown>;
      expect(body).not.toHaveProperty('avatarUrl');
    });
  });
});
