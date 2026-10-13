import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'node:crypto';
import {
  CONTACT_HASHES_MAX,
  UploadContactHashesDto,
} from './contacts-sync.dto';
import { ContactsSyncService } from './contacts-sync.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function make(
  over: {
    users?: { id: string }[];
    matches?: { matched_id: string }[];
    enabled?: boolean | null;
  } = {},
) {
  const tx: unknown[] = [];
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(over.users ?? []) },
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
  const redis = { del: jest.fn().mockResolvedValue(1) };
  const svc = new ContactsSyncService(
    prisma as never,
    limits as never,
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
      users: [{ id: 'u1' }, { id: 'u2' }],
    });
    const h = [sha('+1'), sha('+2'), sha('+1')];
    const out = await svc.upload('me', h);
    expect(out).toEqual({ matched: 2 });
    expect(limits.consume).toHaveBeenCalledWith('contacts_sync', 'me');
    // the lookup is by hash, duplicates removed, own account and
    // unverified or deleted accounts excluded
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.phone_sha256.in).toEqual([sha('+1'), sha('+2')]);
    expect(where.id).toEqual({ not: 'me' });
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
    expect(await svc.upload('me', [sha('x')])).toEqual({ matched: 0 });
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
    });
  });
});
