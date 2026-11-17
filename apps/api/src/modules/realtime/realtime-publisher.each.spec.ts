import type Redis from 'ioredis';
import { RealtimePublisher } from './realtime-publisher.service';

/**
 * Audit 17.11 (problem 9): the badges of a group message — a payload of its
 * own per member. Counted on a fake Valkey that records every network round
 * trip (a direct command or one pipeline `exec`) and every command, for a
 * 5000-member group: one toUsers per member (before) against one toEachUser
 * (after). Numbers go to the PR as «before / after».
 */
function fakeRedis() {
  const n = { roundTrips: 0, commands: 0, published: 0 };
  const redis = {
    status: 'ready',
    eval: jest.fn(() => {
      n.roundTrips += 1;
      n.commands += 1;
      return Promise.resolve(Date.now() * 1000);
    }),
    spublish: jest.fn(() => {
      n.roundTrips += 1;
      n.commands += 1;
      n.published += 1;
      return Promise.resolve(1);
    }),
    pipeline: () => {
      let queued = 0;
      let spub = 0;
      const p = {
        eval: () => ((queued += 1), p),
        spublish: () => ((queued += 1), (spub += 1), p),
        exec: () => {
          n.roundTrips += 1;
          n.commands += queued;
          n.published += spub;
          return Promise.resolve([]);
        },
      };
      return p;
    },
  };
  return { redis: redis as unknown as Redis, n };
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
};

const MEMBERS = Array.from({ length: 5000 }, (_, i) => `u${i}`);
const badge = (i: number) => ({ chatsUnread: i, notificationsUnread: 0 });

describe('RealtimePublisher.toEachUser (5000-member group badges)', () => {
  const env = process.env.SOCKET_IO_ADAPTER;
  beforeAll(() => delete process.env.SOCKET_IO_ADAPTER); // sharded (prod)
  afterAll(() => {
    if (env !== undefined) process.env.SOCKET_IO_ADAPTER = env;
  });

  it('before: one toUsers per member', async () => {
    const { redis, n } = fakeRedis();
    const pub = new RealtimePublisher(redis);
    MEMBERS.forEach((u, i) => pub.toUsers([u], 'badge:update', badge(i)));
    await flush();
    // nextSeq + log pipeline + publish, per member.
    expect(n.roundTrips).toBe(15_000);
    expect(n.published).toBe(5000);
    process.stdout.write(`AUDIT_P9 before ${JSON.stringify(n)}\n`);
  });

  it('after: one cursor, one log pipeline, one publish pipeline', async () => {
    const { redis, n } = fakeRedis();
    const pub = new RealtimePublisher(redis);
    pub.toEachUser(
      'badge:update',
      MEMBERS.map((userId, i) => ({ userId, data: badge(i) })),
    );
    await flush();
    expect(n.roundTrips).toBe(3);
    // Every member still gets their own update.
    expect(n.published).toBe(5000);
    expect(n.commands).toBe(1 + 5000 + 5000);
    process.stdout.write(`AUDIT_P9 after ${JSON.stringify(n)}\n`);
  });
});
