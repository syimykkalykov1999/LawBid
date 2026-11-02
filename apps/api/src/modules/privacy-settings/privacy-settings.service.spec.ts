import { ForbiddenException } from '@nestjs/common';
import {
  effectiveMask,
  legacyFromMask,
  maskFromLegacy,
  maskFromOptions,
  optionsFromMask,
} from './privacy-audience';
import {
  PRIVACY_FIELDS,
  type PrivacyField,
  PrivacySettingsService,
} from './privacy-settings.service';

type Row = Record<string, unknown> & { user_id: string };

/** In-memory prisma: settings rows, phone books (owner → matched), follows
 * (follower → followee). Counts queries to prove there is no N+1. */
function make(
  opts: {
    settings?: Record<string, Record<string, unknown>>;
    book?: [string, string][];
    follows?: [string, string][];
  } = {},
) {
  const settings: Record<string, Row> = {};
  for (const [id, r] of Object.entries(opts.settings ?? {})) {
    settings[id] = { user_id: id, ...r };
  }
  const book = opts.book ?? [];
  const follows = opts.follows ?? [];
  const pick = (r: Row, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r;
  const prisma = {
    userConsent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    user: { update: jest.fn() },
    userPrivacySettings: {
      findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(settings[where.user_id] ?? null),
      ),
      findMany: jest.fn(
        ({
          where,
          select,
        }: {
          where: { user_id: { in: string[] } };
          select: Record<string, boolean>;
        }) =>
          Promise.resolve(
            where.user_id.in
              .filter((id) => settings[id])
              .map((id) => pick(settings[id], select)),
          ),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { user_id: string };
          create: Row;
          update: Record<string, unknown>;
        }) => {
          settings[where.user_id] = settings[where.user_id]
            ? { ...settings[where.user_id], ...update }
            : { ...create };
          return Promise.resolve(settings[where.user_id]);
        },
      ),
    },
    contactMatch: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { matched_id: string; owner_id: { in: string[] } };
        }) =>
          Promise.resolve(
            book
              .filter(
                ([o, m]) =>
                  m === where.matched_id && where.owner_id.in.includes(o),
              )
              .map(([o]) => ({ owner_id: o })),
          ),
      ),
    },
    follow: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where:
            | { follower_id: string; followee_id: { in: string[] } }
            | { followee_id: string; follower_id: { in: string[] } };
        }) => {
          if (typeof where.follower_id === 'string') {
            const w = where as {
              follower_id: string;
              followee_id: { in: string[] };
            };
            return Promise.resolve(
              follows
                .filter(
                  ([f, e]) =>
                    f === w.follower_id && w.followee_id.in.includes(e),
                )
                .map(([, e]) => ({ followee_id: e })),
            );
          }
          const w = where as {
            followee_id: string;
            follower_id: { in: string[] };
          };
          return Promise.resolve(
            follows
              .filter(
                ([f, e]) => e === w.followee_id && w.follower_id.in.includes(f),
              )
              .map(([f]) => ({ follower_id: f })),
          );
        },
      ),
    },
  };
  const db = {
    ...prisma,
    $transaction: jest.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
    ),
  };
  return {
    s: new PrivacySettingsService(db as never),
    prisma,
    settings,
  };
}

const COLUMN: Record<PrivacyField, string> = {
  lastSeen: 'last_seen',
  messageFrom: 'message_from',
  callFrom: 'call_from',
  photoFrom: 'photo_from',
  aboutFrom: 'about_from',
  groupAddFrom: 'group_add_from',
};

/** Owner 'a' with one setting = [mask]; legacy column kept in step. */
const ownerWith = (field: PrivacyField, mask: number) => ({
  [COLUMN[field]]: legacyFromMask(mask),
  [`${COLUMN[field]}_mask`]: mask,
});

/** Viewers: 'book' is in a's phone book, 'fan' follows a, 'idol' is
 * followed by a, 'stranger' is none of those. */
const WORLD = {
  book: [['a', 'book']] as [string, string][],
  follows: [
    ['fan', 'a'],
    ['a', 'idol'],
  ] as [string, string][],
};
const VIEWERS = ['book', 'fan', 'idol', 'stranger'] as const;

const CASES: [string, number, (typeof VIEWERS)[number][]][] = [
  ['everyone', 8, ['book', 'fan', 'idol', 'stranger']],
  ['contacts', 1, ['book']],
  ['followers', 2, ['fan']],
  ['following', 4, ['idol']],
  ['followers + following', 6, ['fan', 'idol']],
  ['nobody', 0, []],
];

async function canUse(
  s: PrivacySettingsService,
  field: PrivacyField,
  viewer: string,
): Promise<boolean> {
  switch (field) {
    case 'messageFrom':
      return s.allows(viewer, 'a', 'message');
    case 'callFrom':
      return s.allows(viewer, 'a', 'call');
    case 'groupAddFrom':
      return s.allows(viewer, 'a', 'group');
    case 'lastSeen':
      return (await s.lastSeenVisibleTo(viewer, ['a'])).has('a');
    case 'photoFrom':
      return (await s.visibleTo(viewer, ['a'], 'photo_from')).has('a');
    case 'aboutFrom':
      return (await s.visibleTo(viewer, ['a'], 'about_from')).has('a');
  }
}

