import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'node:crypto';
import {
  CONTACT_HASHES_MAX,
  UploadContactHashesDto,
} from './contacts-sync.dto';
import {
  ContactsSyncService,
  HASHES_PER_ACCOUNT_PER_DAY,
} from './contacts-sync.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { USAGE_LIMITS } from '../../common/usage-limits/usage-limits.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function make(
  over: {
    users?: Record<string, unknown>[];
    matches?: { matched_id: string }[];
    enabled?: boolean | null;
  } = {},
) {
  const tx: unknown[] = [];
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(over.users ?? []),
      findUnique: jest.fn().mockResolvedValue({
        find_by_phone: true,
        phone_e164: '+996555123456',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    userBlock: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ blocker_id: 'me', blocked_id: 'bad' }]),
    },
    contactMatch: {
      createMany: jest.fn((a: unknown) => ({ op: 'createMany', a })),
      deleteMany: jest.fn((a: unknown) => ({ op: 'deleteMany', a })),
      count: jest.fn().mockResolvedValue((over.matches ?? []).length),
      findMany: jest.fn().mockResolvedValue(over.matches ?? []),
    },
    contactSyncSetting: {
      upsert: jest.fn((a: unknown) => ({ op: 'upsert', a })),
      findUnique: jest
        .fn()
        .mockResolvedValue(
          over.enabled === null || over.enabled === undefined
            ? over.enabled === null
              ? null
              : { enabled: true, synced_at: new Date('2026-10-13T10:00:00Z') }
            : { enabled: over.enabled, synced_at: null },
        ),
    },
    $transaction: jest.fn((ops: unknown[]) => {
      tx.push(...ops);
      return Promise.resolve([]);
    }),
  };
  const limits = { consume: jest.fn().mockResolvedValue(undefined) };
  // HyperLogLogs as exact sets: what is counted is distinct hashes.
  const sets = new Map<string, Set<string>>();
  const redis = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
    pfadd: jest.fn((key: string, ...items: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      sets.set(key, set);
      const before = set.size;
      for (const i of items) set.add(i);
      return Promise.resolve(set.size > before ? 1 : 0);
    }),
    pfcount: jest.fn((key: string) =>
      Promise.resolve(sets.get(key)?.size ?? 0),
    ),
  };
  const files = { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) };
  const svc = new ContactsSyncService(
    prisma as never,
    limits as never,
    files as never,
    redis as never,
  );
  return { svc, prisma, limits, redis, tx };
}

describe('UploadContactHashesDto', () => {
  const check = (hashes: unknown) =>
    validate(plainToInstance(UploadContactHashesDto, { hashes }));

  it('accepts lowercase sha-256 hex', async () => {
    expect(await check([sha('+14155552680')])).toHaveLength(0);
  });

  it.each([
    ['a raw number', ['+14155552680']],
    ['uppercase hex', [sha('x').toUpperCase()]],
    ['a short hash', ['abc']],
    ['empty', []],
    ['not an array', 'abc'],
  ])('rejects %s', async (_n, v) => {
    expect((await check(v)).length).toBeGreaterThan(0);
  });

  it('accepts a whole phone book in one request', async () => {
    const book = Array.from({ length: 3000 }, (_, i) => sha(`+1999${i}`));
    expect(await check(book)).toHaveLength(0);
    expect(CONTACT_HASHES_MAX).toBeGreaterThanOrEqual(5000);
  });

  it('rejects more than the cap', async () => {
    const many = Array.from({ length: CONTACT_HASHES_MAX + 1 }, (_, i) =>
      sha(String(i)),
    );
    expect((await check(many)).length).toBeGreaterThan(0);
  });
});

