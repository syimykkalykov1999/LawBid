import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'node:crypto';
import {
  CONTACT_BOOK_MAX,
  CONTACT_HASHES_MAX,
  UploadContactHashesDto,
} from './contacts-sync.dto';
import { bookHashOf, EMPTY_BOOK_HASH, xorBookHash } from './contacts-book-hash';
import {
  ContactsSyncService,
  HASHES_PER_ACCOUNT_PER_DAY,
} from './contacts-sync.service';
import { ContactsPepper } from './contacts-pepper';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { USAGE_LIMITS } from '../../common/usage-limits/usage-limits.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function make(
  over: {
    users?: Record<string, unknown>[];
    matches?: { matched_id: string }[];
    enabled?: boolean | null;
    /** The stored book (contact_book_hashes) and its settings row. */
    book?: string[];
    setting?: Record<string, unknown> | null;
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
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(
        over.setting !== undefined
          ? over.setting
          : over.enabled === null || over.enabled === undefined
            ? over.enabled === null
              ? null
              : {
                  enabled: true,
                  synced_at: new Date('2026-10-13T10:00:00Z'),
                }
            : { enabled: over.enabled, synced_at: null },
      ),
    },
    contactBookHash: {
      findMany: jest.fn(
        (a: { where: { OR: { phone_hash: { in: string[] } }[] } }) =>
          Promise.resolve(
            (over.book ?? [])
              .filter((h) =>
                a.where.OR.some((o) => o.phone_hash.in.includes(h)),
              )
              .map((h) => ({ phone_hash: h })),
          ),
      ),
      createMany: jest.fn((a: { data: unknown[] }) =>
        Object.assign(Promise.resolve({ count: a.data.length }), {
          op: 'bookCreate',
          a,
        }),
      ),
      deleteMany: jest.fn((a: unknown) => ({ op: 'bookDelete', a })),
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
  // No CONTACTS_PEPPER here: the stored form is the client hash itself
  // (the pepper's own behaviour is in contacts-pepper.spec.ts).
  const pepper = new ContactsPepper({ get: () => undefined } as never);
  const svc = new ContactsSyncService(
    prisma as never,
    limits as never,
    files as never,
    redis as never,
    pepper,
  );
  return { svc, prisma, limits, redis, tx, files };
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

describe('ContactsSyncService.upload (old builds)', () => {
  it('matches, keeps the hashes (never numbers), forgets the book hash', async () => {
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
    // Owner 2026-10-22: kept for "X joined"; a new build then sends the
    // book whole once (book_hash unknown).
    expect(prisma.contactBookHash.createMany).toHaveBeenCalledWith({
      data: [
        { owner_id: 'me', phone_hash: sha('+1'), peppered: false },
        { owner_id: 'me', phone_hash: sha('+2'), peppered: false },
      ],
      skipDuplicates: true,
    });
    expect(prisma.contactSyncSetting.update).toHaveBeenCalledWith({
      where: { user_id: 'me' },
      data: { book_size: { increment: 2 }, book_hash: null },
    });
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

  it('"find me" off: their next daily check gets the new list', async () => {
    const { svc, prisma } = make({
      matches: [{ owner_id: 'o1' }, { owner_id: 'o2' }] as never,
    });
    await svc.setFindByPhone('me', false);
    expect(prisma.contactSyncSetting.updateMany).toHaveBeenCalledWith({
      where: { user_id: { in: ['o1', 'o2'] } },
      data: { matches_version: { increment: 1 } },
    });
  });

  it('"find me" on again: the joined job matches me again', async () => {
    const { svc, prisma } = make();
    await svc.setFindByPhone('me', true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { find_by_phone: true, contacts_announced_at: null },
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
        update: {
          enabled: false,
          synced_at: null,
          book_hash: null,
          book_size: 0,
        },
      }),
    );
    // Owner 2026-10-22: the stored book goes too.
    expect(prisma.contactBookHash.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me' },
    });
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
      notifyJoined: true,
    });
  });
});

/**
 * Owner 2026-10-22 (like Telegram's contacts hash / WhatsApp's delta sync):
 * "changed?" first, then only what was added / removed.
 */
