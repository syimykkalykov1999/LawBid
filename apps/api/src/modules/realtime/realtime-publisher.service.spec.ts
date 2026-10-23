import type Redis from 'ioredis';
import {
  REALTIME_NAMESPACE,
  RealtimePublisher,
  shardedBroadcast,
  socketAdapterMode,
} from './realtime-publisher.service';

/** Owner 2026-10-22 (server load audit, finding 5): the sharded adapter. */
describe('socketAdapterMode', () => {
  it('sharded by default, classic only when asked', () => {
    expect(socketAdapterMode({})).toBe('sharded');
    expect(socketAdapterMode({ SOCKET_IO_ADAPTER: 'sharded' })).toBe('sharded');
    expect(socketAdapterMode({ SOCKET_IO_ADAPTER: 'classic' })).toBe('classic');
  });
});

describe('shardedBroadcast', () => {
  it("one room → the room's own channel (only its instances read it)", () => {
    const { channel, message } = shardedBroadcast(
      '/realtime',
      ['user:u1'],
      'badge:update',
      { total: 3 },
    );
    expect(channel).toBe('socket.io#/realtime#user:u1#');
    expect(JSON.parse(message)).toEqual({
      uid: 'emitter',
      nsp: '/realtime',
      type: 3,
      data: {
        opts: { rooms: ['user:u1'], except: [], flags: {} },
        packet: {
          type: 2,
          data: ['badge:update', { total: 3 }],
          nsp: '/realtime',
        },
      },
    });
  });

  it("several rooms → the namespace's channel, one message", () => {
    const { channel, message } = shardedBroadcast(
      '/realtime',
      ['user:a', 'user:b'],
      'group:message',
      { message: { id: 'm1' } },
    );
    expect(channel).toBe('socket.io#/realtime#');
    expect(
      (JSON.parse(message) as { data: { opts: { rooms: string[] } } }).data.opts
        .rooms,
    ).toEqual(['user:a', 'user:b']);
  });
});

describe('RealtimePublisher.toUsers', () => {
  const prev = process.env.SOCKET_IO_ADAPTER;
  afterEach(() => {
    if (prev === undefined) delete process.env.SOCKET_IO_ADAPTER;
    else process.env.SOCKET_IO_ADAPTER = prev;
  });

  function redis() {
    return {
      status: 'ready',
      spublish: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
    };
  }

  it('sharded: one SPUBLISH for many members (deduplicated)', () => {
    delete process.env.SOCKET_IO_ADAPTER;
    const r = redis();
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a', 'b', 'a', 'c'], 'group:update', { groupId: 'g' });
    expect(r.spublish).toHaveBeenCalledTimes(1);
    expect(r.publish).not.toHaveBeenCalled();
    const [channel, message] = r.spublish.mock.calls[0] as [string, string];
    expect(channel).toBe(`socket.io#${REALTIME_NAMESPACE}#`);
    expect(
      (JSON.parse(message) as { data: { opts: { rooms: string[] } } }).data.opts
        .rooms,
    ).toEqual(['user:a', 'user:b', 'user:c']);
  });

  it('classic: the redis-emitter format (PUBLISH)', () => {
    process.env.SOCKET_IO_ADAPTER = 'classic';
    const r = redis();
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a'], 'badge:update', {});
    expect(r.spublish).not.toHaveBeenCalled();
    expect(r.publish).toHaveBeenCalledTimes(1);
  });

  it('toQr: the /qr namespace, one room per code (sharded and classic)', () => {
    delete process.env.SOCKET_IO_ADAPTER;
    const r = redis();
    new RealtimePublisher(r as unknown as Redis).toQr(
      'abc',
      'auth:qr_approved',
      {
        qrId: 'abc',
        status: 'approved',
      },
    );
    const [channel, message] = r.spublish.mock.calls[0] as [string, string];
    expect(channel).toBe('socket.io#/qr#qr:abc#');
    const parsed = JSON.parse(message) as {
      nsp: string;
      data: { opts: { rooms: string[] }; packet: { data: unknown[] } };
    };
    expect(parsed.nsp).toBe('/qr');
    expect(parsed.data.opts.rooms).toEqual(['qr:abc']);
    expect(parsed.data.packet.data).toEqual([
      'auth:qr_approved',
      { qrId: 'abc', status: 'approved' },
    ]);

    process.env.SOCKET_IO_ADAPTER = 'classic';
    const c = redis();
    new RealtimePublisher(c as unknown as Redis).toQr(
      'abc',
      'auth:qr_scanned',
      {},
    );
    expect(c.publish).toHaveBeenCalledTimes(1);
    expect(String(c.publish.mock.calls[0][0])).toContain('/qr');
  });

  it('nothing while Redis is not ready, nothing for nobody', () => {
    const r = { ...redis(), status: 'reconnecting' };
    const pub = new RealtimePublisher(r as unknown as Redis);
    pub.toUsers(['a'], 'badge:update', {});
    pub.toUsers([], 'badge:update', {});
    expect(r.spublish).not.toHaveBeenCalled();
    expect(r.publish).not.toHaveBeenCalled();
  });
});
