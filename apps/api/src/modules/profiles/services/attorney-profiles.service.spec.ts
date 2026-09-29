import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  AttorneyProfilesService,
  nextUsernameChangeAt,
} from './attorney-profiles.service';
import type { PracticeAreasService } from './practice-areas.service';
import type { FilesService } from '../../files/files.service';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-27T12:00:00Z');

describe('nextUsernameChangeAt (profile.username_change_cooldown_days)', () => {
  it('never changed -> can change now', () => {
    expect(nextUsernameChangeAt(null, 30, now)).toBeNull();
  });
  it('changed 10 days ago -> 20 days from now', () => {
    const changed = new Date(now.getTime() - 10 * DAY);
    expect(nextUsernameChangeAt(changed, 30, now)).toEqual(
      new Date(changed.getTime() + 30 * DAY),
    );
  });
  it('changed exactly 30 days ago -> can change now', () => {
    expect(
      nextUsernameChangeAt(new Date(now.getTime() - 30 * DAY), 30, now),
    ).toBeNull();
  });
});

describe('AttorneyProfilesService', () => {
  function setup(
    profile: Partial<{
      username: string;
      username_lower: string;
      username_changed_at: Date | null;
      verification_status: string;
    }> = {},
    holder: { user_id: string } | null = null,
  ) {
    const current = {
      user_id: 'me',
      username: 'anna.kim',
      username_lower: 'anna.kim',
      username_changed_at: null,
      verification_status: 'verified',
      user: { first_name: 'Anna', last_name: 'Kim' },
      ...profile,
    };
    const tx = {
      attorneyProfile: {
        findUnique: jest.fn((args: { where: Record<string, string> }) =>
          Promise.resolve('user_id' in args.where ? current : holder),
        ),
        update: jest.fn(() => Promise.resolve({})),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      user: { update: jest.fn() },
    };
    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            role: 'attorney',
            attorney_profile: { verification_status: 'verified' },
          }),
        ),
      },
      attorneyProfile: {
        findUnique: jest.fn((args: { where: Record<string, string> }) =>
          Promise.resolve('username_lower' in args.where ? holder : null),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const settings = {
      number: jest.fn(() => Promise.resolve(30)),
      stringList: jest.fn(() => Promise.resolve(['admin', 'LawBid'])),
    };
    const svc = new AttorneyProfilesService(
      prisma as unknown as PrismaService,
      settings as unknown as AppSettingsService,
      {} as PracticeAreasService,
      {} as FilesService,
      {} as never,
    );
    // getOwn is covered by e2e; here only the write path matters.
    jest.spyOn(svc, 'getOwn').mockResolvedValue({} as never);
    return { svc, tx, prisma };
  }

  it('rejects a second username change within 30 days', async () => {
    const { svc, tx } = setup({
      username_changed_at: new Date(now.getTime() - 5 * DAY),
    });
    await expect(
      svc.updateOwn('me', { username: 'anna.k' }, now),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: ErrorCode.USERNAME_CHANGE_TOO_SOON,
        details: {
          nextChangeAt: new Date(now.getTime() + 25 * DAY).toISOString(),
        },
      },
    });
    expect(tx.attorneyProfile.update).not.toHaveBeenCalled();
  });

  it('rejects a reserved username case-insensitively', async () => {
    const { svc } = setup();
    await expect(
      svc.updateOwn('me', { username: 'lawBID' }, now),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.USERNAME_RESERVED },
    });
  });

  it("rejects another attorney's username", async () => {
    const { svc } = setup({}, { user_id: 'other' });
    await expect(
      svc.updateOwn('me', { username: 'Taken.Name' }, now),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.USERNAME_TAKEN },
    });
  });

  it('first change after onboarding is allowed and stamps username_changed_at', async () => {
    const { svc, tx } = setup();
    await svc.updateOwn('me', { username: 'Anna.Law', bio: '' }, now);
    expect(tx.attorneyProfile.update).toHaveBeenCalledWith({
      where: { user_id: 'me' },
      data: {
        bio: null,
        username: 'Anna.Law',
        username_lower: 'anna.law',
        username_changed_at: now,
      },
    });
  });

  it('same username is a no-op, not a change', async () => {
    const { svc, tx } = setup({
      username_changed_at: new Date(now.getTime() - DAY),
    });
    await svc.updateOwn('me', { username: 'anna.kim' }, now);
    expect(tx.attorneyProfile.update).not.toHaveBeenCalled();
  });

  describe('availability', () => {
    it.each([
      ['ab', 'invalid'],
      ['.anna', 'invalid'],
      ['an..na', 'invalid'],
      ['ADMIN', 'reserved'],
    ])('%s -> %s', async (u, reason) => {
      const { svc } = setup();
      await expect(svc.availability(u, 'me')).resolves.toEqual({
        username: u,
        available: false,
        reason,
      });
    });

    it('taken by someone else vs. own username', async () => {
      await expect(
        setup({}, { user_id: 'other' }).svc.availability('x.y.z', 'me'),
      ).resolves.toMatchObject({ available: false, reason: 'taken' });
      await expect(
        setup({}, { user_id: 'me' }).svc.availability('x.y.z', 'me'),
      ).resolves.toMatchObject({ available: true, reason: null });
    });
  });

  describe('getPublic', () => {
    function withRow(row: Record<string, unknown> | null) {
      const prisma = {
        attorneyProfile: { findUnique: jest.fn(() => Promise.resolve(row)) },
        follow: { findUnique: jest.fn(() => Promise.resolve(null)) },
      };
      return new AttorneyProfilesService(
        prisma as unknown as PrismaService,
        {} as AppSettingsService,
        {
          selectedOf: jest.fn(() => Promise.resolve([])),
        } as unknown as PracticeAreasService,
        {
          avatarUrls: jest.fn((id: string | null) =>
            Promise.resolve(
              id
                ? { url: 'http://signed/a', url256: 'http://signed/a_w256' }
                : { url: null, url256: null },
            ),
          ),
        } as unknown as FilesService,
        { pending: jest.fn(() => Promise.resolve(new Map())) } as never,
      );
    }
    const base = {
      user_id: 'a',
      username: 'Saul',
      bio: null,
      firm_name: null,
      languages: ['en'],
      verification_status: 'verified',
      rating_avg: '4.50',
      rating_count: 2,
      posts_count: 1,
      followers_count: 3,
      following_count: 4,
      user: {
        role: 'attorney',
        status: 'active',
        deleted_at: null,
        first_name: 'Saul',
        last_name: 'Goodman',
        avatar_file_id: 'f1',
      },
      licenses: [{ state: { code: 'NJ', name: 'New Jersey' } }],
    };

    it('shows the badge and verified states only, no bar number', async () => {
      const view = await withRow(base).getPublic('saul', 'viewer');
      expect(view).toMatchObject({
        verifiedBadge: true,
        licensedStates: [{ code: 'NJ', name: 'New Jersey' }],
        rating: { avg: 4.5, count: 2 },
        isSelf: false,
        avatarUrl: 'http://signed/a',
        avatarUrl256: 'http://signed/a_w256',
      });
      expect(JSON.stringify(view)).not.toMatch(/bar|document|phone|email/i);
    });

    it('unverified: no badge', async () => {
      const view = await withRow({
        ...base,
        verification_status: 'unverified',
        licenses: [],
      }).getPublic('saul', 'a');
      expect(view.verifiedBadge).toBe(false);
      expect(view.isSelf).toBe(true);
    });

    it.each([
      ['suspended profile', { ...base, verification_status: 'suspended' }],
      [
        'blocked account',
        { ...base, user: { ...base.user, status: 'suspended' } },
      ],
      ['deleted account', { ...base, user: { ...base.user, deleted_at: now } }],
      ['unknown', null],
    ])('%s -> 404', async (_label, row) => {
      await expect(
        withRow(row as Record<string, unknown> | null).getPublic('saul', 'x'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('malformed username -> 404 without a query', async () => {
      await expect(withRow(base).getPublic('a', 'x')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
