import type { PinoLogger } from 'nestjs-pino';
import { FcmPushSender } from './fcm-push.sender';
import type { PushTokensService } from './push-tokens.service';

/** 2026-11-07: FCM HTTP v1 deprecates `message.token` for `message.fid`
 * (https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages).
 * A device registered by its Firebase Installation ID gets `fid`, an older
 * app's registration token still gets `token`. */
describe('FcmPushSender FID target', () => {
  const sent: Record<string, any>[] = [];
  let answer: { ok: boolean; status?: number; json?: () => unknown };

  function build(armed = new Map<string, Set<string>>()) {
    sent.length = 0;
    const tokens = {
      activeDevices: jest.fn().mockResolvedValue([
        { token: 'fid-device-0000000000', fid: true },
        { token: 'legacy-registration-token', fid: false },
      ]),
      localReminderTokens: jest.fn().mockResolvedValue([]),
      webTokens: jest.fn().mockResolvedValue([]),
      armedReminders: jest.fn().mockResolvedValue(armed),
      remove: jest.fn(),
    };
    const redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    const logger = { setContext: jest.fn(), warn: jest.fn() };
    const sender = new FcmPushSender(
      { projectId: 'p', clientEmail: 'a@b.c', privateKey: 'k' },
      tokens as unknown as PushTokensService,
      redis as never,
      logger as unknown as PinoLogger,
    );
    (sender as unknown as { jwt: unknown }).jwt = {
      getAccessToken: () => Promise.resolve({ token: 't' }),
    };
    global.fetch = jest.fn((_url: unknown, init: { body: string }) => {
      sent.push(JSON.parse(init.body).message);
      return Promise.resolve(answer);
    }) as never;
    return { sender, tokens };
  }

  beforeEach(() => {
    answer = { ok: true };
  });

  const message = { userId: 'u', title: 'Hi', body: 'There', data: {} };

  it('an FID goes out as message.fid, a legacy token as message.token', async () => {
    await build().sender.send(message, 'n:1');
    const fid = sent.find((m) => m.fid === 'fid-device-0000000000');
    const legacy = sent.find((m) => m.token === 'legacy-registration-token');
    expect(fid).toBeDefined();
    expect(fid).not.toHaveProperty('token');
    expect(fid!.notification).toEqual({ title: 'Hi', body: 'There' });
    expect(legacy).toBeDefined();
    expect(legacy).not.toHaveProperty('fid');
  });

  it('the silent "call ended" push also targets the FID', async () => {
    await build().sender.send(
      { ...message, callEnd: true, data: { type: 'call_ended' } },
      'c:1',
    );
    expect(sent.map((m) => String(m.fid ?? m.token)).sort()).toEqual([
      'fid-device-0000000000',
      'legacy-registration-token',
    ]);
    expect(sent.find((m) => m.fid)).not.toHaveProperty('token');
  });

  it('UNREGISTERED for an FID removes that device', async () => {
    answer = {
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          error: {
            status: 'NOT_FOUND',
            details: [{ errorCode: 'UNREGISTERED' }],
          },
        }),
    };
    const { sender, tokens } = build();
    await sender.send(message, 'n:2');
    expect(tokens.remove).toHaveBeenCalledWith('fid-device-0000000000');
    expect(tokens.remove).toHaveBeenCalledWith('legacy-registration-token');
  });

  it('a reminder an iPhone armed by its FID is not pushed to it again', async () => {
    const at = '2026-11-07T10:00:00.000Z';
    const armed = new Map([
      ['fid-device-0000000000', new Set([`t1@${Date.parse(at)}`])],
    ]);
    await build(armed).sender.send(
      {
        ...message,
        reminder: true,
        data: { type: 'task_reminder', taskId: 't1', remindAt: at },
      },
      'r:1',
    );
    expect(sent.map((m) => String(m.fid ?? m.token))).toEqual([
      'legacy-registration-token',
    ]);
  });

  it('G8: any other INVALID_ARGUMENT is not retried, counted once and logged with FCM text', async () => {
    answer = {
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: {
            status: 'INVALID_ARGUMENT',
            message: "Invalid value at 'message.data[0].value'",
          },
        }),
    };
    const { sender, tokens } = build();
    const slo = { count: jest.fn() };
    (sender as unknown as { slo: typeof slo }).slo = slo;
    const logger = (sender as unknown as { logger: { warn: jest.Mock } })
      .logger;
    await expect(sender.send(message, 'n:3')).resolves.toBeUndefined();
    expect(tokens.remove).not.toHaveBeenCalled();
    expect(slo.count).toHaveBeenCalledTimes(2); // once per device, no retry
    expect(slo.count).toHaveBeenCalledWith('pushFailed');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT',
        fcmMessage: "Invalid value at 'message.data[0].value'",
        bytes: expect.any(Number),
      }),
      'fcm send rejected (not retried)',
    );
  });
});
