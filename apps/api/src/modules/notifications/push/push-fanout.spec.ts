import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../../common/demo/demo-context';
import {
  FCM_MULTICAST_MAX,
  FcmPushSender,
  FcmTemporaryError,
  inChunks,
} from './fcm-push.sender';
import { PushDispatcher } from './push-dispatcher';
import { PushQueueService } from './push-queue.service';
import type { PushTokensService } from './push-tokens.service';
import {
  GROUP_PUSH_BATCH,
  type GroupMessagesJobData,
  type PushMessage,
} from './push.constants';

/** Owner 2026-10-22 (server load audit, finding 7): group pushes in
 * batches of 500, devices in parallel in FCM multicast-sized chunks. */
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

describe('inChunks', () => {
  it('never runs more than [size] at once, and runs every item', async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    const items = Array.from({ length: 1234 }, (_, i) => i);
    await inChunks(items, FCM_MULTICAST_MAX, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      done.push(i);
    });
    expect(peak).toBe(FCM_MULTICAST_MAX);
    expect(done.sort((a, b) => a - b)).toEqual(items);
  });
});

describe('PushQueueService.enqueueGroupMessages', () => {
  function queue() {
    const q = new PushQueueService(
      { get: () => undefined } as unknown as ConfigService,
      logger,
    );
    const addBulk = jest.fn().mockResolvedValue([]);
    (q as unknown as { queue: unknown }).queue = { addBulk };
    return { q, addBulk };
  }

  it('one round trip, one job per 500 members, job id per message + batch', async () => {
    const { q, addBulk } = queue();
    const ids = Array.from({ length: 1201 }, (_, i) => `u${i}`);
    await q.enqueueGroupMessages({
      groupId: 'g1',
      messageId: 'm1',
      recipientIds: ids,
    });
    expect(addBulk).toHaveBeenCalledTimes(1);
    const jobs = addBulk.mock.calls[0][0] as {
      data: GroupMessagesJobData;
      opts: { jobId: string };
    }[];
    expect(jobs.map((j) => j.data.recipientIds.length)).toEqual([
      GROUP_PUSH_BATCH,
      GROUP_PUSH_BATCH,
      201,
    ]);
    expect(jobs.map((j) => j.opts.jobId)).toEqual([
      'gm-m1-0',
      'gm-m1-1',
      'gm-m1-2',
    ]);
    expect(jobs.flatMap((j) => j.data.recipientIds)).toEqual(ids);
    expect(jobs[0].data).toMatchObject({
      kind: 'group_messages',
      groupId: 'g1',
    });
  });

  it('nothing in the demo world or for nobody', async () => {
    const { q, addBulk } = queue();
    await demoContext.run(true, () =>
      q.enqueueGroupMessages({
        groupId: 'g',
        messageId: 'm',
        recipientIds: ['a'],
      }),
    );
    await q.enqueueGroupMessages({
      groupId: 'g',
      messageId: 'm',
      recipientIds: [],
    });
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('enqueueMany: stored rows in one round trip, job id = row id', async () => {
    const { q, addBulk } = queue();
    await q.enqueueMany(['n1', 'n2'], 'channel_post');
    expect(addBulk).toHaveBeenCalledTimes(1);
    expect(
      (addBulk.mock.calls[0][0] as { opts: { jobId: string } }[]).map(
        (j) => j.opts.jobId,
      ),
    ).toEqual(['n1', 'n2']);
  });
});

describe('FcmPushSender.sendMany', () => {
  function sender(devicesPerUser: number) {
    const s = Object.create(FcmPushSender.prototype) as FcmPushSender;
    const calls: string[] = [];
    let inFlight = 0;
    let peak = 0;
    Object.assign(s, {
      tokens: {
        activeTokens: (u: string) =>
          Promise.resolve(
            Array.from({ length: devicesPerUser }, (_, i) => `${u}-d${i}`),
          ),
      } as unknown as PushTokensService,
    });
    // Each user's devices go out in parallel inside send(); here we watch
    // how many users are in flight.
    s.send = jest.fn(async (m: PushMessage) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      calls.push(m.userId);
      inFlight--;
      if (m.userId === 'fail') throw new FcmTemporaryError('x');
    });
    return { s, calls, peak: () => peak };
  }

  const msg = (userId: string): PushMessage => ({
    userId,
    title: 't',
    body: 'b',
    data: {},
  });

  it('sends to everyone, at most 50 recipients (≤ 500 devices) at once', async () => {
    const { s, calls, peak } = sender(10);
    const users = Array.from({ length: 180 }, (_, i) => `u${i}`);
    await s.sendMany(users.map(msg), 'm:1');
    expect(calls.sort()).toEqual([...users].sort());
    expect(peak() * 10).toBeLessThanOrEqual(FCM_MULTICAST_MAX);
  });

  it('a temporary failure of one is reported after the others went out', async () => {
    const { s, calls } = sender(1);
    await expect(
      s.sendMany([msg('a'), msg('fail'), msg('b')], 'm:1'),
    ).rejects.toBeInstanceOf(FcmTemporaryError);
    expect(calls.sort()).toEqual(['a', 'b', 'fail']);
  });
});

describe('PushDispatcher: a group_messages batch', () => {
  function setup(opts: { muted?: string[]; viewing?: string[] } = {}) {
    const muted = new Set(opts.muted ?? []);
    const viewing = new Set(opts.viewing ?? []);
    const counts = { message: 0, group: 0, sender: 0 };
    const prisma = {
      user: {
        findUnique: ({ where }: { where: { id: string } }) => {
          if (where.id === 'ann') {
            counts.sender++;
            return Promise.resolve({
              first_name: 'Ann',
              last_name: 'Lee',
              avatar_file_id: null,
              client_profile: null,
              attorney_profile: null,
            });
          }
          return Promise.resolve({ status: 'active', ui_language: 'en' });
        },
      },
      chatGroupMember: {
        findUnique: ({
          where,
        }: {
          where: { group_id_user_id: { user_id: string } };
        }) =>
          Promise.resolve({
            muted_until: muted.has(where.group_id_user_id.user_id)
              ? new Date(Date.now() + 3600_000)
              : null,
            left_at: null,
          }),
      },
      chatGroupMessage: {
        // partitioned table: looked up by id (+ group) with findFirst
        findFirst: () => {
          counts.message++;
          return Promise.resolve({
            body: 'hello',
            type: 'text',
            sender_id: 'ann',
            deleted_at: null,
            system_kind: null,
            system_payload: null,
            mention_ids: [],
            created_at: new Date(1000),
            file: null,
            poll: null,
          });
        },
      },
      chatGroup: {
        findUnique: () => {
          counts.group++;
          return Promise.resolve({
            title: 'Team',
            deleted_at: null,
            avatar_file_id: null,
          });
        },
      },
      notificationQuietHours: { findUnique: () => Promise.resolve(null) },
    };
    const sendMany = jest.fn().mockResolvedValue(undefined);
    const send = jest.fn().mockResolvedValue(undefined);
    const d = new PushDispatcher(
      { mode: 'worker' },
      {} as never,
      prisma as never,
      {} as never,
      { send, sendMany },
      {} as never,
      {} as never,
      {
        iconFor: () => Promise.resolve({ badge: 2, on: true }),
        topicSwitches: () => Promise.resolve({ on: () => true, raw: {} }),
      } as never,
      {
        isViewing: (u: string) => Promise.resolve(viewing.has(u)),
      } as never,
      logger,
    );
    return { d, send, sendMany, counts };
  }

  it('reads the message once, gates each member, sends once', async () => {
    const { d, send, sendMany, counts } = setup({
      muted: ['u2'],
      viewing: ['u3'],
    });
    const recipientIds = ['u1', 'u2', 'u3', 'u4'];
    const r = await d.dispatch(
      { kind: 'group_messages', groupId: 'g1', messageId: 'm1', recipientIds },
      'gm-m1-0',
    );
    expect(r).toBe('sent');
    expect(counts).toEqual({ message: 1, group: 1, sender: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(sendMany).toHaveBeenCalledTimes(1);
    const [pushes, key] = sendMany.mock.calls[0] as [PushMessage[], string];
    expect(key).toBe('m:m1');
    expect(pushes.map((p) => p.userId).sort()).toEqual(['u1', 'u4']);
    expect(pushes[0]).toMatchObject({
      title: 'Team',
      badge: 2,
      threadId: 'g1',
      data: { type: 'new_message', groupId: 'g1', messageId: 'm1' },
    });
  });

  it('nobody to ring: nothing sent', async () => {
    const { d, sendMany } = setup({ muted: ['u1'] });
    expect(
      await d.dispatch(
        {
          kind: 'group_messages',
          groupId: 'g1',
          messageId: 'm1',
          recipientIds: ['u1'],
        },
        'gm-m1-0',
      ),
    ).toBe('no_push');
    expect(sendMany).not.toHaveBeenCalled();
  });
});