describe('ContactsSyncService.upload', () => {
  it('stores only the matches, never the hashes', async () => {
    const { svc, prisma, limits, redis } = make({
      users: [
        {
          id: 'u1',
          phone_sha256: sha('+1'),
          first_name: 'Ann',
          last_name: 'B',
          role: 'client',
          attorney_profile: null,
          client_profile: { username: 'ann' },
        },
        {
          id: 'u2',
          phone_sha256: sha('+2'),
          first_name: 'Bob',
          last_name: null,
          role: 'attorney',
          attorney_profile: { username: 'bob' },
          client_profile: null,
        },
      ],
    });
    const h = [sha('+1'), sha('+2'), sha('+1')];
    const out = await svc.upload('me', h);
    expect(out.matched).toBe(2);
    expect(out.people).toEqual([
      expect.objectContaining({
        hash: sha('+1'),
        userId: 'u1',
        username: null,
        displayName: 'Ann',
        role: 'client',
      }),
      expect.objectContaining({
        hash: sha('+2'),
        userId: 'u2',
        username: 'bob',
        displayName: 'Bob',
        role: 'attorney',
      }),
    ]);
    expect(limits.consume).toHaveBeenCalledWith('contacts_sync', 'me');
    // the lookup is by hash, duplicates removed, own account and
    // unverified or deleted accounts excluded
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.phone_sha256.in).toEqual([sha('+1'), sha('+2')]);
    // own account and blocked people (both ways) are never returned
    expect(where.id).toEqual({ notIn: ['me', 'bad'] });
    // attorneys are public; a client only when they allow it
    expect(where.OR).toEqual([
      { role: 'attorney' },
      { role: 'client', find_by_phone: true },
    ]);
    expect(where.phone_verified_at).toEqual({ not: null });
    expect(where.deleted_at).toBeNull();
    // what is written: ids only
    expect(prisma.contactMatch.createMany).toHaveBeenCalledWith({
      data: [
        { owner_id: 'me', matched_id: 'u1' },
        { owner_id: 'me', matched_id: 'u2' },
      ],
      skipDuplicates: true,
    });
    expect(
      JSON.stringify(prisma.contactMatch.createMany.mock.calls),
    ).not.toContain(sha('+1'));
    expect(prisma.contactSyncSetting.upsert).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('reco:people:me');
  });

  it('nothing found is still a successful sync', async () => {
    const { svc } = make({ users: [] });
    expect(await svc.upload('me', [sha('x')])).toEqual({
      matched: 0,
      people: [],
    });
  });
});

describe('ContactsSyncService limits and privacy', () => {
  const book = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => sha(`+1999${from + i}`));

  it('a 700-number book in one request', async () => {
    const { svc, limits, prisma } = make();
    await svc.upload('me', book(700));
    expect(limits.consume).toHaveBeenCalledTimes(1);
    expect(
      prisma.user.findMany.mock.calls[0][0].where.phone_sha256.in,
    ).toHaveLength(700);
  });

  it('old builds: the same book in 100-hash parts works too', async () => {
    const { svc, limits } = make();
    const all = book(700);
    for (let i = 0; i < all.length; i += 100) {
      await svc.upload('me', all.slice(i, i + 100));
    }
    expect(limits.consume).toHaveBeenCalledTimes(7);
  });

  it('syncing the same book again costs nothing of the daily cap', async () => {
    const { svc } = make();
    const all = book(HASHES_PER_ACCOUNT_PER_DAY - 10);
    for (let i = 0; i < 5; i++) {
      await expect(svc.upload('me', all)).resolves.toBeDefined();
    }
  });

  it('refuses an account past its daily cap of distinct numbers', async () => {
    const { svc, prisma } = make();
    await svc.upload('me', book(HASHES_PER_ACCOUNT_PER_DAY));
    prisma.user.findMany.mockClear();
    await expect(
      svc.upload('me', book(1, HASHES_PER_ACCOUNT_PER_DAY)),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('counts the address too', async () => {
    const { svc, redis } = make();
    await svc.upload('me', [sha('a')], '1.2.3.4');
    const keys = redis.pfadd.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(keys.some((k) => k.includes(':ip:1.2.3.4:'))).toBe(true);
  });

  it('the request limit is per hour, not per day', () => {
    expect(USAGE_LIMITS.contacts_sync).toEqual({
      setting: 'rate_limit.contacts_sync_per_hour',
      windowSec: 3600,
    });
    expect(
      APP_SETTINGS['rate_limit.contacts_sync_per_hour'],
    ).toBeGreaterThanOrEqual(30);
    expect(
      (APP_SETTINGS as Record<string, unknown>)[
        'rate_limit.contacts_sync_per_day'
      ],
    ).toBeUndefined();
  });

  it('turning "find me" off drops me from other people lists', async () => {
    const { svc, prisma } = make();
    await svc.setFindByPhone('me', false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { find_by_phone: false },
    });
    expect(prisma.contactMatch.deleteMany).toHaveBeenCalledWith({
      where: { matched_id: 'me' },
    });
  });
});

describe('ContactsSyncService.remove / status', () => {
  it('DELETE removes every match and turns the sync off', async () => {
    const { svc, prisma, redis } = make();
    await svc.remove('me');
    expect(prisma.contactMatch.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me' },
    });
    expect(prisma.contactSyncSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { enabled: false, synced_at: null },
      }),
    );
    expect(redis.del).toHaveBeenCalledWith('reco:people:me');
  });

  it('status: never synced → off', async () => {
    const { svc } = make({ enabled: null });
    expect(await svc.status('me')).toEqual({
      enabled: false,
      matches: 0,
      syncedAt: null,
      findByPhone: true,
      phoneRegion: 'KG',
    });
  });
});
