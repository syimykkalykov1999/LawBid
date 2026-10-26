import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { BadgesService } from './badges.service';

/** Owner 2026-10-22 (server load audit, finding 7): a group message's
 * badges for every member at once — two queries and two Redis round trips
 * however many members, and never counted twice for one message. */
function setup(opts: { mutedIds?: string[]; noHash?: string[] } = {}) {
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Record<string, string>>();
  const pipelines: string[][] = [];
  const redis = {
    pipeline: () => {
      const ops: (() => [null, unknown])[] = [];
      const names: string[] = [];
      const p = {
        sadd: (k: string, m: string) => {
          names.push('sadd');
          ops.push(() => {
            const s = sets.get(k) ?? new Set<string>();
            sets.set(k, s);
            const added = s.has(m) ? 0 : 1;
            s.add(m);
            return [null, added];
          });
          return p;
        },
        expire: () => {
          names.push('expire');
          ops.push(() => [null, 1]);
          return p;
        },
        eval: (_script: string, _n: number, k: string) => {
          names.push('eval');
          ops.push(() => {
            const h = hashes.get(k);
            if (!h || h.chats === undefined) return [null, 0];
            h.chats = String(Number(h.chats) + 1);
            return [null, Number(h.chats)];
          });
          return p;
        },
        hgetall: (k: string) => {
          names.push('hgetall');
          ops.push(() => [null, { ...(hashes.get(k) ?? {}) }]);
          return p;
        },
        exec: () => {
          pipelines.push(names);
          return Promise.resolve(ops.map((o) => o()));
        },
      };
      return p;
    },
  };
  const ids = ['a', 'b', 'c'];
  for (const id of ids) {
    if (!(opts.noHash ?? []).includes(id)) {
      hashes.set(`badge:${id}`, { chats: '1', notifs: '2' });
    }
  }
  const prisma = {
    notificationSetting: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (opts.mutedIds ?? []).map((user_id) => ({
            user_id,
            push_enabled: false,
          })),
        ),
      ),
    },
    user: {
      findMany: jest.fn(() =>
        Promise.resolve(
          ids.map((id) => ({ id, notif_icon_badge: id !== 'c' })),
        ),
      ),
    },
  };
  const toUsers = jest.fn();
  const badges = new BadgesService(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    { toUsers } as unknown as RealtimePublisher,
  );
  const get = jest
    .spyOn(badges, 'get')
    .mockResolvedValue({ chatsUnread: 0, notificationsUnread: 0, total: 0 });
  return { badges, prisma, toUsers, hashes, pipelines, get };
}

describe('BadgesService.messagesArrived', () => {
  it('bumps each member once, one badge:update each, batched queries', async () => {
    const { badges, prisma, toUsers, hashes, pipelines } = setup();
    await badges.messagesArrived(['a', 'b', 'c', 'a'], 'm1');
    expect(hashes.get('badge:a')?.chats).toBe('2');
    expect(hashes.get('badge:c')?.chats).toBe('2');
    expect(prisma.notificationSetting.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(pipelines).toHaveLength(2);
    expect(toUsers).toHaveBeenCalledTimes(3);
    expect(toUsers).toHaveBeenCalledWith(['a'], 'badge:update', {
      chatsUnread: 2,
      notificationsUnread: 2,
      total: 4,
      iconBadge: true,
    });
    expect(toUsers).toHaveBeenCalledWith(
      ['c'],
      'badge:update',
      expect.objectContaining({ iconBadge: false }),
    );
  });

  it('a retried job counts nobody twice', async () => {
    const { badges, toUsers, hashes } = setup();
    await badges.messagesArrived(['a', 'b'], 'm1');
    await badges.messagesArrived(['a', 'b'], 'm1');
    expect(hashes.get('badge:a')?.chats).toBe('2');
    expect(toUsers).toHaveBeenCalledTimes(2);
    // Another message counts again.
    await badges.messagesArrived(['a'], 'm2');
    expect(hashes.get('badge:a')?.chats).toBe('3');
  });

  it('«messages» switched off: no count, still an update', async () => {
    const { badges, toUsers, hashes } = setup({ mutedIds: ['b'] });
    await badges.messagesArrived(['a', 'b'], 'm1');
    expect(hashes.get('badge:b')?.chats).toBe('1');
    expect(toUsers).toHaveBeenCalledWith(
      ['b'],
      'badge:update',
      expect.anything(),
    );
  });

  it('a missing hash is rebuilt the usual way', async () => {
    const { badges, get } = setup({ noHash: ['b'] });
    await badges.messagesArrived(['a', 'b'], 'm1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('b');
  });
});
