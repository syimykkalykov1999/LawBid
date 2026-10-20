import { ForbiddenException } from '@nestjs/common';
import { PrivacySettingsService } from './privacy-settings.service';

type Row = { user_id: string; last_seen: string };

function make(opts: {
  settings?: Record<
    string,
    { last_seen: string; message_from: string; call_from: string }
  >;
  book?: [string, string][];
  follows?: [string, string][];
}) {
  const settings = opts.settings ?? {};
  const book = opts.book ?? [];
  const follows = opts.follows ?? [];
  const prisma = {
    userPrivacySettings: {
      findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(
          settings[where.user_id]
            ? { user_id: where.user_id, ...settings[where.user_id] }
            : null,
        ),
      ),
      findMany: jest.fn(({ where }: { where: { user_id: { in: string[] } } }) =>
        Promise.resolve(
          where.user_id.in
            .filter((id) => settings[id])
            .map((id): Row => ({
              user_id: id,
              last_seen: settings[id].last_seen,
            })),
        ),
      ),
    },
    contactMatch: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            owner_id_matched_id: { owner_id: string; matched_id: string };
          };
        }) => {
          const k = where.owner_id_matched_id;
          return Promise.resolve(
            book.some(([o, m]) => o === k.owner_id && m === k.matched_id)
              ? { owner_id: k.owner_id }
              : null,
          );
        },
      ),
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
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            follower_id_followee_id: {
              follower_id: string;
              followee_id: string;
            };
          };
        }) => {
          const k = where.follower_id_followee_id;
          return Promise.resolve(
            follows.some(([f, e]) => f === k.follower_id && e === k.followee_id)
              ? { follower_id: k.follower_id }
              : null,
          );
        },
      ),
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { followee_id: string; follower_id: { in: string[] } };
        }) =>
          Promise.resolve(
            follows
              .filter(
                ([f, e]) =>
                  e === where.followee_id && where.follower_id.in.includes(f),
              )
              .map(([f]) => ({ follower_id: f })),
          ),
      ),
    },
  };
  return new PrivacySettingsService(prisma as never);
}

const mine = (
  messageFrom: string,
  callFrom = 'everyone',
  lastSeen = 'everyone',
) => ({
  last_seen: lastSeen,
  message_from: messageFrom,
  call_from: callFrom,
});

describe('PrivacySettingsService (owner 2026-10-20)', () => {
  it('everyone is the default for a person who never opened the screen', async () => {
    const s = make({});
    await expect(s.get('a')).resolves.toEqual({
      lastSeen: 'everyone',
      messageFrom: 'everyone',
      callFrom: 'everyone',
    });
    await expect(s.assertAllowed('x', 'a', 'message')).resolves.toBeUndefined();
  });

  it('nobody refuses a new chat and a call with PRIVACY_RESTRICTED', async () => {
    const s = make({ settings: { a: mine('nobody', 'nobody') } });
    await expect(s.assertAllowed('x', 'a', 'message')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(s.assertAllowed('x', 'a', 'call')).rejects.toMatchObject({
      response: { code: 'PRIVACY_RESTRICTED', details: { what: 'call' } },
    });
  });

  it('contacts: the address book and people I follow pass, strangers do not', async () => {
    const s = make({
      settings: { a: mine('contacts', 'contacts') },
      book: [['a', 'friend']],
      follows: [['a', 'followed']],
    });
    await expect(
      s.assertAllowed('friend', 'a', 'message'),
    ).resolves.toBeUndefined();
    await expect(
      s.assertAllowed('followed', 'a', 'call'),
    ).resolves.toBeUndefined();
    await expect(
      s.assertAllowed('stranger', 'a', 'message'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The relation is one-way: a's own address book decides, not the other's.
    await expect(
      s.assertAllowed('a-fan', 'a', 'message'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a person is always allowed to reach themselves', async () => {
    const s = make({ settings: { a: mine('nobody') } });
    await expect(s.assertAllowed('a', 'a', 'message')).resolves.toBeUndefined();
  });

  it('last seen is shown to everyone, contacts only, or nobody', async () => {
    const s = make({
      settings: {
        open: mine('everyone'),
        closed: mine('everyone', 'everyone', 'nobody'),
        half: mine('everyone', 'everyone', 'contacts'),
        half2: mine('everyone', 'everyone', 'contacts'),
      },
      book: [['half', 'viewer']],
    });
    const visible = await s.lastSeenVisibleTo('viewer', [
      'open',
      'closed',
      'half',
      'half2',
      'unknown',
    ]);
    expect([...visible].sort()).toEqual(['half', 'open', 'unknown']);
  });
});
