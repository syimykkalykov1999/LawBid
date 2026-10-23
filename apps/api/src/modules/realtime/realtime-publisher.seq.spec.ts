/* eslint-disable @typescript-eslint/require-await -- hand-made Redis / socket fakes */
import type Redis from 'ioredis';
import { RealtimePublisher } from './realtime-publisher.service';

/** Owner 2026-10-23: every event to people carries a `seq` cursor and is
 * kept for the catch-up after a reconnect. */
describe('RealtimePublisher.toUsers with the event log', () => {
  const prev = process.env.SOCKET_IO_ADAPTER;
  beforeEach(() => delete process.env.SOCKET_IO_ADAPTER);
  afterEach(() => {
    if (prev === undefined) delete process.env.SOCKET_IO_ADAPTER;
    else process.env.SOCKET_IO_ADAPTER = prev;
  });

  function logRedis() {
    const calls: string[] = [];
    const pipe: Record<string, jest.Mock> = {};
    for (const m of ['zadd', 'zremrangebyscore', 'zremrangebyrank', 'expire']) {
      pipe[m] = jest.fn(() => pipe);
    }
    pipe.exec = jest.fn(async () => {
      calls.push('log');
      return [];
    });
    let seq = 1_000;
    return {
      calls,
      pipe,
      status: 'ready',
      eval: jest.fn(async () => ++seq),
      pipeline: () => pipe,
      spublish: jest.fn(async () => {
        calls.push('publish');
        return 1;
      }),
      publish: jest.fn().mockResolvedValue(1),
    };
  }
  const flush = () => new Promise((r) => setImmediate(r));
  type Packet = { data: { packet: { data: [string, { seq?: number }] } } };
  const sent = (r: { spublish: jest.Mock }) =>
    r.spublish.mock.calls as unknown as [string, string][];
  const packetOf = (message: string) =>
    (JSON.parse(message) as Packet).data.packet.data;

  it('adds seq to the payload, logs for every member, then publishes once', async () => {
    const r = logRedis();
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a', 'b'], 'message:new', { id: 'm1' });
    await flush();
    expect(r.spublish).toHaveBeenCalledTimes(1);
    expect(r.pipe.zadd).toHaveBeenCalledTimes(2);
    // Log first, publish second.
    expect(r.calls).toEqual(['log', 'publish']);
    expect(packetOf(sent(r)[0][1])).toEqual([
      'message:new',
      { id: 'm1', seq: 1001 },
    ]);
  });

  it('events come out in cursor order', async () => {
    const r = logRedis();
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a'], 'message:new', { n: 1 });
    pub.toUsers(['a'], 'message:new', { n: 2 });
    await flush();
    const seqs = sent(r).map((c) => packetOf(c[1])[1].seq);
    expect(seqs).toEqual([1001, 1002]);
  });

  it('still delivers when the log is unavailable', async () => {
    const r = logRedis();
    r.eval.mockRejectedValueOnce(new Error('boom'));
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a'], 'badge:update', { total: 1 });
    await flush();
    expect(r.spublish).toHaveBeenCalledTimes(1);
    expect(packetOf(sent(r)[0][1])[1].seq).toBeUndefined();
  });

  it('a huge audience is sent without seq and not logged', () => {
    const r = logRedis();
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(
      Array.from({ length: 1001 }, (_, i) => `u${i}`),
      'group:update',
      { groupId: 'g' },
    );
    expect(r.spublish).toHaveBeenCalledTimes(1);
    expect(r.eval).not.toHaveBeenCalled();
  });
});