describe('privacy audience masks', () => {
  it('maps the old «contacts» to phone book OR following (no lost access)', () => {
    expect(maskFromLegacy('contacts')).toBe(1 | 4);
    expect(maskFromLegacy('everyone')).toBe(8);
    expect(maskFromLegacy('nobody')).toBe(0);
  });

  it('round-trips sets and keeps the closest old value', () => {
    expect(
      optionsFromMask(maskFromOptions(['followers', 'following'])),
    ).toEqual(['followers', 'following']);
    expect(optionsFromMask(maskFromOptions(['everyone', 'contacts']))).toEqual([
      'everyone',
    ]);
    expect(optionsFromMask(maskFromOptions(['nobody']))).toEqual(['nobody']);
    expect(legacyFromMask(2)).toBe('contacts');
    expect(legacyFromMask(0)).toBe('nobody');
    expect(legacyFromMask(8)).toBe('everyone');
  });

  it('reads the old column when no mask, or when an older build changed it', () => {
    expect(effectiveMask(null, 'contacts')).toBe(5);
    expect(effectiveMask(2, 'contacts')).toBe(2);
    // An N-1 build switched the old column to «nobody» after us.
    expect(effectiveMask(2, 'nobody')).toBe(0);
    expect(effectiveMask(undefined, undefined)).toBe(8);
  });
});

describe('PrivacySettingsService', () => {
  describe.each(PRIVACY_FIELDS)('%s', (field) => {
    it.each(CASES)('audience %s', async (_name, mask, allowed) => {
      const { s } = make({
        settings: { a: ownerWith(field, mask) },
        ...WORLD,
      });
      for (const v of VIEWERS) {
        expect([v, await canUse(s, field, v)]).toEqual([
          v,
          allowed.includes(v),
        ]);
      }
      // The owner always passes their own setting.
      expect(await canUse(s, field, 'a')).toBe(true);
    });

    it('migrated old «contacts» row: book and people I follow, not fans', async () => {
      const { s } = make({
        settings: { a: { [COLUMN[field]]: 'contacts' } },
        ...WORLD,
      });
      expect(await canUse(s, field, 'book')).toBe(true);
      expect(await canUse(s, field, 'idol')).toBe(true);
      expect(await canUse(s, field, 'fan')).toBe(false);
      expect(await canUse(s, field, 'stranger')).toBe(false);
    });
  });

  it('no settings row = everyone', async () => {
    const { s } = make(WORLD);
    await expect(s.assertAllowed('stranger', 'a', 'call')).resolves.toBe(
      undefined,
    );
  });

  it('refuses with PRIVACY_RESTRICTED', async () => {
    const { s } = make({
      settings: { a: ownerWith('messageFrom', 2) },
      ...WORLD,
    });
    await expect(
      s.assertAllowed('stranger', 'a', 'message'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      s.assertAllowed('stranger', 'a', 'message'),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_RESTRICTED' },
    });
  });

  it('asks only about the relations the set needs', async () => {
    const { s, prisma } = make({
      settings: { a: ownerWith('callFrom', 2) },
      ...WORLD,
    });
    await s.allows('fan', 'a', 'call');
    expect(prisma.contactMatch.findMany).not.toHaveBeenCalled();
    expect(prisma.follow.findMany).toHaveBeenCalledTimes(1);
  });

  it('a whole list costs a fixed number of queries (no N+1)', async () => {
    const owners = Array.from({ length: 50 }, (_, i) => `o${i}`);
    const settings: Record<string, Record<string, unknown>> = {};
    owners.forEach(
      (o, i) => (settings[o] = ownerWith('lastSeen', [1, 2, 4][i % 3])),
    );
    const { s, prisma } = make({
      settings,
      book: [['o0', 'v']],
      follows: [
        ['v', 'o1'],
        ['o2', 'v'],
      ],
    });
    const seen = await s.lastSeenVisibleTo('v', owners);
    expect([...seen].sort()).toEqual(['o0', 'o1', 'o2']);
    expect(prisma.userPrivacySettings.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.contactMatch.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.follow.findMany).toHaveBeenCalledTimes(2);
  });

  it('allowsMany batches group adds', async () => {
    const { s } = make({
      settings: {
        a: ownerWith('groupAddFrom', 2),
        b: ownerWith('groupAddFrom', 0),
      },
      follows: [['x', 'a']],
    });
    expect([...(await s.allowsMany('x', ['a', 'b', 'c'], 'group'))]).toEqual([
      'a',
      'c',
    ]);
  });

  describe('update', () => {
    it('stores a set and the closest old value', async () => {
      const { s, settings, prisma } = make();
      const out = await s.update('a', {
        lastSeenAudiences: ['followers', 'following'],
      });
      expect(settings.a.last_seen_mask).toBe(6);
      expect(settings.a.last_seen).toBe('contacts');
      expect(out.lastSeen).toBe('contacts');
      expect(out.lastSeenAudiences).toEqual(['followers', 'following']);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { show_activity_status: true },
      });
    });

    it('an old build’s «contacts» keeps its old meaning', async () => {
      const { s, settings } = make();
      const out = await s.update('a', { callFrom: 'contacts' });
      expect(settings.a.call_from_mask).toBe(5);
      expect(out.callFromAudiences).toEqual(['contacts', 'following']);
    });

    it('the set wins over the single value', async () => {
      const { s, settings } = make();
      await s.update('a', {
        photoFrom: 'everyone',
        photoFromAudiences: ['nobody'],
      });
      expect(settings.a.photo_from_mask).toBe(0);
      expect(settings.a.photo_from).toBe('nobody');
    });

    it('nobody for last seen turns the activity switch off', async () => {
      const { s, prisma } = make();
      await s.update('a', { lastSeenAudiences: ['nobody'] });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { show_activity_status: false },
      });
    });

    it('get() of a pre-migration row answers both shapes', async () => {
      const { s } = make({ settings: { a: { message_from: 'contacts' } } });
      const g = await s.get('a');
      expect(g.messageFrom).toBe('contacts');
      expect(g.messageFromAudiences).toEqual(['contacts', 'following']);
      expect(g.callFromAudiences).toEqual(['everyone']);
    });
  });
});