describe('ContactsSyncService.sync (hash-checked delta)', () => {
  const a = sha('+1001');
  const b = sha('+1002');
  const c = sha('+1003');
  const ann = {
    id: 'u-ann',
    phone_sha256: c,
    first_name: 'Ann',
    last_name: null,
    role: 'attorney',
    attorney_profile: { username: 'ann' },
    avatar_file_id: null,
  };

  it('first sync: no book on the server → resync, nothing is done', async () => {
    const { svc, prisma, redis } = make({ setting: null });
    const out = await svc.sync('me', { bookHash: bookHashOf([a, b]) });
    expect(out).toMatchObject({ status: 'resync', bookHash: null, people: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(redis.pfadd).not.toHaveBeenCalled();
  });

  it('full upload stores the book and its hash, answers the whole list', async () => {
    const { svc, prisma } = make({ setting: null, users: [ann] });
    const out = await svc.sync('me', { full: true, added: [a, b, c, a] });
    expect(out).toMatchObject({
      status: 'ok',
      bookHash: bookHashOf([a, b, c]),
      bookSize: 3,
      matched: 1,
      people: [expect.objectContaining({ userId: 'u-ann', hash: c })],
    });
    expect(prisma.contactBookHash.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me' },
    });
    expect(prisma.contactBookHash.createMany).toHaveBeenCalledWith({
      data: [a, b, c].map((h) => ({
        owner_id: 'me',
        phone_hash: h,
        peppered: false,
      })),
      skipDuplicates: true,
    });
    // Numbers no longer in the book lose their match.
    expect(prisma.contactMatch.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me', matched_id: { notIn: ['u-ann'] } },
    });
    expect(prisma.contactSyncSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          book_hash: bookHashOf([a, b, c]),
          book_size: 3,
        }),
      }),
    );
  });

  it('not modified: one row read, no lookup, no write, no daily cap used', async () => {
    const h = bookHashOf([a, b]);
    const { svc, prisma, redis, files } = make({
      setting: { book_hash: h, book_size: 2, matches_version: 3 },
    });
    const out = await svc.sync('me', { bookHash: h, matchesVersion: 3 });
    expect(out).toEqual({
      status: 'not_modified',
      matched: 0,
      people: [],
      bookHash: h,
      bookSize: 2,
      matchesVersion: 3,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.contactBookHash.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(redis.pfadd).not.toHaveBeenCalled();
    expect(files.avatarUrlsMany).not.toHaveBeenCalled();
  });

  it('same book, someone joined (newer version) → the list, no write', async () => {
    const h = bookHashOf([a, c]);
    const { svc, prisma } = make({
      setting: { book_hash: h, book_size: 2, matches_version: 4 },
      users: [ann],
    });
    const out = await svc.sync('me', { bookHash: h, matchesVersion: 3 });
    expect(out).toMatchObject({ status: 'ok', matchesVersion: 4, matched: 1 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // the list is read from the stored matches
    expect(
      prisma.user.findMany.mock.calls[0][0].where.contact_matched_by,
    ).toEqual({ some: { owner_id: 'me' } });
  });

  it('a different book hash without changes → resync', async () => {
    const { svc } = make({
      setting: { book_hash: bookHashOf([a]), book_size: 1, matches_version: 0 },
    });
    expect(
      (await svc.sync('me', { bookHash: bookHashOf([a, b]) })).status,
    ).toBe('resync');
  });

  it('delta: an added number matches, a removed one drops its match', async () => {
    const base = bookHashOf([a, b]);
    const { svc, prisma, redis } = make({
      setting: { book_hash: base, book_size: 2, matches_version: 0 },
      book: [a, b],
    });
    prisma.user.findMany
      .mockResolvedValueOnce([ann]) // lookup of the added
      .mockResolvedValueOnce([{ id: 'u-a' }]) // who had the removed number
      .mockResolvedValueOnce([ann]); // the list
    const out = await svc.sync('me', {
      baseHash: base,
      added: [c],
      removed: [a],
      bookHash: bookHashOf([b, c]),
    });
    expect(out).toMatchObject({
      status: 'ok',
      bookHash: bookHashOf([b, c]),
      bookSize: 2,
      matched: 1,
    });
    // only the added number was looked up and counted
    expect(prisma.user.findMany.mock.calls[0][0].where.phone_sha256).toEqual({
      in: [c],
    });
    const counted = redis.pfadd.mock.calls.flatMap((x: unknown[]) =>
      x.slice(1),
    );
    expect(new Set(counted)).toEqual(new Set([c]));
    expect(prisma.contactBookHash.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me', phone_hash: { in: [a] } },
    });
    expect(prisma.contactMatch.deleteMany).toHaveBeenCalledWith({
      where: { owner_id: 'me', matched_id: { in: ['u-a'] } },
    });
    expect(prisma.contactMatch.createMany).toHaveBeenCalledWith({
      data: [{ owner_id: 'me', matched_id: 'u-ann' }],
      skipDuplicates: true,
    });
    // the stored book is never wiped nor rewritten whole
    expect(prisma.contactBookHash.deleteMany).not.toHaveBeenCalledWith({
      where: { owner_id: 'me' },
    });
  });

  it('delta: numbers already stored / never stored do not move the hash', async () => {
    const base = bookHashOf([a, b]);
    const { svc } = make({
      setting: { book_hash: base, book_size: 2, matches_version: 0 },
      book: [a, b],
    });
    const out = await svc.sync('me', {
      baseHash: base,
      added: [a],
      removed: [c],
    });
    expect(out).toMatchObject({ bookHash: base, bookSize: 2 });
  });

  it('delta on a book the server does not have → resync, nothing written', async () => {
    const { svc, prisma } = make({
      setting: { book_hash: bookHashOf([a]), book_size: 1, matches_version: 0 },
    });
    const out = await svc.sync('me', {
      baseHash: bookHashOf([b]),
      added: [c],
    });
    expect(out.status).toBe('resync');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a delta needs baseHash; a bare request needs bookHash', async () => {
    const { svc } = make({ setting: null });
    await expect(svc.sync('me', { added: [a] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(svc.sync('me', {})).rejects.toMatchObject({ status: 400 });
  });

  it(`keeps at most ${CONTACT_BOOK_MAX} numbers per account`, async () => {
    const base = bookHashOf([a]);
    const { svc, prisma } = make({
      setting: {
        book_hash: base,
        book_size: CONTACT_BOOK_MAX,
        matches_version: 0,
      },
      book: [a],
    });
    await expect(
      svc.sync('me', { baseHash: base, added: [b] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a big book goes up in parts and is never locked out by the daily cap', async () => {
    expect(HASHES_PER_ACCOUNT_PER_DAY).toBeGreaterThanOrEqual(
      2 * CONTACT_BOOK_MAX,
    );
    const book = Array.from({ length: 15000 }, (_, i) => sha(`+2000${i}`));
    const first = make({ setting: null });
    const part1 = await first.svc.sync('me', {
      full: true,
      added: book.slice(0, CONTACT_HASHES_MAX),
    });
    const second = make({
      setting: {
        book_hash: part1.bookHash,
        book_size: CONTACT_HASHES_MAX,
        matches_version: 0,
      },
    });
    const part2 = await second.svc.sync('me', {
      baseHash: part1.bookHash!,
      added: book.slice(CONTACT_HASHES_MAX),
    });
    expect(part2).toMatchObject({
      bookHash: bookHashOf(book),
      bookSize: 15000,
    });
  });

  it('only removing numbers uses none of the daily cap', async () => {
    const base = bookHashOf([a, b]);
    const { svc, redis } = make({
      setting: { book_hash: base, book_size: 2, matches_version: 0 },
      book: [a, b],
    });
    await svc.sync('me', { baseHash: base, removed: [a] });
    expect(redis.pfadd).not.toHaveBeenCalled();
  });

  it('the hourly request limit applies to every call, even "not modified"', async () => {
    const h = bookHashOf([a]);
    const { svc, limits } = make({
      setting: { book_hash: h, book_size: 1, matches_version: 0 },
    });
    await svc.sync('me', { bookHash: h, matchesVersion: 0 });
    expect(limits.consume).toHaveBeenCalledWith('contacts_sync', 'me');
  });

  it('the «notify me» switch lives on the server and does not turn sync on', async () => {
    const { svc, prisma } = make();
    await svc.setNotifyJoined('me', false);
    expect(prisma.contactSyncSetting.upsert).toHaveBeenCalledWith({
      where: { user_id: 'me' },
      create: { user_id: 'me', enabled: false, notify_joined: false },
      update: { notify_joined: false },
    });
  });
});

describe('book hash', () => {
  it('is order-free and one XOR per change', () => {
    const [x, y, z] = ['1', '2', '3'].map(sha);
    expect(bookHashOf([x, y, z])).toBe(bookHashOf([z, x, y]));
    expect(xorBookHash(bookHashOf([x, y]), [z])).toBe(bookHashOf([x, y, z]));
    expect(xorBookHash(bookHashOf([x, y]), [y])).toBe(bookHashOf([x]));
    expect(bookHashOf([])).toBe(EMPTY_BOOK_HASH);
  });

  it('DTO: a bare "changed?" check is valid, a bad delta is not', async () => {
    const ok = await validate(
      plainToInstance(UploadContactHashesDto, {
        bookHash: sha('x'),
        matchesVersion: 2,
      }),
    );
    expect(ok).toHaveLength(0);
    const bad = await validate(
      plainToInstance(UploadContactHashesDto, {
        baseHash: 'nope',
        added: ['+1555'],
      }),
    );
    expect(bad).toHaveLength(2);
  });
});
