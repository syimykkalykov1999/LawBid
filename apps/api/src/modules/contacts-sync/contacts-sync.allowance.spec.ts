import { createHash } from 'node:crypto';
import { ContactsPepper } from './contacts-pepper';
import {
  ContactsSyncService,
  NEW_NUMBERS_PER_DAY,
} from './contacts-sync.service';

/**
 * Security audit 2026-11-08 (L4): attorneys are always findable by number,
 * so a verified account could test ~40,000 new numbers EVERY day through
 * POST /contacts/sync. Now the big allowance is one "book day" per 30 days;
 * other days allow NEW_NUMBERS_PER_DAY new numbers, and numbers already in
 * the stored book are never counted.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const nums = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => sha(`+1202555${from + i}`));

function make(opts: { book?: string[]; bookDayTakenOn?: string } = {}) {
  const book = new Set(opts.book ?? []);
  const kv = new Map<string, string>();
  if (opts.bookDayTakenOn) kv.set('contacts:book-day:u:me', opts.bookDayTakenOn);
  const sets = new Map<string, Set<string>>();
  const redis = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    expire: jest.fn().mockResolvedValue(1),
    pfadd: jest.fn((key: string, ...items: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      sets.set(key, set);
      items.forEach((i) => set.add(i));
      return Promise.resolve(1);
    }),
    pfcount: jest.fn((key: string) => Promise.resolve(sets.get(key)?.size ?? 0)),
  };
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    contactMatch: { createMany: jest.fn(() => ({ op: 'm' })) },
    contactSyncSetting: {
      upsert: jest.fn(() => ({ op: 'u' })),
      findUnique: jest.fn().mockResolvedValue({ book_size: book.size }),
      update: jest.fn().mockResolvedValue({}),
    },
    contactBookHash: {
      findMany: jest.fn(
        (a: { where: { OR: { phone_hash: { in: string[] } }[] } }) =>
          Promise.resolve(
            [...book]
              .filter((h) => a.where.OR.some((o) => o.phone_hash.in.includes(h)))
              .map((h) => ({ phone_hash: h })),
          ),
      ),
      createMany: jest.fn((a: { data: { phone_hash: string }[] }) => {
        a.data.forEach((d) => book.add(d.phone_hash));
        return Promise.resolve({ count: a.data.length });
      }),
    },
    $transaction: jest.fn(() => Promise.resolve([])),
  };
  const svc = new ContactsSyncService(
    prisma as never,
    { consume: jest.fn().mockResolvedValue(undefined) } as never,
    { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) } as never,
    redis as never,
    new ContactsPepper({ get: () => undefined } as never),
  );
  return { svc, prisma };
}

describe('contacts sync daily allowance (audit 2026-11-08 L4)', () => {
  it('the first sync takes a whole book (the book day)', async () => {
    const { svc } = make();
    await expect(svc.upload('me', nums(5000))).resolves.toBeDefined();
    // The same day stays a book day.
    await expect(svc.upload('me', nums(10, 5000))).resolves.toBeDefined();
  });

  it('after the book day, more than the daily trickle of NEW numbers is refused', async () => {
    const { svc, prisma } = make({ bookDayTakenOn: '2000-01-01' });
    await expect(
      svc.upload('me', nums(NEW_NUMBERS_PER_DAY + 1)),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('a few new contacts a day still go through', async () => {
    const { svc } = make({ bookDayTakenOn: '2000-01-01' });
    await expect(
      svc.upload('me', nums(NEW_NUMBERS_PER_DAY - 1)),
    ).resolves.toBeDefined();
  });

  it('numbers already in the stored book are not counted (re-sync, old builds, reinstall)', async () => {
    const stored = nums(5000);
    const { svc } = make({ book: stored, bookDayTakenOn: '2000-01-01' });
    await expect(svc.upload('me', stored)).resolves.toBeDefined();
    await expect(
      svc.upload('me', [...stored, ...nums(5, 9000)]),
    ).resolves.toBeDefined();
  });
});
